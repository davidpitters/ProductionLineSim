using Microsoft.AspNetCore.Mvc;
using ProductionLineSim.Classes;
using ProductionLineSim.Services;

namespace ProductionLineSim.Controllers
{
    [ApiController]
    [Route("api/productionlines")]
    public class ProductionLineController(SqliteStore store, ILogger<ProductionLineController> logger) : ControllerBase
    {
        [HttpGet]
        public async Task<List<ProductionLine>> GetProductionLinesAsync(CancellationToken cancellationToken)
        {
            return (await store.GetProductionLinesAsync(cancellationToken));
        }

        [HttpPost("{lineId}/resolve-current-event")]
        /// <summary>Closes the current ongoing event for a line and changes its status to Running.</summary>
        public async Task<IActionResult> ResolveCurrentEventAsync(string lineId, CancellationToken cancellationToken)
        {
            if (!await store.LineExistsAsync(lineId, cancellationToken))
                return NotFound(new ApiError($"Production line '{lineId}' was not found."));

            var resolvedAt = await store.ResolveCurrentEventAsync(lineId, cancellationToken);
            if (resolvedAt is null)
                return Conflict(new ApiError("The production line has no ongoing event to resolve."));

            logger.LogInformation("Resolved current machine event for line {LineId} at {ResolvedAtUtc}", lineId, resolvedAt);
            return Ok(new { lineId, status = "Running", statusUpdatedAtUtc = resolvedAt });
        }

        [HttpGet("{lineId}/downtime")]
        /// <summary>Returns the selected line's downtime report for a validated UTC time range.</summary>
        public async Task<ActionResult<DowntimeReport>> GetDowntimeAsync(string lineId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, CancellationToken cancellationToken)
        {
            if (from is null || to is null)
                return BadRequest(new ApiError("Both 'from' and 'to' UTC timestamps are required."));
            var start = from.Value.ToUniversalTime();
            var end = to.Value.ToUniversalTime();
            if (start >= end)
                return BadRequest(new ApiError("The reporting range must have from earlier than to."));
            if (!await store.LineExistsAsync(lineId, cancellationToken))
                return NotFound(new ApiError($"Production line '{lineId}' was not found."));
            logger.LogInformation("Reporting downtime for {LineId} from {FromUtc} to {ToUtc}", lineId, start, end);
            return Ok(await store.GetDowntimeAsync(lineId, start, end, cancellationToken));
        }
    }
}
