using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Lorex.Api.Tests;

/// <summary>
/// Account storage over a real SQLite file (ADR 0042): each request its own connection, every transaction IMMEDIATE,
/// which is the only setting in which two uploads can genuinely race. Uploads that would together pass the allowance
/// land one at a time and the rest are refused; an upload still on its way to the bucket already counts. And the
/// migration gives every account that existed before it the default allowance.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class StorageQuotaRaceTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before account storage.</summary>
    private const string Before = "20261005200148_AddChronologyCalendars";

    private static readonly byte[] Picture = RestoreTestClient.Png(240, 180, seed: 7);

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-storage-race", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Racing_uploads_never_take_more_than_the_allowance()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var (client, userId) = await Register(host, "user-sqrace", "sqrace@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Race world")).Id;
        var entries = new List<Guid>();
        for (var index = 0; index < 4; index++)
        {
            entries.Add(await PlotTestClient.CreateEntity(client, u, $"Racer {index}"));
        }

        // Room for one picture and most of a second: "quota 100, two uploads of 60".
        await SetQuota(userId, Picture.Length + (Picture.Length / 2));

        // Every upload that gets as far as the bucket is held there until each of the others has either got there too
        // or been answered. So all of them are in flight at once - each has passed, or failed, its storage check while
        // none has committed - and whatever lands, lands only after every check has run. Without holds, all four
        // would reach the bucket.
        var inFlight = 0;
        var settled = 0;
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Check()
        {
            if (Volatile.Read(ref inFlight) + Volatile.Read(ref settled) == entries.Count)
            {
                release.TrySetResult();
            }
        }

        host.Media.BeforePut = async key =>
        {
            if (key.Contains("original", StringComparison.Ordinal))
            {
                Interlocked.Increment(ref inFlight);
                Check();
                await release.Task.WaitAsync(TimeSpan.FromSeconds(60));
            }
        };

        var responses = await Task.WhenAll(entries.Select(async entry =>
        {
            var response = await Upload(client, u, entry);
            if (response.StatusCode != HttpStatusCode.OK)
            {
                Interlocked.Increment(ref settled);
                Check();
            }

            return response;
        }));

        Assert.Equal(1, inFlight);

        Assert.Equal(1, responses.Count(response => response.StatusCode == HttpStatusCode.OK));
        Assert.All(responses, response => Assert.Contains(response.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }));
        foreach (var refused in responses.Where(response => response.StatusCode == HttpStatusCode.Conflict))
        {
            Assert.Contains(StorageQuota.ExceededCode, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        SqliteConnection.ClearAllPools();
        await using var db = Context();
        Assert.Equal(Picture.Length, await db.EntityImages.SumAsync(image => image.ByteSize));
        Assert.Equal(0, await db.StorageReservations.CountAsync());
        Assert.Equal(2, host.Media.Keys.Count);
    }

    [Fact]
    public async Task An_upload_still_on_its_way_to_the_bucket_already_counts()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var (client, userId) = await Register(host, "user-sqflight", "sqflight@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Flight world")).Id;
        var slow = await PlotTestClient.CreateEntity(client, u, "Slow");
        var fast = await PlotTestClient.CreateEntity(client, u, "Fast");
        await SetQuota(userId, Picture.Length + (Picture.Length / 2));

        var reached = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        host.Media.BeforePut = async key =>
        {
            if (key.Contains(slow.ToString("D"), StringComparison.Ordinal) && key.Contains("original", StringComparison.Ordinal))
            {
                reached.TrySetResult();
                await release.Task;
            }
        };

        // The slow upload has its room and is writing to the bucket; nothing of it is in the database yet.
        var pending = Upload(client, u, slow);
        await reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var second = await Upload(client, u, fast);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        release.SetResult();
        Assert.Equal(HttpStatusCode.OK, (await pending).StatusCode);

        SqliteConnection.ClearAllPools();
        await using var db = Context();
        Assert.Equal(Picture.Length, await db.EntityImages.SumAsync(image => image.ByteSize));
        Assert.Equal(0, await db.StorageReservations.CountAsync());
    }

    [Fact]
    public async Task Every_account_from_before_the_migration_gets_the_default_allowance()
    {
        Directory.CreateDirectory(_directory);
        string userId;

        await using (var host = new FileHost(DataSource))
        {
            (_, userId) = await Register(host, "user-sqmig", "sqmig@example.test");
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(Before);
            Assert.DoesNotContain("StorageQuotaBytes", await Strings(db, "SELECT name AS Value FROM pragma_table_info('AspNetUsers')"));
            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'StorageReservations'"));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());

            Assert.Equal(StorageQuota.DefaultBytes, await db.Users.Where(user => user.Id == userId).Select(user => user.StorageQuotaBytes).SingleAsync());
            Assert.Equal(
                ["Id", "UserId", "Bytes", "CreatedAt", "ExpiresAt"],
                await Strings(db, "SELECT name AS Value FROM pragma_table_info('StorageReservations') ORDER BY cid"));
            Assert.Equal(["AspNetUsers CASCADE"], await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('StorageReservations')"));
            Assert.Contains("IX_StorageReservations_UserId_ExpiresAt", await Strings(db, "SELECT name AS Value FROM pragma_index_list('StorageReservations')"));

            // A hold of nothing, or less, is refused by the table itself.
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "INSERT INTO StorageReservations (Id, UserId, Bytes, CreatedAt, ExpiresAt) VALUES ({0}, {1}, 0, '2026-10-06 00:00:00', '2026-10-06 00:15:00')",
                Guid.NewGuid().ToString().ToUpperInvariant(), userId));

            // A hold goes with its account.
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO StorageReservations (Id, UserId, Bytes, CreatedAt, ExpiresAt) VALUES ({0}, {1}, 5, '2026-10-06 00:00:00', '2026-10-06 00:15:00')",
                Guid.NewGuid().ToString().ToUpperInvariant(), userId);
            await db.Database.ExecuteSqlRawAsync("DELETE FROM AspNetUsers WHERE Id = {0}", userId);
            Assert.Equal(0, await db.StorageReservations.CountAsync());
        }
    }

    // ---------- Helpers ----------

    private static async Task<(HttpClient Client, string UserId)> Register(FileHost host, string username, string email)
    {
        var client = host.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(username, email, Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private static async Task<HttpResponseMessage> Upload(HttpClient client, Guid universeId, Guid entityId)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Picture);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "picture.png");
        return await client.PutAsync($"/api/universes/{universeId}/entities/{entityId}/image", form);
    }

    private async Task SetQuota(string userId, long bytes)
    {
        await using var db = Context();
        await db.Users.Where(user => user.Id == userId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(user => user.StorageQuotaBytes, bytes));
    }

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        public TestMediaObjectStore Media { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
            builder.UseSetting("Media:Provider", "InMemory");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IMediaObjectStore>();
                services.AddSingleton<IMediaObjectStore>(Media);
            });
        }

        public HttpClient CreateHttpsClient() => CreateClient(
            new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();

        try
        {
            if (Directory.Exists(_directory))
            {
                Directory.Delete(_directory, recursive: true);
            }
        }
        catch (IOException)
        {
            // A handle Windows has not let go of yet; the directory is under the temp root and named for this run.
        }
    }
}
