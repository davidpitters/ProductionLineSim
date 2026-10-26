using ProductionLineSim.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddSingleton<SqliteStore>(serviceProvider => new SqliteStore(
    builder.Configuration.GetConnectionString("ProductionLine") ?? "Data Source=production-line-sim.db",
    serviceProvider.GetRequiredService<ILogger<SqliteStore>>()));
builder.Services.AddHostedService<IngestionQueueProcessor>();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var store = scope.ServiceProvider.GetRequiredService<SqliteStore>();
    await store.InitializeAsync();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
