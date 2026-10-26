using ProductionLineSim.Enums;

namespace ProductionLineSim.Classes
{
    public class DowntimeEvent
    {
        public Guid Id { get; set; }
        public string SourceEventId { get; set; }
        public string Reason { get; set; }
        public ProductionLineStatus Status { get; set; }
        public DateTimeOffset StartedAtUtc { get; set; }
        public DateTimeOffset? EndedAtUtc { get; set; }
        public long DurationSeconds { get; set; }
        public bool IsOngoing { get; set; }
    }
}
