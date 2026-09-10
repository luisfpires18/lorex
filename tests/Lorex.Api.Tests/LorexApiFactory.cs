using Lorex.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Lorex.Api.Tests;

/// <summary>
/// Boots the real API host for integration tests against a throwaway in-memory SQLite
/// database, so tests never touch the developer database.
/// </summary>
public sealed class LorexApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<LorexDbContext>>();
            services.RemoveAll<LorexDbContext>();

            _connection.Open();
            Migrate();
            services.AddDbContext<LorexDbContext>(options => options.UseSqlite(_connection));
        });
    }

    /// <summary>
    /// Applies the real migrations to the throwaway database, so every test also proves the
    /// migration set builds a usable schema.
    ///
    /// Done on a context of its own, while the host is still being built, rather than after it
    /// is up. Startup work meets a migrated database in every real environment - development
    /// migrates before <c>app.Run</c>, a deployment migrates before the process starts - and the
    /// search-index backfill is exactly such a step. A test host that started against an empty
    /// database would be the one arrangement production never has.
    /// </summary>
    private void Migrate()
    {
        var options = new DbContextOptionsBuilder<LorexDbContext>().UseSqlite(_connection).Options;
        using var db = new LorexDbContext(options);
        db.Database.Migrate();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
        }
    }
}
