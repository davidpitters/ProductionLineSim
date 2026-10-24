namespace ProductionLineSim.Classes
{
    public class DowntimeReport
    {
        public string LineId { get; set; }
        public DateTimeOffset FromUtc { get; set; }
        public DateTimeOffset ToUtc { get; set; }
        public int EventCount { get; set; }
        public long TotalDowntimeSeconds { get; set; }
        public IReadOnlyList<DowntimeEvent> Events { get; set; }
        public IReadOnlyList<ReasonBreakdown> Breakdown { get; set; }
    }
}
