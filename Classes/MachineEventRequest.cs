using System.ComponentModel.DataAnnotations;

namespace ProductionLineSim.Classes
{
    public class MachineEventRequest
    {
        [Required, StringLength(120, MinimumLength = 1)]
        public string SourceEventId { get; set; } = string.Empty;

        [Required, StringLength(80, MinimumLength = 1)]
        public string LineId { get; set; } = string.Empty;

        [Required]
        public string Reason { get; set; } = string.Empty;

        public DateTimeOffset StartedAtUtc { get; set; }
        public DateTimeOffset? EndedAtUtc { get; set; }
    }
}
