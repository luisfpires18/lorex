using Lorex.Api.Data;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// Fills the search index for entries that have no row in it, once, at startup.
///
/// This is how lore written before full-text search existed becomes findable, and how a future
/// change to what is indexed gets picked up: the migration that changes the index empties the
/// table, and the next start rebuilds it. It is not a maintenance command and not a button in
/// Settings - an index the author has to remember to rebuild is an index that quietly lies about
/// what a universe contains.
///
/// Runs before the first request is served, and does one query when there is nothing to do. It
/// fails loudly if the schema is not there, because a start that carried on would answer every
/// search with an error instead.
/// </summary>
public sealed class EntitySearchBackfill(IServiceScopeFactory scopes) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();

        await EntitySearchIndex.BackfillAsync(db, cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

public static class LoreSearchSetup
{
    public static IServiceCollection AddLoreSearch(this IServiceCollection services)
    {
        services.AddHostedService<EntitySearchBackfill>();
        return services;
    }
}
