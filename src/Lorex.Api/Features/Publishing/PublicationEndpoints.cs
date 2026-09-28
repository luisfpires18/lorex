using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Publishing;

/// <summary>
/// An owner preparing, publishing and unpublishing one universe's public shell (ADR 0036).
///
/// <para><b>Owner-scoped like every universe route.</b> Each one finds the universe by its id and the
/// session's user id together, so another account's universe is a 404, exactly like one that does
/// not exist. Nothing here is anonymous: the anonymous side is <see cref="PublicUniverseEndpoints"/>,
/// which only reads.</para>
///
/// <para><b>A public universe is never incomplete.</b> Publishing refuses until every requirement
/// holds, and while it is public a save that would break one is refused with the reason - make it
/// private first. The check and the write share one transaction, and Microsoft.Data.Sqlite begins
/// every transaction <c>IMMEDIATE</c>, so a publish and a save racing each other are serialised
/// rather than each passing its own check against the other's stale read.</para>
///
/// <para><b>Publishing publishes the shell only.</b> Nothing inside the universe - lore, stories,
/// timeline, ideas, rules, relationships, Canon, the Trash - is read or changed by any of this.</para>
/// </summary>
public static class PublicationEndpoints
{
    /// <summary>Publishing was refused because something it needs is missing; the errors say what.</summary>
    public const string IncompleteCode = "publication_incomplete";

    /// <summary>A save would leave a public universe without something publishing needs.</summary>
    public const string RequiredWhilePublicCode = "publication_required_while_public";

