using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Data;

/// <summary>Wires the SQLite-backed <see cref="LorexDbContext"/> into the host.</summary>
public static class DatabaseSetup
{
    public const string ConnectionStringName = "LorexDb";

    public static IServiceCollection AddLorexDatabase(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var connectionString = configuration.GetConnectionString(ConnectionStringName)
            ?? throw new InvalidOperationException(
                $"Connection string '{ConnectionStringName}' is not configured.");

        connectionString = ResolveDataSourceDirectory(connectionString, environment.ContentRootPath);

        services.AddDbContext<LorexDbContext>(options => options.UseSqlite(connectionString));
        return services;
    }

    /// <summary>Applies pending migrations. Development-only; deployments run migrations explicitly.</summary>
    public static async Task MigrateLorexDatabaseAsync(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment())
        {
            return;
        }

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        await db.Database.MigrateAsync();
    }

    /// <summary>
    /// Makes a relative SQLite "Data Source" absolute against the content root and ensures
    /// the target directory exists, so the database lands in a predictable place.
    /// </summary>
    private static string ResolveDataSourceDirectory(string connectionString, string contentRootPath)
    {
        var sqliteBuilder = new SqliteConnectionStringBuilder(connectionString);
        var dataSource = sqliteBuilder.DataSource;

        if (string.IsNullOrWhiteSpace(dataSource)
            || dataSource.Equals(":memory:", StringComparison.OrdinalIgnoreCase)
            || dataSource.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
        {
            return connectionString;
        }

        var absolute = Path.GetFullPath(dataSource, contentRootPath);
        var directory = Path.GetDirectoryName(absolute);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        sqliteBuilder.DataSource = absolute;
        return sqliteBuilder.ToString();
    }
}
