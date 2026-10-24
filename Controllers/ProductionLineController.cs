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

        [HttpGet]
        [Route("api/productionlines/{lineId}/downtime")]
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
