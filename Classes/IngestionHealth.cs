namespace ProductionLineSim.Classes
{
    public class IngestionHealth
    {
        public int Pending { get; set; }
        public int Processing { get; set; }
        public int Processed { get; set; }
        public int Failed { get; set; }
        public IReadOnlyList<IngestionMessage> RecentMessages { get; set; }
    }
}
