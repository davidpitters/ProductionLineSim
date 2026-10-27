using Microsoft.Extensions.Logging;
using ProductionLineSim.Classes;
using ProductionLineSim.Enums;
using ProductionLineSim.Services;
using Xunit;

namespace ProductionLineSim.Tests;

public class SqliteStoreTests
{
    /// <summary>Verifies an identical replay returns its original queue message and creates an audit log.</summary>
    [Fact]
    public async Task EnqueueAsync_IdenticalReplayReturnsOriginalAndWritesDuplicateLog()
    {
        // Start from a fresh isolated database for repeatable assertions.
        await using var database = await SqliteTestDatabase.CreateAsync();
        // Prepare one valid event that will be submitted twice with an identical payload.
        var request = CreateRequest("duplicate-test", "line-1", "Mechanical Fault", DateTimeOffset.UtcNow.AddMinutes(1));

        // The first submission should be newly enqueued.
        var first = await database.Store.EnqueueAsync(request, null, CancellationToken.None);
        // The second submission should be recognized as the same source event.
        var replay = await database.Store.EnqueueAsync(request, null, CancellationToken.None);
        // Read the event audit to verify the replay was recorded there.
        var logs = await database.Store.GetMachineEventLogsAsync(100, 0, CancellationToken.None);

        // The initial submission is not a conflict.
        Assert.False(first.Item2);
        // A new queue message was returned for the initial submission.
        Assert.NotNull(first.Item1);
        // The replay response is marked as a duplicate.
        Assert.True(replay.Item1?.IsDuplicate);
        // A duplicate must refer to the original message rather than create another one.
        Assert.Equal(first.Item1!.MessageId, replay.Item1!.MessageId);
        // Find the single audit row corresponding to this source event.
        var duplicateLog = Assert.Single(logs.Items, item => item.SourceEventId == request.SourceEventId);
        // Confirm that row represents duplicate recognition.
        Assert.True(duplicateLog.IsDuplicate);
        // Confirm the audit row links back to the original message.
        Assert.Equal(first.Item1.MessageId, duplicateLog.OriginalMessageId);
    }

    /// <summary>Verifies reusing a source ID with a changed payload is rejected as a conflict.</summary>
    [Fact]
    public async Task EnqueueAsync_ReusedSourceIdWithDifferentPayloadReturnsConflict()
    {
        // Isolate this conflict scenario from all other test data.
        await using var database = await SqliteTestDatabase.CreateAsync();
        // Create the payload that claims the source event ID first.
        var original = CreateRequest("conflict-test", "line-1", "Mechanical Fault", DateTimeOffset.UtcNow.AddMinutes(1));
        // Keep the source ID and start time but change the reason to alter the payload hash.
        var changed = CreateRequest("conflict-test", "line-1", "Material Shortage", original.StartedAtUtc);

        // Persist the original payload.
        var first = await database.Store.EnqueueAsync(original, null, CancellationToken.None);
        // Submit the same source ID with different content.
        var conflict = await database.Store.EnqueueAsync(changed, null, CancellationToken.None);

        // Verify the original request was accepted.
        Assert.NotNull(first.Item1);
        // Conflicting re-use does not return a queue message.
        Assert.Null(conflict.Item1);
        // The second tuple value identifies the payload conflict.
        Assert.True(conflict.Item2);
    }

    /// <summary>Verifies event rollover, status changes, manual resolution, and restart reconciliation.</summary>
    [Fact]
    public async Task ProcessOneAsync_ClosesPriorOngoingEventAndResolveRestoresRunning()
    {
        // Use a clean database so seeded history cannot affect this line's state checks.
        await using var database = await SqliteTestDatabase.CreateAsync();
        // Schedule both events in the future so their exact event-time ordering is stable.
        var firstStart = DateTimeOffset.UtcNow.AddMinutes(1);
        // Place the next event one minute after the first event begins.
        var secondStart = firstStart.AddMinutes(1);
        // Make the initial line event cause a Down status.
        var first = CreateRequest("rollover-first", "line-1", "Mechanical Fault", firstStart);
        // Make the succeeding event cause a Starved status.
        var second = CreateRequest("rollover-second", "line-1", "Material Shortage", secondStart);

        // Enqueue and process the first event, leaving it open-ended.
        await database.Store.EnqueueAsync(first, null, CancellationToken.None);
        // Confirm one queued event was claimed and processed.
        Assert.True(await database.Store.ProcessOneAsync(5, CancellationToken.None));
        // Enqueue and process the later event on the same line.
        await database.Store.EnqueueAsync(second, null, CancellationToken.None);
        // Confirm the second queued event was also processed.
        Assert.True(await database.Store.ProcessOneAsync(5, CancellationToken.None));

        // Query a window that includes the first event and its automatic close time.
        var report = await database.Store.GetDowntimeAsync(
            "line-1", firstStart.AddMinutes(-1), secondStart.AddMinutes(1), CancellationToken.None);
        // Locate the first event in the calculated report.
        var closedFirst = Assert.Single(report.Events, item => item.SourceEventId == first.SourceEventId);
        // Processing the later event should close the first at its start timestamp.
        Assert.Equal(secondStart, closedFirst.EndedAtUtc);

        // Read the line after rollover to confirm the newer event determines its status.
        var currentLine = Assert.Single(await database.Store.GetProductionLinesAsync(CancellationToken.None), line => line.Id == "line-1");
        // Material Shortage maps to Starved.
        Assert.Equal(ProductionLineStatus.Starved, currentLine.Status);

        // Resolve the remaining open event and require a successful resolution timestamp.
        Assert.NotNull(await database.Store.ResolveCurrentEventAsync("line-1", CancellationToken.None));
        // Reload the line after resolution.
        var resolvedLine = Assert.Single(await database.Store.GetProductionLinesAsync(CancellationToken.None), line => line.Id == "line-1");
        // Resolving the current event restores the line to Running.
        Assert.Equal(ProductionLineStatus.Running, resolvedLine.Status);

        // Re-run startup initialization to exercise status reconciliation against persisted history.
        await database.Store.InitializeAsync();
        // Read the line after the simulated restart.
        var restartedLine = Assert.Single(await database.Store.GetProductionLinesAsync(CancellationToken.None), line => line.Id == "line-1");
        // A closed latest event must still leave the line Running after restart.
        Assert.Equal(ProductionLineStatus.Running, restartedLine.Status);
    }

