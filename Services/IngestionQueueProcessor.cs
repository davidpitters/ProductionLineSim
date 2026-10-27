namespace ProductionLineSim.Services
{
    public class IngestionQueueProcessor(SqliteStore store, IConfiguration configuration, ILogger<IngestionQueueProcessor> logger) : BackgroundService
    {
        private readonly int _maxAttempts = Math.Max(1, configuration.GetValue("Ingestion:MaxAttempts", 3));
        private readonly TimeSpan _pollInterval = TimeSpan.FromMilliseconds(Math.Clamp(configuration.GetValue("Ingestion:PollIntervalMilliseconds", 1000), 100, 10000));
        /// <summary>Polls the queue, delaying when idle and continuing after recoverable processing errors.</summary>
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var processed = await store.ProcessOneAsync(_maxAttempts, stoppingToken);
                    if (!processed) await Task.Delay(_pollInterval, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception exception)
                {
                    logger.LogError(exception, "Queue processing failed; the worker will continue polling");
                    await Task.Delay(_pollInterval, stoppingToken);
                }
            }
        }
    }
}
