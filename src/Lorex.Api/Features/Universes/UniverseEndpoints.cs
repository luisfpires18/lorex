using System.Security.Claims;
using System.Text.RegularExpressions;
using Lorex.Api.Data;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Universes;

/// <summary>
/// Universe CRUD. Every route in this group requires authentication, and every query
/// starts from the caller's own universes: there is no code path that reads or writes a
/// universe without an <c>OwnerId</c> filter.
/// </summary>
public static partial class UniverseEndpoints
{
    private const int DefaultPageSize = 12;
    private const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapUniverseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes")
            .WithTags("Universes")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListUniverses");
        group.MapPost("/", CreateAsync).WithName("CreateUniverse");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetUniverse");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateUniverse");
        group.MapPost("/{id:guid}/archive", ArchiveAsync).WithName("ArchiveUniverse");
        group.MapPost("/{id:guid}/unarchive", UnarchiveAsync).WithName("UnarchiveUniverse");
        group.MapDelete("/{id:guid}", DeleteAsync).WithName("DeleteUniverse");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? search = null,
        [FromQuery] bool includeArchived = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        var ownerId = principal.RequireUserId();

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.Universes.AsNoTracking().Where(universe => universe.OwnerId == ownerId);

        if (!includeArchived)
        {
            query = query.Where(universe => !universe.IsArchived);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{EscapeLike(search.Trim())}%";
            query = query.Where(universe => EF.Functions.Like(universe.Name, pattern, "\\"));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        // Widened before multiplying: an absurd page number would otherwise overflow to a
        // negative offset.
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        // Id breaks ties so paging stays stable when two universes share a timestamp.
        var items = await query
            .OrderByDescending(universe => universe.UpdatedAt)
            .ThenBy(universe => universe.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(universe => new UniverseSummary(
                universe.Id,
                universe.Name,
                universe.Description,
                universe.AccentColor,
                universe.IsArchived,
                universe.UpdatedAt))
            .ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new UniversePage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        var universe = await db.Universes.AsNoTracking()
            .Where(candidate => candidate.Id == id && candidate.OwnerId == ownerId)
            .Select(candidate => new UniverseDetail(
                candidate.Id,
                candidate.Name,
                candidate.Description,
                candidate.AccentColor,
                candidate.IsArchived,
                candidate.CreatedAt,
                candidate.UpdatedAt))
            .FirstOrDefaultAsync(cancellationToken);

        // 404 rather than 403: someone else's universe must not be distinguishable from
        // one that does not exist.
        return universe is null ? Results.NotFound() : Results.Ok(universe);
    }

    private static async Task<IResult> CreateAsync(
        [FromBody] CreateUniverseRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        if (Validate(request.Name, request.Description, request.AccentColor) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (await db.Universes.AnyAsync(
                universe => universe.OwnerId == ownerId && universe.Name == name,
                cancellationToken))
        {
            return NameTakenProblem();
        }

        var now = DateTime.UtcNow;
        var universe = new Universe
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            Name = name,
            Description = Normalize(request.Description),
            AccentColor = NormalizeAccent(request.AccentColor),
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Universes.Add(universe);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // The unique index settles a concurrent create of the same name.
            return NameTakenProblem();
        }

        // A universe is useless without somewhere to put things, so it starts with the
        // default entity types. Seeding is idempotent and only fills in missing names.
        await EntityTypeDefaults.EnsureAsync(db, universe.Id, cancellationToken);

        return Results.Created($"/api/universes/{universe.Id}", ToDetail(universe));
    }

    private static async Task<IResult> UpdateAsync(
        Guid id,
        [FromBody] UpdateUniverseRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        if (Validate(request.Name, request.Description, request.AccentColor) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var universe = await FindOwnedAsync(db, id, ownerId, cancellationToken);
        if (universe is null)
        {
            return Results.NotFound();
        }

        var name = request.Name!.Trim();

        if (!string.Equals(universe.Name, name, StringComparison.Ordinal)
            && await db.Universes.AnyAsync(
                other => other.OwnerId == ownerId && other.Name == name && other.Id != id,
                cancellationToken))
        {
            return NameTakenProblem();
        }

        universe.Name = name;
        universe.Description = Normalize(request.Description);
        universe.AccentColor = NormalizeAccent(request.AccentColor);
        universe.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return NameTakenProblem();
        }

        return Results.Ok(ToDetail(universe));
    }

    private static Task<IResult> ArchiveAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken) =>
        SetArchivedAsync(id, principal, db, archived: true, cancellationToken);

    private static Task<IResult> UnarchiveAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken) =>
        SetArchivedAsync(id, principal, db, archived: false, cancellationToken);

    private static async Task<IResult> SetArchivedAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        bool archived,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        var universe = await FindOwnedAsync(db, id, ownerId, cancellationToken);
        if (universe is null)
        {
            return Results.NotFound();
        }

        if (universe.IsArchived != archived)
        {
            universe.IsArchived = archived;
            universe.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(ToDetail(universe));
    }

    private static async Task<IResult> DeleteAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var universe = await FindOwnedAsync(db, id, ownerId, cancellationToken);
        if (universe is null)
        {
            return Results.NotFound();
        }

        // Deletion is permanent and there is no undo yet, so it is only offered for a
        // universe the owner has already archived.
        if (!universe.IsArchived)
        {
            return Results.Problem(
                title: "Universe is not archived",
                detail: "Archive the universe before deleting it.",
                statusCode: StatusCodes.Status409Conflict);
        }

        // Ideas belong to the account, not to the universe (ADR 0030): every idea about this
        // universe stays, unassigned, and only its references - to content deleted below - go.
        // Same transaction, so no idea can be left pointing into a universe that is gone.
        await IdeaReferences.ReleaseUniverseAsync(db, universe.Id, cancellationToken);

        db.Universes.Remove(universe);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static Task<Universe?> FindOwnedAsync(
        LorexDbContext db,
        Guid id,
        string ownerId,
        CancellationToken cancellationToken) =>
        db.Universes.FirstOrDefaultAsync(
            universe => universe.Id == id && universe.OwnerId == ownerId,
            cancellationToken);

    private static UniverseDetail ToDetail(Universe universe) =>
        new(universe.Id, universe.Name, universe.Description, universe.AccentColor,
            universe.IsArchived, universe.CreatedAt, universe.UpdatedAt);

    /// <summary>Also answered by a restore, which creates a universe under the same rule (ADR 0032).</summary>
    internal static IResult NameTakenProblem() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["You already have a universe with that name."],
        });

    /// <summary>Why a universe cannot be given this name, or null. Measured after trimming, which is what is stored.</summary>
    internal static string? NameError(string? name)
    {
        var trimmedName = name?.Trim();

        if (string.IsNullOrWhiteSpace(trimmedName))
        {
            return "Give the universe a name.";
        }

        return trimmedName.Length > UniverseConfiguration.NameMaxLength
            ? $"Keep the name under {UniverseConfiguration.NameMaxLength} characters."
            : null;
    }

    private static Dictionary<string, string[]>? Validate(string? name, string? description, string? accentColor)
    {
        var errors = new Dictionary<string, string[]>();

        if (NameError(name) is { } nameError)
        {
            errors["name"] = [nameError];
        }

        // Measured after trimming, because that is what actually gets stored.
        if (description?.Trim() is { Length: > UniverseConfiguration.DescriptionMaxLength })
        {
            errors["description"] =
                [$"Keep the description under {UniverseConfiguration.DescriptionMaxLength} characters."];
        }

        if (!string.IsNullOrWhiteSpace(accentColor) && !AccentColorPattern().IsMatch(accentColor.Trim()))
        {
            errors["accentColor"] = ["Use a colour like #4f6bd6."];
        }

        return errors.Count == 0 ? null : errors;
    }

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizeAccent(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();

    /// <summary>Escapes the LIKE wildcards so a search for "100%" cannot match everything.</summary>
    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex AccentColorPattern();
}

internal static class PrincipalExtensions
{
    /// <summary>
    /// The endpoints run behind <c>RequireAuthorization</c>, so a missing id means the
    /// pipeline is misconfigured rather than that the caller is anonymous.
    /// </summary>
    public static string RequireUserId(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("Authenticated principal is missing a user id claim.");
}
