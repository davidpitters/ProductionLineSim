using ProductionLineSim.Enums;
using ProductionLineSim.Enums.EnumExtensions;

namespace ProductionLineSim.Services;

/// <summary>Maps descriptive downtime causes to their production-line impact status.</summary>
public static class DowntimeReasonCatalog
{
    private static readonly IReadOnlyDictionary<string, ProductionLineStatus> CauseStatuses =
        new Dictionary<string, ProductionLineStatus>(StringComparer.OrdinalIgnoreCase)
        {
            ["Mechanical Fault"] = ProductionLineStatus.Down,
            ["Sensor Fault"] = ProductionLineStatus.Down,
            ["Changeover"] = ProductionLineStatus.Down,
            ["Operator Intervention"] = ProductionLineStatus.Down,
            ["Material Shortage"] = ProductionLineStatus.Starved,
            ["Label Roll Empty"] = ProductionLineStatus.Starved,
            ["Cap Feeder Empty"] = ProductionLineStatus.Starved,
            ["Conveyor Jam"] = ProductionLineStatus.Blocked,
            ["Bottle Misalignment"] = ProductionLineStatus.Blocked,
            ["Reject Bin Full"] = ProductionLineStatus.Blocked,
            ["Downstream Blockage"] = ProductionLineStatus.Blocked,
            ["Quality Hold"] = ProductionLineStatus.Blocked,
        };

    private static readonly IReadOnlyDictionary<string, ProductionLineStatus> LegacyStatuses =
        new Dictionary<string, ProductionLineStatus>(StringComparer.OrdinalIgnoreCase)
        {
            [ProductionLineStatus.Down.GetDisplayName()] = ProductionLineStatus.Down,
            [ProductionLineStatus.Starved.GetDisplayName()] = ProductionLineStatus.Starved,
            [ProductionLineStatus.Blocked.GetDisplayName()] = ProductionLineStatus.Blocked,
        };

    public static IReadOnlyCollection<string> Causes => CauseStatuses.Keys.ToArray();

    public static IReadOnlyCollection<(string Reason, ProductionLineStatus Status)> CausesWithStatuses =>
        CauseStatuses.Select(entry => (entry.Key, entry.Value)).ToArray();

    public static IReadOnlyCollection<string> AcceptedReasons =>
        CauseStatuses.Keys.Concat(LegacyStatuses.Keys).ToArray();

    public static ProductionLineStatus GetImpactStatus(string reason)
    {
        if (CauseStatuses.TryGetValue(reason, out var status) || LegacyStatuses.TryGetValue(reason, out status))
        {
            return status;
        }

        throw new ArgumentException($"Unsupported downtime reason '{reason}'.", nameof(reason));
    }

    public static string MigrateLegacyReason(string reason) => reason.ToLowerInvariant() switch
    {
        "down" => "Mechanical Fault",
        "starved" => "Material Shortage",
        "blocked" => "Conveyor Jam",
        _ => reason,
    };
}
