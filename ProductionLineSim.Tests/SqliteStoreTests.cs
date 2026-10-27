using Microsoft.Extensions.Logging;
using ProductionLineSim.Classes;
using ProductionLineSim.Enums;
using ProductionLineSim.Services;
using Xunit;

namespace ProductionLineSim.Tests;

public class SqliteStoreTests
{
    [Fact]
    public async Task EnqueueAsync_IdenticalReplayReturnsOriginalAndWritesDuplicateLog()
    {
        await using var database = await SqliteTestDatabase.CreateAsync();
        var request = CreateRequest("duplicate-test", "line-1", "Mechanical Fault", DateTimeOffset.UtcNow.AddMinutes(1));

        var first = await database.Store.EnqueueAsync(request, null, CancellationToken.None);
        var replay = await database.Store.EnqueueAsync(request, null, CancellationToken.None);
        var logs = await database.Store.GetMachineEventLogsAsync(100, 0, CancellationToken.None);

        Assert.False(first.Item2);
        Assert.NotNull(first.Item1);
        Assert.True(replay.Item1?.IsDuplicate);
        Assert.Equal(first.Item1!.MessageId, replay.Item1!.MessageId);
        var duplicateLog = Assert.Single(logs.Items, item => item.SourceEventId == request.SourceEventId);
        Assert.True(duplicateLog.IsDuplicate);
        Assert.Equal(first.Item1.MessageId, duplicateLog.OriginalMessageId);
    }

    [Fact]
    public async Task EnqueueAsync_ReusedSourceIdWithDifferentPayloadReturnsConflict()
    {
        await using var database = await SqliteTestDatabase.CreateAsync();
        var original = CreateRequest("conflict-test", "line-1", "Mechanical Fault", DateTimeOffset.UtcNow.AddMinutes(1));
        var changed = CreateRequest("conflict-test", "line-1", "Material Shortage", original.StartedAtUtc);

        var first = await database.Store.EnqueueAsync(original, null, CancellationToken.None);
        var conflict = await database.Store.EnqueueAsync(changed, null, CancellationToken.None);

        Assert.NotNull(first.Item1);
        Assert.Null(conflict.Item1);
        Assert.True(conflict.Item2);
    }

    [Fact]
    public async Task ProcessOneAsync_ClosesPriorOngoingEventAndResolveRestoresRunning()
    {
        await using var database = await SqliteTestDatabase.CreateAsync();
        var firstStart = DateTimeOffset.UtcNow.AddMinutes(1);
        var secondStart = firstStart.AddMinutes(1);
        var first = CreateRequest("rollover-first", "line-1", "Mechanical Fault", firstStart);
        var second = CreateRequest("rollover-second", "line-1", "Material Shortage", secondStart);

        await database.Store.EnqueueAsync(first, null, CancellationToken.None);
        Assert.True(await database.Store.ProcessOneAsync(5, CancellationToken.None));
        await database.Store.EnqueueAsync(second, null, CancellationToken.None);
        Assert.True(await database.Store.ProcessOneAsync(5, CancellationToken.None));

        var report = await database.Store.GetDowntimeAsync(
            "line-1", firstStart.AddMinutes(-1), secondStart.AddMinutes(1), CancellationToken.None);
        var closedFirst = Assert.Single(report.Events, item => item.SourceEventId == first.SourceEventId);
        Assert.Equal(secondStart, closedFirst.EndedAtUtc);

        var currentLine = Assert.Single(await database.Store.GetProductionLinesAsync(CancellationToken.None), line => line.Id == "line-1");
        Assert.Equal(ProductionLineStatus.Starved, currentLine.Status);

        Assert.NotNull(await database.Store.ResolveCurrentEventAsync("line-1", CancellationToken.None));
        var resolvedLine = Assert.Single(await database.Store.GetProductionLinesAsync(CancellationToken.None), line => line.Id == "line-1");
        Assert.Equal(ProductionLineStatus.Running, resolvedLine.Status);

        await database.Store.InitializeAsync();
        var restartedLine = Assert.Single(await database.Store.GetProductionLinesAsync(CancellationToken.None), line => line.Id == "line-1");
        Assert.Equal(ProductionLineStatus.Running, restartedLine.Status);
    }

    [Fact]
    public async Task ResolveCurrentEventAsync_ReturnsNullWhenLineHasNoOngoingEvent()
    {
        await using var database = await SqliteTestDatabase.CreateAsync();

        var result = await database.Store.ResolveCurrentEventAsync("line-1", CancellationToken.None);

        Assert.Null(result);
    }

    private static MachineEventRequest CreateRequest(
        string sourceEventId,
        string lineId,
        string reason,
        DateTimeOffset startedAtUtc) => new()
        {
            SourceEventId = sourceEventId,
            LineId = lineId,
            Reason = reason,
            StartedAtUtc = startedAtUtc,
            EndedAtUtc = null,
        };
}

internal sealed class SqliteTestDatabase : IAsyncDisposable
{
    private readonly string _databasePath;
    private readonly ILoggerFactory _loggerFactory;

    private SqliteTestDatabase(string databasePath, ILoggerFactory loggerFactory, SqliteStore store)
    {
        _databasePath = databasePath;
        _loggerFactory = loggerFactory;
        Store = store;
    }

    public SqliteStore Store { get; }

    public static async Task<SqliteTestDatabase> CreateAsync()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), $"production-line-tests-{Guid.NewGuid():N}.db");
        var loggerFactory = LoggerFactory.Create(_ => { });
        var store = new SqliteStore($"Data Source={databasePath};Pooling=False", loggerFactory.CreateLogger<SqliteStore>());
        await store.InitializeAsync();
        return new SqliteTestDatabase(databasePath, loggerFactory, store);
    }

    public ValueTask DisposeAsync()
    {
        _loggerFactory.Dispose();
        foreach (var suffix in new[] { string.Empty, "-wal", "-shm" })
        {
            var path = _databasePath + suffix;
            if (File.Exists(path)) File.Delete(path);
        }
        return ValueTask.CompletedTask;
    }
}