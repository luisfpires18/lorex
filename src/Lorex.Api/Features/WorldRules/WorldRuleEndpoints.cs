using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.WorldRules;

/// <summary>
/// A universe's world rules: explicit statements, in the author's own words, about how that world works (ADR 0033).
///
/// <b>Universe-scoped and owner-gated, first and always.</b> Every route proves the caller owns the universe through
/// <see cref="LoreAccess"/> before anything is read, and finds a rule only by its id and that universe together - so another
/// account's universe, a rule of another universe and a guessed id all answer the same 404 as one that does not exist.
///
/// <b>Nothing here touches anything else.</b> No route passes the Canon promotion gate, reconciles Canon Integrity, reindexes
/// lore or writes an entry, relationship, moment, story, idea or revision. A rule's words are never read for meaning. The only
/// other thing a save changes is the universe search's own derived copy of the text, written by a trigger (ADR 0031).
///
/// <b>No silent overwrite.</b> A save names the <c>updatedAt</c> it was written over; when the rule has moved on since - saved
/// from another tab or device - it is refused with 409 <c>world_rule_changed</c> and nothing is written. A save that would
/// change nothing writes nothing.
///
/// <b>Deleted into the Trash, not destroyed.</b> Deleting marks the rule; it leaves every list and route and waits in the
/// universe's Trash, whose restore route (<see cref="RestoreAsync"/>) clears the mark.
/// </summary>
public static class WorldRuleEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over a rule that has since changed.</summary>
    public const string ChangedCode = "world_rule_changed";

    private const int DefaultPageSize = 50;
    private const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapWorldRuleEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/world-rules")
            .WithTags("World rules")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListWorldRules");
        group.MapPost("/", CreateAsync).WithName("CreateWorldRule");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetWorldRule");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateWorldRule");
        group.MapDelete("/{id:guid}", DeleteAsync).WithName("DeleteWorldRule");

        return endpoints;
    }

    /// <summary>
    /// A page of the universe's live rules, by title - case folded, then as written, then by id - so the order is stable and
    /// says nothing about which rule matters more. A row carries the start of the description, never all of it.
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

        var query = db.WorldRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId && rule.DeletedAt == null);

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var rows = await query
            .OrderBy(rule => rule.Title.ToLower())
            .ThenBy(rule => rule.Title)
            .ThenBy(rule => rule.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(rule => new
            {
                rule.Id,
                rule.Title,
                // SQLite counts characters here, never half of one, so a shortened description cannot end mid-character.
                Excerpt = rule.Description.Substring(0, WorldRuleLimits.ExcerptLength),
                IsShortened = rule.Description.Length > WorldRuleLimits.ExcerptLength,
                rule.CreatedAt,
                rule.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(row => new WorldRuleSummary(row.Id, row.Title, row.Excerpt, row.IsShortened, Utc(row.CreatedAt), Utc(row.UpdatedAt)))
            .ToList();

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new WorldRulePage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var rule = await db.WorldRules.AsNoTracking().FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.UniverseId == universeId && candidate.DeletedAt == null,
            cancellationToken);

        return rule is null ? Results.NotFound() : Results.Ok(Detail(rule));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] WorldRuleRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var now = DateTime.UtcNow;
        var rule = new WorldRule
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Title = request.Title!.Trim(),
            Description = request.Description ?? string.Empty,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.WorldRules.Add(rule);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Created($"/api/universes/{universeId}/world-rules/{rule.Id}", Detail(rule));
    }

    /// <summary>Saves the rule whole: title and description together. Refused while the rule has changed since the edit began.</summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid id,
        [FromBody] WorldRuleRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        // One transaction for the comparison and the write, so nothing can land between them: SQLite has one writer.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // The rule before anything about the request is answered, so a rule of another universe is only ever a 404.
        var rule = await db.WorldRules.FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.UniverseId == universeId && candidate.DeletedAt == null,
            cancellationToken);
        if (rule is null)
        {
            return Results.NotFound();
        }

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (!SameMoment(rule.UpdatedAt, request.ExpectedUpdatedAt))
        {
            return Changed(rule.UpdatedAt);
        }

        var title = request.Title!.Trim();
        var description = request.Description ?? string.Empty;

        if (!string.Equals(rule.Title, title, StringComparison.Ordinal)
            || !string.Equals(rule.Description, description, StringComparison.Ordinal))
        {
            rule.Title = title;
            rule.Description = description;
            rule.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(Detail(rule));
    }

    /// <summary>
    /// Moves the rule to the universe's Trash, whole. Deleting a rule that is already there is refused as missing rather than
    /// re-stamped.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var rule = await db.WorldRules.FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.UniverseId == universeId && candidate.DeletedAt == null,
            cancellationToken);
        if (rule is null)
        {
            return Results.NotFound();
        }

        rule.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Brings a rule back from the Trash exactly as it was, mapped by the Trash under its own typed route. Only the marker moves:
    /// titles are not unique, so nothing is renamed, and a rule contributes no facts, so no Canon gate applies. A rule of another
    /// universe, one not in the Trash, or a guessed id answers as missing.
    /// </summary>
    public static async Task<IResult> RestoreAsync(
        Guid universeId,
        Guid worldRuleId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var rule = await db.WorldRules.FirstOrDefaultAsync(
            candidate => candidate.Id == worldRuleId && candidate.UniverseId == universeId && candidate.DeletedAt != null,
            cancellationToken);
        if (rule is null)
        {
            return Results.NotFound();
        }

        rule.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(Detail(rule));
    }

    // ---------- Shaping and checks ----------

    private static WorldRuleDetail Detail(WorldRule rule) =>
        new(rule.Id, rule.Title, rule.Description, Utc(rule.CreatedAt), Utc(rule.UpdatedAt));

    /// <summary>The request's own shape: a title, and text within its bounds. Nothing about what the words say.</summary>
    private static Dictionary<string, string[]>? Validate(WorldRuleRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        var title = request.Title?.Trim();
        if (string.IsNullOrEmpty(title))
        {
            errors["title"] = ["Give the rule a title, so you can find it again."];
        }
        else if (title.Length > WorldRuleLimits.TitleMaxLength)
        {
            errors["title"] = [$"Keep the title to {WorldRuleLimits.TitleMaxLength} characters or fewer."];
        }

        if (request.Description is { Length: > WorldRuleLimits.DescriptionMaxLength })
        {
            errors["description"] = [$"Keep the description to {WorldRuleLimits.DescriptionMaxLength:N0} characters or fewer."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>Compared as UTC ticks: SQLite hands a stored moment back with no kind, and JSON may carry it either way.</summary>
    private static bool SameMoment(DateTime stored, DateTime? expected) =>
        expected is { } moment && Utc(stored).Ticks == Utc(moment).Ticks;

    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    /// <summary>
    /// The refusal for a stale save. Carries the stored <c>updatedAt</c>, so a client whose author has seen the warning and
    /// still means to keep their own version can name it and save again - a decision made by a person, never by a retry.
    /// </summary>
    private static IResult Changed(DateTime current) =>
        Results.Problem(
            title: "World rule changed",
            detail: "This rule was saved somewhere else after it was opened here. Nothing was overwritten.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = ChangedCode,
                ["updatedAt"] = Utc(current),
            });
}
