using Microsoft.Data.Sqlite;
using ProductionLineSim.Classes;
using ProductionLineSim.Enums;
using ProductionLineSim.Enums.EnumExtensions;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ProductionLineSim.Services
{
    public class SqliteStore(string connectionString, ILogger<SqliteStore> logger)
    {
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
        public SqliteConnection OpenConnection()
        {
            var connection = new SqliteConnection(connectionString);
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;";
            command.ExecuteNonQuery();
            return connection;
        }

        /// <summary>Creates the database schema, recovers interrupted work, and seeds sample records.</summary>
        public async Task InitializeAsync(CancellationToken cancellationToken = default)
        {
            await using var connection = OpenConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = """
            CREATE TABLE IF NOT EXISTS ProductionLines (
                KeyId INTEGER PRIMARY KEY AUTOINCREMENT,
                Id TEXT NOT NULL UNIQUE,
                Name TEXT NOT NULL,
                Status TEXT NOT NULL,
                StatusUpdatedAtUtc TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS IngestionMessages (
                KeyId INTEGER PRIMARY KEY AUTOINCREMENT,
                Id TEXT NOT NULL UNIQUE,
                SourceEventId TEXT NOT NULL UNIQUE,
                PayloadJson TEXT NOT NULL,
                PayloadHash TEXT NOT NULL,
                Status TEXT NOT NULL CHECK (Status IN ('Pending','Processing','Processed','Failed')),
                AttemptCount INTEGER NOT NULL DEFAULT 0,
                CreatedAtUtc TEXT NOT NULL,
                LastAttemptedAtUtc TEXT,
                NextAttemptAtUtc TEXT,
                LastError TEXT,
                ProcessedAtUtc TEXT,
                FailureMode TEXT
            );
            CREATE INDEX IF NOT EXISTS IX_IngestionMessages_Status_Created ON IngestionMessages(Status, CreatedAtUtc);
            CREATE TABLE IF NOT EXISTS DowntimeEvents (
                KeyId INTEGER PRIMARY KEY AUTOINCREMENT,
                Id TEXT NOT NULL UNIQUE,
                SourceEventId TEXT NOT NULL UNIQUE,
                LineId TEXT NOT NULL REFERENCES ProductionLines(Id),
                Reason TEXT NOT NULL CHECK (Reason IN ('Down','Starved','Blocked')),
                StartedAtUtc TEXT NOT NULL,
                EndedAtUtc TEXT,
                ReceivedAtUtc TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS IX_DowntimeEvents_Line_Start ON DowntimeEvents(LineId, StartedAtUtc);
            UPDATE IngestionMessages SET Status = 'Pending', LastError = 'Recovered after application restart.' WHERE Status = 'Processing';
            """;
            await command.ExecuteNonQueryAsync(cancellationToken);
            await SeedAsync(connection, cancellationToken);
        }

        private static async Task SeedAsync(SqliteConnection connection,CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;

            await using var transaction =
                (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);

            var lines = new[]
            {
                new ProductionLine
                {
                    Id = "line-1",
                    Name = "Filling Line 01",
                    Status = ProductionLineStatus.Running,
                    StatusUpdatedAtUtc = now.AddMinutes(-12)
                },
                new ProductionLine
                {
                    Id = "line-2",
                    Name = "Packaging Line 02",
                    Status = ProductionLineStatus.Down,
                    StatusUpdatedAtUtc = now.AddMinutes(-8)
                },
                new ProductionLine
                {
                    Id = "line-3",
                    Name = "Assembly Line 03",
                    Status = ProductionLineStatus.Starved,
                    StatusUpdatedAtUtc = now.AddMinutes(-4)
                }
            };

            foreach (var line in lines)
            {
                await using var command = connection.CreateCommand();
                command.Transaction = transaction;
                command.CommandText = """
                    INSERT OR IGNORE INTO ProductionLines
                        (Id, Name, Status, StatusUpdatedAtUtc)
                    VALUES
                        ($id, $name, $status, $updated);
                    """;
                command.Parameters.AddWithValue("$id", line.Id);
                command.Parameters.AddWithValue("$name", line.Name);
                command.Parameters.AddWithValue("$status", EnumExtensions.GetDisplayName(line.Status));
                command.Parameters.AddWithValue("$updated", Format(line.StatusUpdatedAtUtc));

                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            var samples = new[]
            {
                ("sample-l1-down", "line-1", EnumExtensions.GetDisplayName(ProductionLineStatus.Down),
                    now.AddHours(-5), now.AddHours(-4).AddMinutes(-42)),
                ("sample-l1-starved", "line-1", EnumExtensions.GetDisplayName(ProductionLineStatus.Starved),
                    now.AddHours(-3), now.AddHours(-2).AddMinutes(-35)),
                ("sample-l1-blocked", "line-1", EnumExtensions.GetDisplayName(ProductionLineStatus.Blocked),
                    now.AddHours(-1), now.AddHours(-1).AddMinutes(18)),
                ("sample-l2-down", "line-2", EnumExtensions.GetDisplayName(ProductionLineStatus.Down),
                    now.AddHours(-2), now.AddHours(-1).AddMinutes(-20)),
                ("sample-l2-blocked", "line-2", EnumExtensions.GetDisplayName(ProductionLineStatus.Blocked),
                    now.AddMinutes(-48), now.AddMinutes(-30)),
                ("sample-l3-starved", "line-3", EnumExtensions.GetDisplayName(ProductionLineStatus.Starved),
                    now.AddHours(-4), now.AddHours(-3).AddMinutes(-45)),
                ("sample-l3-down", "line-3", EnumExtensions.GetDisplayName(ProductionLineStatus.Down),
                    now.AddMinutes(-25), (DateTimeOffset?)null)
            };

            foreach (var sample in samples)
            {
                await using var command = connection.CreateCommand();
                command.Transaction = transaction;
                command.CommandText = """
                    INSERT OR IGNORE INTO DowntimeEvents
                        (Id, SourceEventId, LineId, Reason, StartedAtUtc, EndedAtUtc, ReceivedAtUtc)
                    VALUES
                        ($id, $source, $line, $reason, $start, $end, $received);
                    """;
                command.Parameters.AddWithValue("$id", GuidFrom(sample.Item1).ToString());
                command.Parameters.AddWithValue("$source", sample.Item1);
                command.Parameters.AddWithValue("$line", sample.Item2);
                command.Parameters.AddWithValue("$reason", sample.Item3);
                command.Parameters.AddWithValue("$start", Format(sample.Item4));
                command.Parameters.AddWithValue(
                    "$end",
                    sample.Item5 is DateTimeOffset end ? Format(end) : DBNull.Value);
                command.Parameters.AddWithValue("$received", Format(now));

                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);
        }

        /// <summary>Returns all production lines ordered by their identifiers.</summary>
        public async Task<List<ProductionLine>> GetProductionLinesAsync(CancellationToken cancellationToken)
        {
            var result = new List<ProductionLine>();
            await using var connection = OpenConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id,Name,Status,StatusUpdatedAtUtc FROM ProductionLines ORDER BY Id;";
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                result.Add(new ProductionLine
                {
                    Id = reader.GetString(0),
                    Name = reader.GetString(1),
                    Status = EnumExtensions.ParseDisplayName(reader.GetString(2)),
                    StatusUpdatedAtUtc = Parse(reader.GetString(3)),
                });
            return result;
        }

        /// <summary>Checks whether a production line with the specified identifier exists.</summary>
        public async Task<bool> LineExistsAsync(string lineId, CancellationToken cancellationToken)
        {
            await using var connection = OpenConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT EXISTS(SELECT 1 FROM ProductionLines WHERE Id=$id);";
            command.Parameters.AddWithValue("$id", lineId);
            return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture) == 1;
        }

        /// <summary>Loads events overlapping the requested interval and calculates the downtime report.</summary>
        public async Task<DowntimeReport> GetDowntimeAsync(string lineId, DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken)
        {
            var events = new List<DowntimeEvent>();
            await using var connection = OpenConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id,SourceEventId,Reason,StartedAtUtc,EndedAtUtc FROM DowntimeEvents WHERE LineId=$line AND StartedAtUtc < $to AND (EndedAtUtc IS NULL OR EndedAtUtc > $from) ORDER BY StartedAtUtc DESC;";
            command.Parameters.AddWithValue("$line", lineId);
            command.Parameters.AddWithValue("$from", Format(from));
            command.Parameters.AddWithValue("$to", Format(to));
            await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            {
                while (await reader.ReadAsync(cancellationToken))
                {
                    events.Add(new DowntimeEvent
                    {
                        Id = Guid.Parse(reader.GetString(0)),
                        SourceEventId = reader.GetString(1),
                        Reason = reader.GetString(2),
                        StartedAtUtc = Parse(reader.GetString(3)),
                        EndedAtUtc = reader.IsDBNull(4) ? null : Parse(reader.GetString(4))
                    });
                }
            }
            return DowntimeCalculator.Calculate(lineId, from, to, events, DateTimeOffset.UtcNow);
        }

        public async Task<Tuple<MachineEventResponse?, bool>> EnqueueAsync(MachineEventRequest request, string? failureMode, CancellationToken cancellationToken)
        {
            var normalized = new MachineEventRequest
            {
                SourceEventId = request.SourceEventId.Trim(),
                LineId = request.LineId.Trim(),
                Reason = request.Reason.Trim(),
                StartedAtUtc = request.StartedAtUtc.ToUniversalTime(),
                EndedAtUtc = request.EndedAtUtc?.ToUniversalTime()
            };
            var canonical = JsonSerializer.Serialize(normalized, JsonOptions);
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
            var newId = Guid.NewGuid();
            try
            {
                await using var connection = OpenConnection();
                await using var command = connection.CreateCommand();
                command.CommandText = "INSERT INTO IngestionMessages(Id,SourceEventId,PayloadJson,PayloadHash,Status,CreatedAtUtc,FailureMode) VALUES($id,$source,$payload,$hash,'Pending',$created,$failure);";
                command.Parameters.AddWithValue("$id", newId.ToString());
                command.Parameters.AddWithValue("$source", normalized.SourceEventId);
                command.Parameters.AddWithValue("$payload", canonical);
                command.Parameters.AddWithValue("$hash", hash);
                command.Parameters.AddWithValue("$created", Format(DateTimeOffset.UtcNow));
                command.Parameters.AddWithValue("$failure", (object?)failureMode ?? DBNull.Value);
                await command.ExecuteNonQueryAsync(cancellationToken);
                logger.LogInformation("Accepted ingestion message {MessageId} for source event {SourceEventId}", newId, normalized.SourceEventId);
                return Tuple.Create<MachineEventResponse?, bool>(new MachineEventResponse { MessageId = newId, SourceEventId = normalized.SourceEventId, Status = MessageStatus.Pending, IsDuplicate = false }, false);
            }
            catch (SqliteException exception) when (exception.SqliteErrorCode == 19)
            {
                var prior = await FindBySourceEventIdAsync(normalized.SourceEventId, cancellationToken);
                if (prior is null) throw;
                if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(prior.Value.Hash), Convert.FromHexString(hash)))
                    return Tuple.Create<MachineEventResponse?, bool>(null, true);
                logger.LogInformation("Detected duplicate ingestion for source event {SourceEventId}", normalized.SourceEventId);
                return Tuple.Create<MachineEventResponse?, bool>(new MachineEventResponse { MessageId = prior.Value.Id, SourceEventId = normalized.SourceEventId, Status = Enum.Parse<MessageStatus>(prior.Value.Status), IsDuplicate = true }, false);
            }
        }

        /// <summary>Finds an existing queue message by its source event identifier.</summary>
        private async Task<(Guid Id, string Hash, string Status)?> FindBySourceEventIdAsync(string sourceEventId, CancellationToken cancellationToken)
        {
            await using var connection = OpenConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id,PayloadHash,Status FROM IngestionMessages WHERE SourceEventId=$source;";
            command.Parameters.AddWithValue("$source", sourceEventId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? (Guid.Parse(reader.GetString(0)), reader.GetString(1), reader.GetString(2)) : null;
        }

        /// <summary>Returns message counts by state and the most recent queue messages.</summary>
        public async Task<IngestionHealth> GetHealthAsync(CancellationToken cancellationToken)
        {
            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var recent = new List<IngestionMessage>();
            await using var connection = OpenConnection();
            await using (var command = connection.CreateCommand())
            {
                command.CommandText = "SELECT Status,COUNT(*) FROM IngestionMessages GROUP BY Status;";
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken)) counts[reader.GetString(0)] = reader.GetInt32(1);
            }
            await using (var command = connection.CreateCommand())
            {
                command.CommandText = "SELECT Id,SourceEventId,Status,AttemptCount,CreatedAtUtc,LastAttemptedAtUtc,LastError,ProcessedAtUtc FROM IngestionMessages ORDER BY CreatedAtUtc DESC LIMIT 12;";
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken)) recent.Add(ReadMessage(reader));
            }
            return new IngestionHealth { Pending = counts.GetValueOrDefault("Pending"), Processing = counts.GetValueOrDefault("Processing"), Processed = counts.GetValueOrDefault("Processed"), Failed = counts.GetValueOrDefault("Failed"), RecentMessages = recent };
        }

        /// <summary>Finds one ingestion message by its internal identifier.</summary>
        public async Task<IngestionMessage?> GetMessageAsync(Guid id, CancellationToken cancellationToken)
        {
            await using var connection = OpenConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id,SourceEventId,Status,AttemptCount,CreatedAtUtc,LastAttemptedAtUtc,LastError,ProcessedAtUtc FROM IngestionMessages WHERE Id=$id;";
            command.Parameters.AddWithValue("$id", id.ToString());
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? ReadMessage(reader) : null;
        }

        /// <summary>Returns ingestion messages in the requested supported queue state.</summary>
        public async Task<List<IngestionMessage>> GetMessagesByStatusAsync(string status, CancellationToken cancellationToken)
        {
            string[] supportedStatuses = { MessageStatus.Pending.GetDisplayName(), MessageStatus.Processing.GetDisplayName(), MessageStatus.Processed.GetDisplayName(), MessageStatus.Failed.GetDisplayName() };
            var normalizedStatus = supportedStatuses.FirstOrDefault(
                supported => supported.Equals(status, StringComparison.OrdinalIgnoreCase));
            if (normalizedStatus is null)
                throw new ArgumentException($"Status must be {string.Join(", ", supportedStatuses)}.", nameof(status));

            var items = new List<IngestionMessage>();
            await using var connection = OpenConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT Id,SourceEventId,Status,AttemptCount,CreatedAtUtc,LastAttemptedAtUtc,LastError,ProcessedAtUtc FROM IngestionMessages WHERE Status=$status ORDER BY CreatedAtUtc DESC;";
            command.Parameters.AddWithValue("$status", normalizedStatus);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) items.Add(ReadMessage(reader));
            return items;
        }

        /// <summary>Maps the current SQLite reader row to an ingestion-message.</summary>
        private static IngestionMessage ReadMessage(SqliteDataReader reader)
        {
            return new IngestionMessage
            {
                MessageId = Guid.Parse(reader.GetString(0)),
                SourceEventId = reader.GetString(1),
                Status = reader.GetString(2),
                AttemptCount = reader.GetInt32(3),
                CreatedAtUtc = Parse(reader.GetString(4)),
                LastAttemptedAtUtc = reader.IsDBNull(5) ? null : Parse(reader.GetString(5)),
                LastError = reader.IsDBNull(6) ? null : reader.GetString(6),
                ProcessedAtUtc = reader.IsDBNull(7) ? null : Parse(reader.GetString(7))
            };
        }

        /// <summary>Claims and processes one pending message, atomically saving its event and processed state.</summary>
        public async Task<bool> ProcessOneAsync(int maxAttempts, CancellationToken cancellationToken)
        {
            IngestionMessage? message = null;
            await using (var connection = OpenConnection())
            await using (var transaction = connection.BeginTransaction())
            {
                await using var select = connection.CreateCommand();
                select.Transaction = transaction;
                select.CommandText = "SELECT Id,SourceEventId,PayloadJson,AttemptCount,FailureMode FROM IngestionMessages WHERE Status='Pending' AND (NextAttemptAtUtc IS NULL OR NextAttemptAtUtc <= $now) ORDER BY CreatedAtUtc LIMIT 1;";
                select.Parameters.AddWithValue("$now", Format(DateTimeOffset.UtcNow));
                await using var reader = await select.ExecuteReaderAsync(cancellationToken);
                if (await reader.ReadAsync(cancellationToken))
                {
                    message = new IngestionMessage
                    {
                        MessageId = Guid.Parse(reader.GetString(0)),
                        SourceEventId = reader.GetString(1),
                        PayloadJson = reader.GetString(2),
                        AttemptCount = reader.GetInt32(3),
                        FailureMode = reader.IsDBNull(4) ? null : reader.GetString(4)
                    };
                }
                await reader.DisposeAsync();
                if (message is null) return false;
                await using var update = connection.CreateCommand();
                update.Transaction = transaction;
                update.CommandText = "UPDATE IngestionMessages SET Status='Processing',AttemptCount=AttemptCount+1,LastAttemptedAtUtc=$now WHERE Id=$id AND Status='Pending';";
                update.Parameters.AddWithValue("$now", Format(DateTimeOffset.UtcNow));
                update.Parameters.AddWithValue("$id", message.MessageId.ToString());
                if (await update.ExecuteNonQueryAsync(cancellationToken) != 1) return false;
                await transaction.CommitAsync(cancellationToken);
            }

            var attempt = message.AttemptCount + 1;
            logger.LogInformation("Processing ingestion message {MessageId}, attempt {Attempt}", message.MessageId, attempt);
            if (message.FailureMode == "permanent" || (message.FailureMode == "transient" && attempt == 1))
            {
                var isRetryable = message.FailureMode == "transient" && attempt < maxAttempts;
                await MarkFailureAsync(message.MessageId, isRetryable, attempt, maxAttempts, cancellationToken);
                return true;
            }

            var payload = JsonSerializer.Deserialize<MachineEventRequest>(message.PayloadJson, JsonOptions)
                ?? throw new InvalidOperationException("The queued event payload could not be deserialized.");
            await using var finalConnection = OpenConnection();
            await using var finalTransaction = finalConnection.BeginTransaction();
            await using (var insert = finalConnection.CreateCommand())
            {
                insert.Transaction = finalTransaction;
                insert.CommandText = "INSERT OR IGNORE INTO DowntimeEvents(Id,SourceEventId,LineId,Reason,StartedAtUtc,EndedAtUtc,ReceivedAtUtc) VALUES($id,$source,$line,$reason,$start,$end,$received);";
                insert.Parameters.AddWithValue("$id", Guid.NewGuid().ToString());
                insert.Parameters.AddWithValue("$source", payload.SourceEventId);
                insert.Parameters.AddWithValue("$line", payload.LineId);
                insert.Parameters.AddWithValue("$reason", payload.Reason);
                insert.Parameters.AddWithValue("$start", Format(payload.StartedAtUtc));
                insert.Parameters.AddWithValue("$end", payload.EndedAtUtc is { } end ? Format(end) : DBNull.Value);
                insert.Parameters.AddWithValue("$received", Format(DateTimeOffset.UtcNow));
                await insert.ExecuteNonQueryAsync(cancellationToken);
            }
            await using (var update = finalConnection.CreateCommand())
            {
                update.Transaction = finalTransaction;
                update.CommandText = "UPDATE IngestionMessages SET Status='Processed',ProcessedAtUtc=$now,NextAttemptAtUtc=NULL,LastError=NULL WHERE Id=$id AND Status='Processing';";
                update.Parameters.AddWithValue("$now", Format(DateTimeOffset.UtcNow));
                update.Parameters.AddWithValue("$id", message.MessageId.ToString());
                await update.ExecuteNonQueryAsync(cancellationToken);
            }
            await finalTransaction.CommitAsync(cancellationToken);
            logger.LogInformation("Processed ingestion message {MessageId}", message.MessageId);
            return true;
        }

        /// <summary>Records a failed attempt and either schedules a bounded retry or marks the message failed.</summary>
        private async Task MarkFailureAsync(Guid id, bool retryable, int attempt, int maxAttempts, CancellationToken cancellationToken)
        {
            var final = !retryable || attempt >= maxAttempts;
            var error = retryable ? "Development simulation: transient processing failure; retry scheduled." : "Development simulation: permanent processing failure.";
            await using var connection = OpenConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = "UPDATE IngestionMessages SET Status=$status,LastError=$error,NextAttemptAtUtc=$next WHERE Id=$id;";
            command.Parameters.AddWithValue("$status", final ? "Failed" : "Pending");
            command.Parameters.AddWithValue("$error", error);
            command.Parameters.AddWithValue("$next", retryable && !final ? Format(DateTimeOffset.UtcNow.AddSeconds(2)) : DBNull.Value);
            command.Parameters.AddWithValue("$id", id.ToString());
            await command.ExecuteNonQueryAsync(cancellationToken);
            logger.LogWarning("Message {MessageId} {Outcome} after attempt {Attempt}", id, final ? "failed" : "will be retried", attempt);
        }

        /// <summary>Formats a timestamp as an invariant round-trip UTC string for SQLite storage.</summary>
        private static string Format(DateTimeOffset value) => value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);

        /// <summary>Parses a stored timestamp and normalizes it to UTC.</summary>
        private static DateTimeOffset Parse(string value) => DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).ToUniversalTime();

        /// <summary>Creates a repeatable GUID from a stable string value.</summary>
        private static Guid GuidFrom(string value) => new(MD5.HashData(Encoding.UTF8.GetBytes(value)));
    }
}
