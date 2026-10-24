using System.ComponentModel.DataAnnotations;

namespace ProductionLineSim.Enums
{
    public enum ProductionLineStatus
    {
        [Display(Name = "Running")]
        Running,
        [Display(Name = "Starved")]
        Starved,
        [Display(Name = "Blocked")]
        Blocked,
        [Display(Name = "Down")]
        Down
    }
}
