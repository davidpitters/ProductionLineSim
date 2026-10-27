using ProductionLineSim.Classes;
using ProductionLineSim.Enums;

namespace ProductionLineSim.Services
{
    public class DowntimeCalculator
    {
        /// <summary>Calculates clipped event durations and reason totals within a UTC reporting range.</summary>
        public static DowntimeReport Calculate(string lineId, DateTimeOffset fromUtc, DateTimeOffset toUtc, IEnumerable<DowntimeEvent> sourceEvents, DateTimeOffset nowUtc)
        {
            var from = fromUtc.ToUniversalTime();
            var to = toUtc.ToUniversalTime();
            if (from >= to) throw new ArgumentException("The reporting range must have from earlier than to.");

            // Use half-open overlap checks so events touching a range boundary are excluded.
            var events = sourceEvents
                .Where(item => item.StartedAtUtc < to && (item.EndedAtUtc is null || item.EndedAtUtc > from))
                .Select(item =>
                {
                    // Bound open-ended events by both the report end and the current time.
                    var effectiveEnd = item.EndedAtUtc ?? (to < nowUtc ? to : nowUtc);
                    var overlapStart = item.StartedAtUtc > from ? item.StartedAtUtc : from;
                    var overlapEnd = effectiveEnd < to ? effectiveEnd : to;
                    var seconds = Math.Max(0, (long)Math.Floor((overlapEnd - overlapStart).TotalSeconds));
                    return new DowntimeEvent { Id = item.Id, SourceEventId = item.SourceEventId, Reason = item.Reason, Status = DowntimeReasonCatalog.GetImpactStatus(item.Reason), StartedAtUtc = item.StartedAtUtc, EndedAtUtc = item.EndedAtUtc, DurationSeconds = seconds, IsOngoing = item.EndedAtUtc is null };
                }).ToArray();
            var breakdown = events
                .GroupBy(item => item.Reason, StringComparer.OrdinalIgnoreCase)
                .OrderBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
                .Select(group => new ReasonBreakdown
                {
                    Reason = group.Key,
                    EventCount = group.Count(),
                    TotalDowntimeSeconds = group.Sum(item => item.DurationSeconds)
                })
                .ToArray();
            return new DowntimeReport { LineId = lineId, FromUtc = from, ToUtc = to, EventCount = events.Length, TotalDowntimeSeconds = events.Sum(item => item.DurationSeconds), Events = events, Breakdown = breakdown };
        }
    }
}
