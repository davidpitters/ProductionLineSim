namespace ProductionLineSim.Classes
{
    public class IngestionMessage
    {
        public Guid MessageId { get; set; }
        public string SourceEventId { get; set; }
        public string Status { get; set; }
        public int AttemptCount { get; set; }
        public DateTimeOffset CreatedAtUtc { get; set; }
        public DateTimeOffset? LastAttemptedAtUtc { get; set; }
        public string? LastError { get; set; }
        public DateTimeOffset? ProcessedAtUtc { get; set; }
        public string? PayloadJson { get; set; }
        public string? PayloadHash { get; set; }
        public string? FailureMode { get; set; }
    }
}
