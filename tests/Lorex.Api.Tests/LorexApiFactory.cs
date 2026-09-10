using Lorex.Api.Data;
using Lorex.Api.Features.Media;
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
///
/// Only the connection is swapped. The schema is built by the host's own startup migration,
/// exactly as it is in a deployment, so every test also proves the migration set produces a
/// usable schema and that startup work never runs ahead of it.
/// </summary>
public sealed class LorexApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");

    /// <summary>
    /// The object store this host writes images to. In-process, so no test reaches Cloudflare,
    /// and inspectable, so a test can assert on the keys that were written rather than only on
    /// what the API said about them.
    /// </summary>
    public TestMediaObjectStore Media { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<LorexDbContext>>();
            services.RemoveAll<LorexDbContext>();

            _connection.Open();
            services.AddDbContext<LorexDbContext>(options => options.UseSqlite(_connection));

            services.RemoveAll<IMediaObjectStore>();
            services.AddSingleton<IMediaObjectStore>(Media);
        });
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
