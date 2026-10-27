using ProductionLineSim.Classes;
using ProductionLineSim.Enums;
using ProductionLineSim.Services;
using Xunit;

namespace ProductionLineSim.Tests;

public class DowntimeCalculatorTests
{
    private static readonly DateTimeOffset From = new(2025, 1, 15, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset To = From.AddHours(1);

    /// <summary>Verifies overlap filtering, half-open boundaries, clipping, and status breakdowns.</summary>
    [Fact]
    public void Calculate_FiltersByOverlapAndClipsDurationToRange()
    {
        // Include events that only touch either boundary to verify the range is half-open.
        var events = new[]
        {
            // This event overlaps the range by ten minutes at its start.
            CreateEvent("before", "Mechanical Fault", From.AddMinutes(-10), From.AddMinutes(10)),
            // This event is fully inside the range and lasts thirty minutes.
            CreateEvent("inside", "Material Shortage", From.AddMinutes(20), From.AddMinutes(50)),
            // This event ends exactly at the start boundary and must be excluded.
            CreateEvent("ends-at-from", "Conveyor Jam", From.AddMinutes(-5), From),
            // This event starts exactly at the end boundary and must be excluded.
            CreateEvent("starts-at-to", "Sensor Fault", To, To.AddMinutes(10)),
            // This event starts after the range and must be excluded.
            CreateEvent("after", "Mechanical Fault", To.AddMinutes(5), To.AddMinutes(15)),
        };

        // Calculate only the portions of events overlapping the one-hour window.
        var report = DowntimeCalculator.Calculate("line-test", From, To, events, To.AddHours(1));

        // Only the two overlapping events should be counted.
        Assert.Equal(2, report.EventCount);
        // Ten minutes plus thirty minutes gives forty minutes total.
        Assert.Equal(2_400, report.TotalDowntimeSeconds);
        // Verify each event's clipped duration and mapped production status.
        Assert.Collection(report.Events,
            item =>
            {
                // Confirm the partially overlapping event is retained.
                Assert.Equal("before", item.SourceEventId);
                // Its duration is clipped to the ten minutes inside the range.
                Assert.Equal(600, item.DurationSeconds);
                // Mechanical faults map to Down.
                Assert.Equal(ProductionLineStatus.Down, item.Status);
            },
            item =>
            {
                // Confirm the fully contained event is retained next.
                Assert.Equal("inside", item.SourceEventId);
                // Its full thirty-minute duration is included.
                Assert.Equal(1_800, item.DurationSeconds);
                // Material shortages map to Starved.
                Assert.Equal(ProductionLineStatus.Starved, item.Status);
            });
        // Each different reason produces its own breakdown entry.
        Assert.Equal(2, report.Breakdown.Count);
    }

    /// <summary>Verifies an open event is measured only through the supplied current time.</summary>
    [Fact]
    public void Calculate_UsesNowToBoundOngoingEventDuration()
    {
        // Use a fixed current time so the ongoing duration is deterministic.
        var now = From.AddMinutes(45);
        // The event has no end timestamp and therefore uses now as its effective end.
        var ongoing = CreateEvent("ongoing", "Conveyor Jam", From.AddMinutes(30), null);

        // Calculate the event duration using the selected report window and fixed clock.
        var report = DowntimeCalculator.Calculate("line-test", From, To, [ongoing], now);

        // The report should contain exactly the open event supplied above.
        var result = Assert.Single(report.Events);
        // Confirm the result still identifies the source event as ongoing.
        Assert.True(result.IsOngoing);
        // The event overlaps from 30 to 45 minutes, so its duration is fifteen minutes.
        Assert.Equal(900, result.DurationSeconds);
        // The report total should equal the only event's duration.
        Assert.Equal(900, report.TotalDowntimeSeconds);
    }

    /// <summary>Verifies equal and reversed report windows are rejected.</summary>
    [Fact]
    public void Calculate_RejectsEmptyOrReversedRange()
    {
        // A zero-length range has no valid interval.
        Assert.Throws<ArgumentException>(() => DowntimeCalculator.Calculate("line-test", From, From, [], To));
        // A range whose start follows its end is invalid as well.
        Assert.Throws<ArgumentException>(() => DowntimeCalculator.Calculate("line-test", To, From, [], To));
    }

    /// <summary>Creates a minimally populated event for calculator test scenarios.</summary>
    /// <summary>Creates a minimally populated event for calculator test scenarios.</summary>
    private static DowntimeEvent CreateEvent(
        string sourceEventId,
        string reason,
        DateTimeOffset startedAtUtc,
        DateTimeOffset? endedAtUtc) => new()
        {
            // Assign a unique database-style identity to the synthetic event.
            Id = Guid.NewGuid(),
            // Preserve the supplied source ID for report assertions.
            SourceEventId = sourceEventId,
            // Preserve the supplied cause to exercise status mapping.
            Reason = reason,
            // Use the provided interval start.
            StartedAtUtc = startedAtUtc,
            // A null end represents an ongoing event in calculator scenarios.
            EndedAtUtc = endedAtUtc,
        };
}