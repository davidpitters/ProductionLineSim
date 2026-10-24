using System.ComponentModel.DataAnnotations;
using System.Reflection;

namespace ProductionLineSim.Enums.EnumExtensions
{
    public static class EnumExtensions
    {
        public static string GetDisplayName(this Enum value)
        {
            var member = value.GetType().GetMember(value.ToString()).FirstOrDefault();

            return member?
                .GetCustomAttribute<DisplayAttribute>()?
                .GetName()
                ?? value.ToString();
        }

        public static ProductionLineStatus ParseDisplayName(string displayName)
        {
            foreach (var field in typeof(ProductionLineStatus).GetFields())
            {
                var attribute = field.GetCustomAttribute<DisplayAttribute>();
                if (attribute != null && attribute.GetName() == displayName)
                {
                    return (ProductionLineStatus)field.GetValue(null);
                }
            }
            throw new ArgumentException($"No enum value with display name '{displayName}' found in ProductionLineStatus.");
        }
    }
}
