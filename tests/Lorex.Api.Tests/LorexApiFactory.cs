using Lorex.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

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
            services.AddDbContext<LorexDbContext>(options => options.UseSqlite(_connection));
        });
    }

    /// <summary>
    /// Applies the real migrations to the throwaway database, so every test also proves the
    /// migration set builds a usable schema.
    /// </summary>
    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);

        using var scope = host.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<LorexDbContext>().Database.Migrate();

        return host;
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
