using Microsoft.AspNetCore.Mvc;
using ProductionLineSim.Classes;
using ProductionLineSim.Services;

namespace ProductionLineSim.Controllers
{
    [ApiController]
    [Route("api/logs")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public class LogsController(SqliteStore store) : ControllerBase
    {
        private const int DefaultLimit = 50;
        private const int MaximumLimit = 100;

        /// <summary>Returns a bounded page of machine events and duplicate recognitions.</summary>
        [HttpGet("events")]
        public Task<LogPage<MachineEventLogEntry>> GetMachineEventsAsync(
            [FromQuery] int limit = DefaultLimit,
            [FromQuery] int offset = 0,
            CancellationToken cancellationToken = default)
        {
            return store.GetMachineEventLogsAsync(Math.Clamp(limit, 1, MaximumLimit), Math.Max(0, offset), cancellationToken);
        }

        /// <summary>Returns a bounded page of ingestion queue messages.</summary>
        [HttpGet("ingestion-messages")]
        public Task<LogPage<IngestionLogEntry>> GetIngestionMessagesAsync(
            [FromQuery] int limit = DefaultLimit,
            [FromQuery] int offset = 0,
            CancellationToken cancellationToken = default)
        {
            return store.GetIngestionLogsAsync(Math.Clamp(limit, 1, MaximumLimit), Math.Max(0, offset), false, cancellationToken);
        }

        /// <summary>Returns a bounded page of failed ingestion messages.</summary>
        [HttpGet("failures")]
        public Task<LogPage<IngestionLogEntry>> GetFailuresAsync(
            [FromQuery] int limit = DefaultLimit,
            [FromQuery] int offset = 0,
            CancellationToken cancellationToken = default)
        {
            return store.GetIngestionLogsAsync(Math.Clamp(limit, 1, MaximumLimit), Math.Max(0, offset), true, cancellationToken);
        }
    }
}