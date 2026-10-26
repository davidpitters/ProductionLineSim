namespace ProductionLineSim.Classes
{
    public class LogPage<T>
    {
        public IReadOnlyList<T> Items { get; set; } = Array.Empty<T>();
        public int Limit { get; set; }
        public int Offset { get; set; }
        public bool HasMore { get; set; }
    }
}