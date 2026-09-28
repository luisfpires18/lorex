using System.Globalization;
using System.Text.RegularExpressions;
using Lorex.Api.Data;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;

namespace Lorex.Api.Features.Publishing;

/// <summary>
/// The public portal's API: anonymous, read-only, and the only routes in Lorex that answer without a
/// session (ADR 0036). Three reads - the listing, one universe by its address, and its card picture -
/// and nothing else. No route here writes, and no authenticated route is reachable through here.
///
/// <para><b>One query decides.</b> Every route starts from <see cref="PublicationRules.Public"/>, so a
/// private universe - or one that does not exist, or one some future bug left public but incomplete -
/// is the same 404 everywhere, and the body never says which. Nothing is cached in the process: the
/// next read after an unpublish no longer finds the universe. Every response here says
/// <c>no-cache</c>, so a browser or a proxy may keep a copy but must ask again before reusing it -
/// and asking again is what a private universe's picture answers with a 404.</para>
///
/// <para><b>An allow-list, projected.</b> Each response is built member by member from the columns
/// <see cref="PublicUniverse"/> names. No entity is serialised, and nothing inside the universe -
/// lore, stories, timeline, ideas, rules, relationships, Canon, the Trash - is read at all.</para>
/// </summary>
public static partial class PublicUniverseEndpoints
{
    private const int DefaultPageSize = 24;
    private const int MaxPageSize = 48;

    public static IEndpointRouteBuilder MapPublicUniverseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/public/universes")
            .WithTags("Public portal")
            .AllowAnonymous()
            .AddEndpointFilter(async (context, next) =>
            {
                context.HttpContext.Response.Headers.CacheControl = "no-cache";
                return await next(context);
            });

        group.MapGet("/", ListAsync).WithName("ListPublicUniverses");
        group.MapGet("/{slug}", GetAsync).WithName("GetPublicUniverse");
        group.MapGet("/{slug}/artwork/card/{cardId:guid}", ReadCardAsync).WithName("ReadPublicUniverseCard");

        return endpoints;
    }

    /// <summary>
    /// Public universes, most recently first published first, the address breaking ties. There is no
    /// popularity to sort by and none is invented. Filters and other orders are the portal's to add.
    /// </summary>
    private static async Task<IResult> ListAsync(
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = PublicationRules.Public(db).AsNoTracking();
        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var rows = await Project(db, query
                .OrderByDescending(universe => universe.PublishedAt)
                .ThenBy(universe => universe.PublicSlug)
                .Skip(skip)
                .Take(pageSize))
            .ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new PublicUniversePage([.. rows.Select(Public)], page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(string slug, LorexDbContext db, CancellationToken cancellationToken)
    {
        if (!SlugShape().IsMatch(slug))
        {
            return Results.NotFound();
        }

        var row = await Project(db, PublicationRules.Public(db).AsNoTracking().Where(universe => universe.PublicSlug == slug))
            .FirstOrDefaultAsync(cancellationToken);

        return row is null ? Results.NotFound() : Results.Ok(Public(row));
    }

    /// <summary>
    /// The card, and only the card - never the original, which may carry what a camera wrote into it.
    /// Answered only while the universe is public and only for the card it currently shows, so an
    /// address stops working the moment the universe goes private or its card is replaced.
    ///
    /// The card id is the entity tag: bytes under one id never change, so a browser holding the
    /// current card is told 304 without the store being asked for anything.
    /// </summary>
    private static async Task<IResult> ReadCardAsync(
        string slug,
        Guid cardId,
        LorexDbContext db,
        IMediaObjectStore store,
        HttpContext context,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!SlugShape().IsMatch(slug))
        {
            return Results.NotFound();
        }

        var cardKey = await PublicationRules.Public(db).AsNoTracking()
            .Where(universe => universe.PublicSlug == slug)
            .SelectMany(universe => db.UniverseArtworks.Where(artwork => artwork.UniverseId == universe.Id && artwork.CardId == cardId))
            .Select(artwork => artwork.CardKey)
            .FirstOrDefaultAsync(cancellationToken);

        if (cardKey is null)
        {
            return Results.NotFound();
        }

        var tag = new EntityTagHeaderValue($"\"{cardId:N}\"");
        context.Response.Headers.ETag = tag.ToString();

        if (context.Request.GetTypedHeaders().IfNoneMatch is { Count: > 0 } asked
            && asked.Any(candidate => candidate.Equals(EntityTagHeaderValue.Any) || candidate.Compare(tag, useStrongComparison: false)))
        {
            return Results.StatusCode(StatusCodes.Status304NotModified);
        }

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(cardKey, cancellationToken);
        }
        catch (MediaStorageException exception)
        {
            if (exception is MediaStorageFailedException)
            {
                LogStorageFailure(loggerFactory.CreateLogger("Lorex.PublicPortal"), exception);
            }

            return UniverseArtworkEndpoints.Unavailable(exception);
        }

        if (stored is null)
        {
            return Results.NotFound();
        }

        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.Stream(stored.Content, "image/webp", enableRangeProcessing: false);
    }

    /// <summary>The allow-listed columns and nothing else, straight from the query.</summary>
    private static IQueryable<PublicRow> Project(LorexDbContext db, IQueryable<Universe> universes) =>
        universes.Select(universe => new PublicRow(
            universe.PublicSlug!,
            universe.Name,
            universe.PublicSummary!,
            universe.Category!.Value,
            universe.Genres,
            universe.Owner!.PublicDisplayName!,
            db.UniverseArtworks.Where(artwork => artwork.UniverseId == universe.Id).Select(artwork => artwork.CardId).FirstOrDefault(),
            universe.PublishedAt!.Value));

    private static PublicUniverse Public(PublicRow row) => new(
        row.Slug,
        row.Name,
        row.PublicSummary,
        row.Category,
        PublicationRules.List(row.Genres),
        row.AuthorDisplayName,
        CardUrl(row.Slug, row.CardId),
        row.PublishedAt);

    internal static string CardUrl(string slug, Guid cardId) =>
        string.Create(CultureInfo.InvariantCulture, $"/api/public/universes/{slug}/artwork/card/{cardId:D}");

    private sealed record PublicRow(
        string Slug,
        string Name,
        string PublicSummary,
        UniverseCategory Category,
        UniverseGenres Genres,
        string AuthorDisplayName,
        Guid CardId,
        DateTime PublishedAt);

    /// <summary>Only what <see cref="PublicSlugs"/> can mint; anything else is not an address and costs no query.</summary>
    [GeneratedRegex("^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$")]
    private static partial Regex SlugShape();

    [LoggerMessage(Level = LogLevel.Error, Message = "Image storage failed while serving a public card.")]
    private static partial void LogStorageFailure(ILogger logger, Exception exception);
}
