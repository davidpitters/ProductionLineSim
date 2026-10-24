using ProductionLineSim.Enums;

namespace ProductionLineSim.Classes
{
    public class ProductionLine
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public ProductionLineStatus Status { get; set; }
        public DateTimeOffset StatusUpdatedAtUtc { get; set; }
    }
}
