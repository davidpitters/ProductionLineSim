using Microsoft.AspNetCore.Mvc;
using ProductionLineSim.Classes;
using ProductionLineSim.Services;

namespace ProductionLineSim.Controllers
{
    [ApiController]
    [Route("api/ingestion")]
    public class IngestionController(SqliteStore store, ILogger<IngestionController> logger) : ControllerBase
    {
        private static readonly string[] ValidReasons = DowntimeReasonCatalog.AcceptedReasons.ToArray();

        [HttpGet]
        [Route("api/ingestion/health")]
        public async Task<ActionResult<IngestionHealth>> GetHealthAsync(CancellationToken cancellationToken)
        {
            return Ok(await store.GetHealthAsync(cancellationToken));
        }

        [HttpGet]
        [Route("api/ingestion/messages/{messageId:guid}")]
        /// <summary>Returns the status and details of one ingestion message.</summary>
        public async Task<ActionResult<IngestionMessage>> GetMessageAsync(Guid messageId, CancellationToken cancellationToken)
        {
            return Ok(await store.GetMessageAsync(messageId, cancellationToken));
        }

        [HttpGet]
        [Route("api/ingestion/messages/{status}")]
        /// <summary>Returns ingestion messages in the requested supported queue state.</summary>
        public async Task<ActionResult<List<IngestionMessage>>> GetMessagesByStatusAsync(string status, CancellationToken cancellationToken)
        {
            return Ok(await store.GetMessagesByStatusAsync(status, cancellationToken));
        }

        [HttpPost]
        [Route("api/ingestion/submit")]
        /// <summary>Validates a machine event and durably queues it, returning duplicate or conflict outcomes when applicable.</summary>
        public async Task<IActionResult> SubmitEvent([FromBody] MachineEventRequest request, [FromQuery] string? failureMode, CancellationToken cancellationToken)
        {
            // Validate the request data
            if (request.StartedAtUtc == default)
            {
                return BadRequest(new ApiError("StartedAtUtc must be provided."));
            }
            if (request.EndedAtUtc.HasValue && request.EndedAtUtc.Value < request.StartedAtUtc)
            {
                return BadRequest(new ApiError("EndedAtUtc cannot be earlier than StartedAtUtc."));
            }
            if (!ValidReasons.Contains(request.Reason))
            {
                return BadRequest(new ApiError($"Reason must be one of the following: {string.Join(", ", ValidReasons)}"));
            }

            // Enqueue the request and handle potential conflicts
            Tuple<MachineEventResponse?, bool> result = await store.EnqueueAsync(request, failureMode, cancellationToken);
            MachineEventResponse? response = result.Item1;
            bool conflict = result.Item2;
            // If the request has already been submitted with a different payload, return a 409 Conflict
            if (conflict)
            {
                logger.LogError("Conflict detected for sourceEventId {SourceEventId} with a different payload.", request.SourceEventId);
                return Conflict(new ApiError("sourceEventId has already been submitted with a different payload."));
            }
            // If the request is a duplicate, return a 200 OK with the existing message details
            if (response?.IsDuplicate == true)
            {
                logger.LogInformation("Duplicate event {SourceEventId} detected, returning existing message {MessageId}", response.SourceEventId, response.MessageId);
                return Ok(response);
            }
            // If the request is new, return a 202 Accepted with the message details
            logger.LogInformation("Durably queued event {SourceEventId} as message {MessageId}", response.SourceEventId, response.MessageId);
            return AcceptedAtAction(nameof(GetMessageAsync), new { messageId = response.MessageId }, response);
        }
    }
}
