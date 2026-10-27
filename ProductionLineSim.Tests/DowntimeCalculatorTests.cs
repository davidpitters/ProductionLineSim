using ProductionLineSim.Classes;
using ProductionLineSim.Enums;
using ProductionLineSim.Services;
using Xunit;

namespace ProductionLineSim.Tests;

public class DowntimeCalculatorTests
{
    private static readonly DateTimeOffset From = new(2025, 1, 15, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset To = From.AddHours(1);

    [Fact]
    public void Calculate_FiltersByOverlapAndClipsDurationToRange()
    {
        var events = new[]
        {
            CreateEvent("before", "Mechanical Fault", From.AddMinutes(-10), From.AddMinutes(10)),
            CreateEvent("inside", "Material Shortage", From.AddMinutes(20), From.AddMinutes(50)),
            CreateEvent("ends-at-from", "Conveyor Jam", From.AddMinutes(-5), From),
            CreateEvent("starts-at-to", "Sensor Fault", To, To.AddMinutes(10)),
            CreateEvent("after", "Mechanical Fault", To.AddMinutes(5), To.AddMinutes(15)),
        };

        var report = DowntimeCalculator.Calculate("line-test", From, To, events, To.AddHours(1));

        Assert.Equal(2, report.EventCount);
        Assert.Equal(2_400, report.TotalDowntimeSeconds);
        Assert.Collection(report.Events,
            item =>
            {
                Assert.Equal("before", item.SourceEventId);
                Assert.Equal(600, item.DurationSeconds);
                Assert.Equal(ProductionLineStatus.Down, item.Status);
            },
            item =>
            {
                Assert.Equal("inside", item.SourceEventId);
                Assert.Equal(1_800, item.DurationSeconds);
                Assert.Equal(ProductionLineStatus.Starved, item.Status);
            });
        Assert.Equal(2, report.Breakdown.Count);
    }

    [Fact]
    public void Calculate_UsesNowToBoundOngoingEventDuration()
    {
        var now = From.AddMinutes(45);
        var ongoing = CreateEvent("ongoing", "Conveyor Jam", From.AddMinutes(30), null);

        var report = DowntimeCalculator.Calculate("line-test", From, To, [ongoing], now);

        var result = Assert.Single(report.Events);
        Assert.True(result.IsOngoing);
        Assert.Equal(900, result.DurationSeconds);
        Assert.Equal(900, report.TotalDowntimeSeconds);
    }

    [Fact]
    public void Calculate_RejectsEmptyOrReversedRange()
    {
        Assert.Throws<ArgumentException>(() => DowntimeCalculator.Calculate("line-test", From, From, [], To));
        Assert.Throws<ArgumentException>(() => DowntimeCalculator.Calculate("line-test", To, From, [], To));
    }

    private static DowntimeEvent CreateEvent(
        string sourceEventId,
        string reason,
        DateTimeOffset startedAtUtc,
        DateTimeOffset? endedAtUtc) => new()
        {
            Id = Guid.NewGuid(),
            SourceEventId = sourceEventId,
            Reason = reason,
            StartedAtUtc = startedAtUtc,
            EndedAtUtc = endedAtUtc,
        };
}