using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Timeline;

/// <summary>
/// Timeline entries inside one universe. Every route proves universe ownership first, then
/// re-resolves every id the client sent inside that same universe, so an entry id or an
/// entity id from somewhere else is refused without ever confirming that it exists.
/// </summary>
public static class TimelineEndpoints
{
    private const int DefaultPageSize = 25;
    private const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapTimelineEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/timeline")
            .WithTags("Timeline")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListTimelineEntries");
        group.MapPost("/", CreateAsync).WithName("CreateTimelineEntry");
        group.MapGet("/{entryId:guid}", GetAsync).WithName("GetTimelineEntry");
        group.MapPut("/{entryId:guid}", UpdateAsync).WithName("UpdateTimelineEntry");
        group.MapDelete("/{entryId:guid}", DeleteAsync).WithName("DeleteTimelineEntry");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] CanonStatus? canonStatus = null,
        [FromQuery] Guid? entityId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.UniverseId == universeId);

        if (canonStatus is { } status)
        {
            query = query.Where(entry => entry.CanonStatus == status);
        }

        if (entityId is { } participant)
        {
            // Scoped to this universe by the outer filter already, so an id from another
            // universe simply matches nothing rather than reporting that it is foreign.
            query = query.Where(entry => entry.EntityLinks.Any(link => link.EntityId == participant));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var rows = await Ordered(query)
            .Skip(skip)
            .Take(pageSize)
            .Select(Projection())
            .ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new TimelineEntryPage(
            rows.Select(Map).ToList(), page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid entryId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var entry = await LoadAsync(db, universeId, entryId, cancellationToken);
        return entry is null ? Results.NotFound() : Results.Ok(entry);
    }

    /// <summary>
    /// Gated: a Canon moment dated outside a Canon participant's declared lifespan is exactly
    /// what <c>CANON-LIFE-002</c> and <c>CANON-LIFE-003</c> report, and this route is where
    /// the date, the Canon status and the participants all arrive at once.
    /// </summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] TimelineEntryRequest request,
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
            token => CreateCoreAsync(universeId, request, db, token),
            cancellationToken);
    }

    private static async Task<IResult> CreateCoreAsync(
        Guid universeId,
        TimelineEntryRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (TimelineValidation.Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ResolveEntitiesAsync(db, universeId, request, cancellationToken)
            is not { } entityIds)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["entityIds"] = ["Link entries from this universe."],
            });
        }

        var now = DateTime.UtcNow;
        var entry = new TimelineEntry
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Title = TimelineValidation.Normalize(request.Title)!,
            CreatedAt = now,
            UpdatedAt = now,
        };

        Apply(entry, request);

        foreach (var id in entityIds)
        {
            entry.EntityLinks.Add(new TimelineEntryLink { EntityId = id });
        }

        db.TimelineEntries.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        var created = await LoadAsync(db, universeId, entry.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/timeline/{entry.Id}", created);
    }

    /// <summary>
    /// Gated for the same reasons as creation: redating a moment, promoting it to Canon or
    /// adding a participant can each put a Canon moment outside a Canon lifespan.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid entryId,
        [FromBody] TimelineEntryRequest request,
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
            token => UpdateCoreAsync(universeId, entryId, request, db, token),
            cancellationToken);
    }

    private static async Task<IResult> UpdateCoreAsync(
        Guid universeId,
        Guid entryId,
        TimelineEntryRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entry = await db.TimelineEntries
            .Include(candidate => candidate.EntityLinks)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == entryId && candidate.UniverseId == universeId,
                cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        if (TimelineValidation.Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ResolveEntitiesAsync(db, universeId, request, cancellationToken)
            is not { } entityIds)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["entityIds"] = ["Link entries from this universe."],
            });
        }

        entry.Title = TimelineValidation.Normalize(request.Title)!;
        Apply(entry, request);
        entry.UpdatedAt = DateTime.UtcNow;

        // The request carries the whole participant set, so the stored links are made to
        // match it: anything absent is dropped, anything new is added, and a link that was
        // already there keeps its row.
        var wanted = entityIds.ToHashSet();

        foreach (var link in entry.EntityLinks.Where(link => !wanted.Contains(link.EntityId)).ToList())
        {
            entry.EntityLinks.Remove(link);
        }

        var existing = entry.EntityLinks.Select(link => link.EntityId).ToHashSet();

        foreach (var id in entityIds.Where(id => !existing.Contains(id)))
        {
            entry.EntityLinks.Add(new TimelineEntryLink { TimelineEntryId = entry.Id, EntityId = id });
        }

        await db.SaveChangesAsync(cancellationToken);

        var updated = await LoadAsync(db, universeId, entry.Id, cancellationToken);
        return Results.Ok(updated);
    }

    /// <summary>Not gated: removing a moment removes the only findings it could contribute to.</summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid entryId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var entry = await db.TimelineEntries.FirstOrDefaultAsync(
            candidate => candidate.Id == entryId && candidate.UniverseId == universeId,
            cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        db.TimelineEntries.Remove(entry);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    // ---------- Writing ----------

    /// <summary>Copies the chronology and status across. Title is set by the caller.</summary>
    private static void Apply(TimelineEntry entry, TimelineEntryRequest request)
    {
        entry.Description = TimelineValidation.Normalize(request.Description);
        entry.CanonStatus = request.CanonStatus;
        entry.DateKind = request.DateKind;
        entry.StartYear = request.StartYear;
        entry.StartMonth = request.StartMonth;
        entry.StartDay = request.StartDay;
        entry.EndYear = request.EndYear;
        entry.EndMonth = request.EndMonth;
        entry.EndDay = request.EndDay;
        entry.EraLabel = TimelineValidation.Normalize(request.EraLabel);
    }

    /// <summary>
    /// Re-resolves every requested participant inside this universe. Returns null when any
    /// id does not resolve, which the caller reports as an unusable choice rather than as
    /// someone else's row, so the response discloses nothing about it.
    /// </summary>
    private static async Task<List<Guid>?> ResolveEntitiesAsync(
        LorexDbContext db,
        Guid universeId,
        TimelineEntryRequest request,
        CancellationToken cancellationToken)
    {
        var requested = request.EntityIds?.Distinct().ToList() ?? [];

        if (requested.Count == 0)
        {
            return requested;
        }

        var resolved = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && requested.Contains(entity.Id))
            .Select(entity => entity.Id)
            .ToListAsync(cancellationToken);

        return resolved.Count == requested.Count ? requested : null;
    }

    // ---------- Reading ----------

    /// <summary>
    /// The chronological order, done in SQL so paging stays stable.
    ///
    /// Unknown dates go last as a block: they are placed in the story but not in time, and
    /// leaving them among year zero would be arbitrary. Within a year, an entry known only
    /// to the year comes before any dated moment inside it, because an absent month counts
    /// as zero. Title then id break the remaining ties, so two moments in the same year
    /// never swap places between one page and the next.
    ///
    /// Era labels take no part: Phase 008 does no cross-era arithmetic, so entries under
    /// different eras still order by their raw year numbers.
    /// </summary>
    private static IOrderedQueryable<TimelineEntry> Ordered(IQueryable<TimelineEntry> query) =>
        query
            .OrderBy(entry => entry.DateKind == TimelineDateKind.Unknown ? 1 : 0)
            .ThenBy(entry => entry.StartYear)
            .ThenBy(entry => entry.StartMonth ?? 0)
            .ThenBy(entry => entry.StartDay ?? 0)
            .ThenBy(entry => entry.Title)
            .ThenBy(entry => entry.Id);

    private static async Task<TimelineEntryResponse?> LoadAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entryId,
        CancellationToken cancellationToken)
    {
        var row = await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.Id == entryId && entry.UniverseId == universeId)
            .Select(Projection())
            .FirstOrDefaultAsync(cancellationToken);

        return row is null ? null : Map(row);
    }

    /// <summary>
    /// The stored shape, flat. Precision is worked out afterwards in memory rather than
    /// pushed into SQL, so the query stays one statement and the DTO stays derived.
    /// </summary>
    private sealed record Row(
        Guid Id,
        string Title,
        string? Description,
        CanonStatus CanonStatus,
        TimelineDateKind DateKind,
        int? StartYear,
        int? StartMonth,
        int? StartDay,
        int? EndYear,
        int? EndMonth,
        int? EndDay,
        string? EraLabel,
        List<TimelineEntityLink> Entities,
        DateTime CreatedAt,
        DateTime UpdatedAt);

    private static System.Linq.Expressions.Expression<Func<TimelineEntry, Row>> Projection() =>
        entry => new Row(
            entry.Id,
            entry.Title,
            entry.Description,
            entry.CanonStatus,
            entry.DateKind,
            entry.StartYear,
            entry.StartMonth,
            entry.StartDay,
            entry.EndYear,
            entry.EndMonth,
            entry.EndDay,
            entry.EraLabel,
            entry.EntityLinks
                .OrderBy(link => link.Entity!.Name)
                .ThenBy(link => link.EntityId)
                .Select(link => new TimelineEntityLink(
                    link.EntityId,
                    link.Entity!.Name,
                    link.Entity.EntityTypeId,
                    link.Entity.EntityType!.Name,
                    link.Entity.EntityType.Icon,
                    link.Entity.EntityType.AccentColor,
                    link.Entity.CanonStatus))
                .ToList(),
            entry.CreatedAt,
            entry.UpdatedAt);

    private static TimelineEntryResponse Map(Row row) =>
        new(
            row.Id,
            row.Title,
            row.Description,
            row.CanonStatus,
            new TimelineDate(
                row.DateKind,
                row.StartYear,
                row.StartMonth,
                row.StartDay,
                row.EndYear,
                row.EndMonth,
                row.EndDay,
                row.EraLabel,
                TimelineValidation.PrecisionOf(row.StartYear, row.StartMonth, row.StartDay),
                TimelineValidation.PrecisionOf(row.EndYear, row.EndMonth, row.EndDay)),
            row.Entities,
            row.CreatedAt,
            row.UpdatedAt);
}
