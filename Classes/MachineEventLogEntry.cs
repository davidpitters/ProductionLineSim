namespace ProductionLineSim.Classes
{
    public class MachineEventLogEntry
    {
        public Guid Id { get; set; }
        public string SourceEventId { get; set; } = string.Empty;
        public string LineId { get; set; } = string.Empty;
        public string LineName { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTimeOffset StartedAtUtc { get; set; }
        public DateTimeOffset? EndedAtUtc { get; set; }
        public DateTimeOffset ReceivedAtUtc { get; set; }
        public bool IsDuplicate { get; set; }
        public Guid? OriginalMessageId { get; set; }
        public DateTimeOffset? RecognizedAtUtc { get; set; }
    }
}