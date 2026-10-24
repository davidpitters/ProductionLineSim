using System.ComponentModel.DataAnnotations;

namespace ProductionLineSim.Enums
{
    public enum MessageStatus
    {
        [Display(Name = "Pending")]
        Pending,
        [Display(Name = "Processing")]
        Processing,
        [Display(Name = "Processed")]
        Processed,
        [Display(Name = "Failed")]
        Failed
    }
}
