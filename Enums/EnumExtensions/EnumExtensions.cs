using System.ComponentModel.DataAnnotations;
using System.Reflection;

namespace ProductionLineSim.Enums.EnumExtensions
{
    public static class EnumExtensions
    {
        /// <summary>Returns the display label declared on an enum member, or its enum name.</summary>
        public static string GetDisplayName(this Enum value)
        {
            var member = value.GetType().GetMember(value.ToString()).FirstOrDefault();

            return member?
                .GetCustomAttribute<DisplayAttribute>()?
                .GetName()
                ?? value.ToString();
        }

        /// <summary>Parses a production-line status from its declared display label.</summary>
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
