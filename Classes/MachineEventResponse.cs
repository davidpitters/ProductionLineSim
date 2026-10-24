using ProductionLineSim.Enums;

namespace ProductionLineSim.Classes
{
    public class MachineEventResponse
    {
        public Guid MessageId { get; set; }
        public string SourceEventId { get; set; } = string.Empty;
        public MessageStatus Status { get; set; } = MessageStatus.Pending;
        public bool IsDuplicate { get; set; }
    }
}
