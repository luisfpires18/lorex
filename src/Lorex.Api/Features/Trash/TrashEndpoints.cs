using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Trash;

/// <summary>
/// The Trash of one universe: what the author threw away, and the one action that brings it
/// back.
///
/// Only lore entries are trashable. Everything else the API deletes is either one small row a
/// deliberate action removed (a relationship, a moment), a derived record nothing authors (a
/// Canon conflict), or a configuration object whose deletion is already refused while anything
/// depends on it (a type, a field, an option, a relationship type). An entry is the one thing
/// whose deletion used to destroy a large amount of authored work at once - its article, its
/// values, its aliases, its whole history, and every relationship and timeline appearance that
/// rested on it - which is exactly why it is the one thing with a Trash. See
/// <c>docs/architecture/decisions/0015-entity-trash-and-restore.md</c>.
///
/// Universe-scoped and owner-gated on every route, through the same
/// <see cref="LoreAccess"/> check as the rest of the lore surface, so another author's Trash
/// answers 404 and stays indistinguishable from a universe that does not exist.
/// </summary>
public static class TrashEndpoints
{
    private const int DefaultPageSize = 12;
    private const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapTrashEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/trash")
            .WithTags("Trash")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListTrash");
        group.MapPost("/{entityId:guid}/restore", RestoreAsync).WithName("RestoreTrashedEntity");

        return endpoints;
    }

    /// <summary>
    /// Most recently thrown away first, which is the order a Trash is read in - the thing you
    /// regret is almost always the last thing you did. Id breaks the tie so two entries binned
    /// in the same tick never swap places between one page and the next.
    /// </summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.DeletedAt != null);

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var items = await query
            .OrderByDescending(entity => entity.DeletedAt)
            .ThenBy(entity => entity.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(entity => new TrashedEntity(
                entity.Id,
                entity.Name,
                entity.EntityTypeId,
                entity.EntityType!.Name,
                entity.EntityType.Icon,
                entity.EntityType.AccentColor,
                entity.CanonStatus,
                entity.DeletedAt!.Value))
            .ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new TrashPage(items, page, pageSize, totalCount, totalPages));
    }

    /// <summary>
    /// Puts one entry back, exactly as it was.
    ///
    /// Restore is a real mutation and is gated like any other. Bringing lore back adds facts to
    /// the universe - declared years, Canon participation, relationships and references that
    /// were dormant while their subject was in the Trash - and any of those can newly
    /// contradict what has been written since. So it runs under
    /// <see cref="CanonPromotionGate.RunAsync"/>: if the restored entry would introduce a High
    /// finding the universe does not already carry, the whole thing is rolled back with the
    /// same 409 an ordinary write gets, and the entry is still in the Trash afterwards. There
    /// is no partial restore, because there is nothing to restore in parts - one column moves.
    /// Medium and Low findings are recorded and block nothing, exactly as ADR 0012 says.
    ///
    /// Nothing here revalidates the entry, and that is deliberate rather than an omission.
    /// Every id the entry depends on is still resolvable by construction: its type cannot have
    /// been deleted (the foreign key is <c>Restrict</c> and a trashed entry still counts as
    /// using it), nor can a field definition holding one of its values or an option one of them
    /// chose - all three deletions are refused while a value exists, and a trashed entry's
    /// values are still values. So a restore puts back exactly the rows that were stored, and
    /// the only thing that can refuse it is canon.
    /// </summary>
    private static async Task<IResult> RestoreAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        return await gate.RunAsync(
            universeId,
            token => RestoreCoreAsync(universeId, entityId, db, token),
            cancellationToken);
    }

    private static async Task<IResult> RestoreCoreAsync(
        Guid universeId,
        Guid entityId,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entity = await db.Entities.FirstOrDefaultAsync(
            candidate => candidate.Id == entityId
                && candidate.UniverseId == universeId
                && candidate.DeletedAt != null,
            cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        // The whole restore. Everything the entry owns and everything that points at it never
        // moved, so clearing the marker is what reconnects them - there is no graph to rebuild
        // and therefore no half-rebuilt state to be left in.
        //
        // The name is not checked against anything. Entry names are not unique inside a
        // universe and never have been (the index on UniverseId, Name is not unique), so an
        // entry written while this one sat in the Trash cannot collide with it, and a restore
        // never renames what the author wrote.
        entity.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);

        var detail = await EntityEndpoints.LoadDetailAsync(db, universeId, entityId, cancellationToken);

        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }
}