    public static IEndpointRouteBuilder MapPublicationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}")
            .WithTags("Publishing")
            .RequireAuthorization();

        group.MapGet("/publication", GetAsync).WithName("GetUniversePublication");
        group.MapPut("/publication", SaveAsync).WithName("SaveUniversePublication");

        // POST with no body, like archive: a transition, not a field. The cookie is SameSite=Strict,
        // so a cross-site form cannot carry the session to either of them.
        group.MapPost("/publish", PublishAsync).WithName("PublishUniverse");
        group.MapPost("/unpublish", UnpublishAsync).WithName("UnpublishUniverse");

        return endpoints;
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var state = await ReadStateAsync(db, universeId, principal.RequireUserId(), cancellationToken);
        return state is null ? Results.NotFound() : Results.Ok(state);
    }

    private static async Task<IResult> SaveAsync(
        Guid universeId,
        [FromBody] PublicationDetailsRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        var errors = new Dictionary<string, string[]>();
        var summary = string.IsNullOrWhiteSpace(request.PublicSummary) ? null : request.PublicSummary.Trim();

        if (summary is { Length: > PublicationLimits.SummaryMaxLength })
        {
            errors[PublicationRules.PublicSummary] =
                [$"Keep the public summary under {PublicationLimits.SummaryMaxLength} characters."];
        }

        if (request.Category is { } category && !Enum.IsDefined(category))
        {
            errors[PublicationRules.Category] = ["Choose one of Lorex's categories."];
        }

        var genres = UniverseGenres.None;
        foreach (var genre in request.Genres ?? [])
        {
            if (!PublicationRules.IsOneGenre(genre))
            {
                errors[PublicationRules.Genres] = ["Choose genres from Lorex's list."];
                break;
            }

            genres |= genre;
        }

        if (!errors.ContainsKey(PublicationRules.Genres)
            && System.Numerics.BitOperations.PopCount((uint)genres) > PublicationLimits.MaxGenres)
        {
            errors[PublicationRules.Genres] = [$"Choose at most {PublicationLimits.MaxGenres} genres."];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var universe = await db.Universes.FirstOrDefaultAsync(
            candidate => candidate.Id == universeId && candidate.OwnerId == ownerId,
            cancellationToken);

        if (universe is null)
        {
            return Results.NotFound();
        }

        if (universe.Visibility == UniverseVisibility.Public)
        {
            // Only what this save can take away: the artwork and the author's name have routes of their own.
            var needed = new Dictionary<string, string[]>();

            if (summary is null)
            {
                needed[PublicationRules.PublicSummary] =
                    ["A public universe needs its public summary. Make the universe private before removing it."];
            }

            if (request.Category is null)
            {
                needed[PublicationRules.Category] =
                    ["A public universe needs its category. Make the universe private before removing it."];
            }

            if (genres == UniverseGenres.None)
            {
                needed[PublicationRules.Genres] =
                    ["A public universe needs at least one genre. Make the universe private before removing them all."];
            }

            if (needed.Count > 0)
            {
                return Results.ValidationProblem(
                    needed,
                    extensions: new Dictionary<string, object?> { ["code"] = RequiredWhilePublicCode });
            }
        }

        if (universe.PublicSummary != summary || universe.Category != request.Category || universe.Genres != genres)
        {
            universe.PublicSummary = summary;
            universe.Category = request.Category;
            universe.Genres = genres;
            universe.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await ReadStateAsync(db, universeId, ownerId, cancellationToken));
    }

    /// <summary>
    /// Private to public, once everything it needs is there. The slug is minted the first time and
    /// kept for good; <c>PublishedAt</c> likewise. Publishing a public universe again changes nothing.
    /// </summary>
    private static async Task<IResult> PublishAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var universe = await db.Universes.FirstOrDefaultAsync(
            candidate => candidate.Id == universeId && candidate.OwnerId == ownerId,
            cancellationToken);

        if (universe is null)
        {
            return Results.NotFound();
        }

        if (universe.Visibility != UniverseVisibility.Public)
        {
            var hasArtwork = await db.UniverseArtworks.AnyAsync(artwork => artwork.UniverseId == universeId, cancellationToken);
            var authorName = await db.Users
                .Where(user => user.Id == ownerId)
                .Select(user => user.PublicDisplayName)
                .FirstOrDefaultAsync(cancellationToken);

            var missing = PublicationRules.Missing(
                universe.PublicSummary, universe.Category, universe.Genres, hasArtwork, authorName);

            if (missing.Count > 0)
            {
                return Results.ValidationProblem(
                    missing,
                    detail: "This universe is not ready to publish yet.",
                    extensions: new Dictionary<string, object?> { ["code"] = IncompleteCode });
            }

            var now = DateTime.UtcNow;
            universe.PublicSlug ??= await PublicSlugs.ChooseAsync(db, universe.Name, cancellationToken);
            universe.PublishedAt ??= now;
            universe.Visibility = UniverseVisibility.Public;
            universe.UpdatedAt = now;

            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await ReadStateAsync(db, universeId, ownerId, cancellationToken));
    }

    /// <summary>
    /// Public to private, at once: the next public read no longer finds it, because every public read
    /// asks the database and nothing public is cached. Its details, address and first publication
    /// date stay, for publishing it again.
    /// </summary>
    private static async Task<IResult> UnpublishAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        var universe = await db.Universes.FirstOrDefaultAsync(
            candidate => candidate.Id == universeId && candidate.OwnerId == ownerId,
            cancellationToken);

        if (universe is null)
        {
            return Results.NotFound();
        }

        if (universe.Visibility != UniverseVisibility.Private)
        {
            universe.Visibility = UniverseVisibility.Private;
            universe.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(await ReadStateAsync(db, universeId, ownerId, cancellationToken));
    }

    /// <summary>The owner's view of one universe's public face, or null when it is not theirs.</summary>
    internal static async Task<PublicationState?> ReadStateAsync(
        LorexDbContext db,
        Guid universeId,
        string ownerId,
        CancellationToken cancellationToken)
    {
        var universe = await db.Universes.AsNoTracking()
            .Where(candidate => candidate.Id == universeId && candidate.OwnerId == ownerId)
            .Select(candidate => new
            {
                candidate.Name,
                candidate.Visibility,
                candidate.PublicSummary,
                candidate.Category,
                candidate.Genres,
                candidate.PublicSlug,
                candidate.PublishedAt,
                Author = candidate.Owner!.PublicDisplayName,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (universe is null)
        {
            return null;
        }

        var artwork = await db.UniverseArtworks.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.UniverseId == universeId, cancellationToken);

        return new PublicationState(
            universe.Name,
            universe.Visibility,
            universe.PublicSummary,
            universe.Category,
            PublicationRules.List(universe.Genres),
            universe.PublicSlug,
            universe.PublishedAt,
            universe.Author,
            artwork is null ? null : UniverseArtworkRef.Of(artwork),
            PublicationRules.Missing(
                universe.PublicSummary, universe.Category, universe.Genres, artwork is not null, universe.Author));
    }
}
