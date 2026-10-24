namespace ProductionLineSim.Classes
{
    public class ApiError
    {
        public string Error { get; }
        public string? Detail { get; }

        public ApiError(string error, string? detail = null)
        {
            Error = error;
            Detail = detail;
        }
    }
}
