namespace ProductionLineSim.Classes
{
    public class IngestionLogEntry
    {
        public Guid MessageId { get; set; }
        public string SourceEventId { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public int AttemptCount { get; set; }
        public DateTimeOffset CreatedAtUtc { get; set; }
        public DateTimeOffset? LastAttemptedAtUtc { get; set; }
        public string? LastError { get; set; }
        public DateTimeOffset? ProcessedAtUtc { get; set; }
    }
}