    /// <summary>Verifies resolving a line with no open event reports no change.</summary>
    [Fact]
    public async Task ResolveCurrentEventAsync_ReturnsNullWhenLineHasNoOngoingEvent()
    {
        // Initialize a test database without adding an ongoing event to this line.
        await using var database = await SqliteTestDatabase.CreateAsync();

        // Attempt to resolve an event that does not exist.
        var result = await database.Store.ResolveCurrentEventAsync("line-1", CancellationToken.None);

        // No resolution timestamp is returned when nothing was closed.
        Assert.Null(result);
    }

    /// <summary>Builds a machine-event request with the supplied identity, cause, and start time.</summary>
    private static MachineEventRequest CreateRequest(
        string sourceEventId,
        string lineId,
        string reason,
        DateTimeOffset startedAtUtc) => new()
        {
            // Use the provided source ID to support replay and conflict scenarios.
            SourceEventId = sourceEventId,
            // Route the synthetic event to the requested seeded production line.
            LineId = lineId,
            // Set the cause used to determine the line's resulting status.
            Reason = reason,
            // Preserve the supplied timestamp for deterministic event ordering.
            StartedAtUtc = startedAtUtc,
            // Leave the event open so processing creates an ongoing event.
            EndedAtUtc = null,
        };
}

internal sealed class SqliteTestDatabase : IAsyncDisposable
{
    private readonly string _databasePath;
    private readonly ILoggerFactory _loggerFactory;

    /// <summary>Stores the paths and initialized store needed to manage a test database lifecycle.</summary>
    private SqliteTestDatabase(string databasePath, ILoggerFactory loggerFactory, SqliteStore store)
    {
        // Retain the path so disposal can remove the temporary database.
        _databasePath = databasePath;
        // Retain the factory until the fixture has finished using its logger.
        _loggerFactory = loggerFactory;
        // Expose the initialized store to the test case.
        Store = store;
    }

    public SqliteStore Store { get; }

    /// <summary>Creates and initializes an isolated temporary database for one test.</summary>
    public static async Task<SqliteTestDatabase> CreateAsync()
    {
        // Give each test an isolated database and disable pooling so Windows releases the file on disposal.
        // Generate a unique path so parallel tests never share SQLite state.
        var databasePath = Path.Combine(Path.GetTempPath(), $"production-line-tests-{Guid.NewGuid():N}.db");
        // Use a no-op logger to keep test output focused on assertion failures.
        var loggerFactory = LoggerFactory.Create(_ => { });
        // Disable pooling so open connections do not prevent temporary-file cleanup.
        var store = new SqliteStore($"Data Source={databasePath};Pooling=False", loggerFactory.CreateLogger<SqliteStore>());
        // Initialize schema and seed required production-line rows before returning the fixture.
        await store.InitializeAsync();
        // Return the initialized database owner, which cleans up asynchronously after each test.
        return new SqliteTestDatabase(databasePath, loggerFactory, store);
    }

    /// <summary>Closes test logging resources and removes the database and SQLite sidecar files.</summary>
    public ValueTask DisposeAsync()
    {
        // Release the logger factory before attempting to remove test resources.
        _loggerFactory.Dispose();
        // SQLite may leave write-ahead-log and shared-memory files beside the main database.
        foreach (var suffix in new[] { string.Empty, "-wal", "-shm" })
        {
            // Delete each file only when it was created.
            var path = _databasePath + suffix;
            if (File.Exists(path)) File.Delete(path);
        }
        // The synchronous file cleanup has no asynchronous work to await.
        return ValueTask.CompletedTask;
    }
}