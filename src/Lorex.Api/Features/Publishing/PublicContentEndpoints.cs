using System.Globalization;
using System.Text.Json.Nodes;
using Lorex.Api.Data;
using Lorex.Api.Features.Media;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Publishing;

/// <summary>
/// What a public universe's author published inside it (Tasks 010-011): the listings of its published lore entries and
/// stories, each one's own page, and an entry's thumbnail. Mapped on <see cref="PublicUniverseEndpoints"/>' group,
/// so anonymous, read-only and <c>no-cache</c> like the rest of the portal's API.
///
/// <para><b>Both levels, always.</b> Every read starts from <see cref="PublicationRules.PublicLore"/> or
/// <see cref="PublicationRules.PublicStories"/>, which hold the universe predicate inside them: an entry is listed
/// only while it is selected, out of the Trash, and in a public universe. A private, missing or incomplete universe
/// is the same 404 as the universe routes give, whatever it holds; a public one with nothing published is an empty
/// page, never a hint of what is private.</para>
///
/// <para><b>Allow-lists, projected.</b> <see cref="PublicLoreEntry"/> and <see cref="PublicStory"/> are built member
/// by member from the columns they name, and so are <see cref="PublicLoreDetail"/> and a story's page. No entry, story or
/// workspace response is serialised: no ids, fields, relationships, Canon, history, chapters, scenes, manuscript, plot
/// or notes. An entry's article is on its own page only, with its workspace links removed.</para>
///
/// <para><b>Order.</b> Neither kind has an order an author sets for a whole universe, so both read the way the
/// workspace lists them - by name or title, case aside - with the address breaking ties, so pages never repeat or
/// skip. No popularity, no recency ranking. Paging is clamped as every Lorex list is.</para>
/// </summary>
public static class PublicContentEndpoints
{
    public static RouteGroupBuilder MapPublicContentEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/{slug}/lore", ListLoreAsync).WithName("ListPublicLore");
        group.MapGet("/{slug}/lore/{loreSlug}", GetLoreAsync).WithName("GetPublicLore");
        group.MapGet("/{slug}/lore/{loreSlug}/thumbnail/{thumbnailId:guid}", ReadLoreThumbnailAsync)
            .WithName("ReadPublicLoreThumbnail");
        group.MapGet("/{slug}/stories", ListStoriesAsync).WithName("ListPublicStories");
        group.MapGet("/{slug}/stories/{storySlug}", GetStoryAsync).WithName("GetPublicStory");

        return group;
    }

    private static async Task<IResult> ListLoreAsync(
        string slug,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PublicUniverseEndpoints.DefaultPageSize)
    {
        if (await PublicUniverseIdAsync(db, slug, cancellationToken) is not { } universeId)
        {
            return Results.NotFound();
        }

        (page, pageSize) = Clamp(page, pageSize);

        var query = PublicationRules.PublicLore(db).AsNoTracking().Where(entity => entity.UniverseId == universeId);
        var totalCount = await query.CountAsync(cancellationToken);

        var rows = await query
            .OrderBy(entity => EF.Functions.Collate(entity.Name, "NOCASE"))
            .ThenBy(entity => entity.PublicSlug)
            .Skip(Skip(page, pageSize))
            .Take(pageSize)
            .Select(entity => new
            {
                Slug = entity.PublicSlug!,
                entity.Name,
                entity.Summary,
                TypeName = entity.EntityType!.Name,
                ThumbnailId = entity.Image == null ? (Guid?)null : entity.Image.ThumbnailId,
                PublishedAt = entity.PublishedAt!.Value,
            })
            .ToListAsync(cancellationToken);

        return Results.Ok(Page(
            [.. rows.Select(row => new PublicLoreEntry(
                row.Slug,
                row.Name,
                row.Summary,
                row.TypeName,
                row.ThumbnailId is { } thumbnailId ? ThumbnailUrl(slug, row.Slug, thumbnailId) : null,
                row.PublishedAt))],
            page,
            pageSize,
            totalCount));
    }

    private static async Task<IResult> ListStoriesAsync(
        string slug,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = PublicUniverseEndpoints.DefaultPageSize)
    {
        if (await PublicUniverseIdAsync(db, slug, cancellationToken) is not { } universeId)
        {
            return Results.NotFound();
        }

        (page, pageSize) = Clamp(page, pageSize);

        var query = PublicationRules.PublicStories(db).AsNoTracking().Where(story => story.UniverseId == universeId);
        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderBy(story => EF.Functions.Collate(story.Title, "NOCASE"))
            .ThenBy(story => story.PublicSlug)
            .Skip(Skip(page, pageSize))
            .Take(pageSize)
            .Select(story => new PublicStory(story.PublicSlug!, story.Title, story.PublicSummary!, story.PublishedAt!.Value))
            .ToListAsync(cancellationToken);

        return Results.Ok(Page(items, page, pageSize, totalCount));
    }

    /// <summary>
    /// One published entry's page: the listing's members and its article. Found by both addresses through the lore
    /// predicate, so a private universe, a private or trashed entry and an address nobody holds are the same 404.
    /// </summary>
    private static async Task<IResult> GetLoreAsync(
        string slug,
        string loreSlug,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!PublicUniverseEndpoints.SlugShape().IsMatch(slug) || !PublicUniverseEndpoints.SlugShape().IsMatch(loreSlug))
        {
            return Results.NotFound();
        }

        var row = await PublicationRules.PublicLore(db).AsNoTracking()
            .Where(entity => entity.PublicSlug == loreSlug && entity.Universe!.PublicSlug == slug)
            .Select(entity => new
            {
                entity.Name,
                entity.Summary,
                TypeName = entity.EntityType!.Name,
                ThumbnailId = entity.Image == null ? (Guid?)null : entity.Image.ThumbnailId,
                PublishedAt = entity.PublishedAt!.Value,
                Article = db.EntityArticles.Where(article => article.EntityId == entity.Id).Select(article => article.Content).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? Results.NotFound()
            : Results.Ok(new PublicLoreDetail(
                loreSlug,
                row.Name,
                row.Summary,
                row.TypeName,
                row.ThumbnailId is { } thumbnailId ? ThumbnailUrl(slug, loreSlug, thumbnailId) : null,
                ReaderArticle(row.Article),
                row.PublishedAt));
    }

    /// <summary>One published story, as its listing shows it. Same predicate, same 404.</summary>
    private static async Task<IResult> GetStoryAsync(
        string slug,
        string storySlug,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!PublicUniverseEndpoints.SlugShape().IsMatch(slug) || !PublicUniverseEndpoints.SlugShape().IsMatch(storySlug))
        {
            return Results.NotFound();
        }

        var story = await PublicationRules.PublicStories(db).AsNoTracking()
            .Where(candidate => candidate.PublicSlug == storySlug && candidate.Universe!.PublicSlug == slug)
            .Select(candidate => new PublicStory(candidate.PublicSlug!, candidate.Title, candidate.PublicSummary!, candidate.PublishedAt!.Value))
            .FirstOrDefaultAsync(cancellationToken);

        return story is null ? Results.NotFound() : Results.Ok(story);
    }

    /// <summary>
    /// The article as a reader gets it: the stored Tiptap document with every link mark whose address is not an
    /// absolute http, https or mailto one removed - the text stays, the link goes - and its first-level headings read
    /// as second-level ones, under the page's own title. A relative link is the only kind an
    /// article can hold that points into Lorex, and inside Lorex it points into the workspace, carrying its ids. Null for
    /// no article, a cleared one, or one that cannot be read (written before articles were validated): a reader gets
    /// nothing rather than something broken.
    /// </summary>
    internal static string? ReaderArticle(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

        JsonNode? document;
        try
        {
            document = JsonNode.Parse(content);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }

        if (document is not JsonObject root || (string?)root["type"] is not "doc")
        {
            return null;
        }

        Unlink(root);
        return root.ToJsonString();
    }

    private static void Unlink(JsonObject node)
    {
        // The page's title is its one first-level heading: an article's own first-level headings read as the second level.
        if ((string?)node["type"] is "heading" && node["attrs"] is JsonObject attrs && attrs["level"] is JsonValue level
            && level.TryGetValue<int>(out var depth) && depth < 2)
        {
            attrs["level"] = 2;
        }

        if (node["marks"] is JsonArray marks)
        {
            for (var index = marks.Count - 1; index >= 0; index--)
            {
                if (marks[index] is JsonObject mark && (string?)mark["type"] is "link" && !IsReaderHref(mark["attrs"]?["href"]))
                {
                    marks.RemoveAt(index);
                }
            }

            if (marks.Count == 0)
            {
                node.Remove("marks");
            }
        }

        if (node["content"] is JsonArray children)
        {
            foreach (var child in children.OfType<JsonObject>())
            {
                Unlink(child);
            }
        }
    }

    private static bool IsReaderHref(JsonNode? href) =>
        href is JsonValue value
        && value.TryGetValue<string>(out var text)
        && Uri.TryCreate(text.Trim(), UriKind.Absolute, out var uri)
        && uri.Scheme is "http" or "https" or "mailto";

    /// <summary>
    /// A published entry's square thumbnail - never its original, which may carry what a camera wrote into it - and
    /// only the one it currently has. Found through <see cref="PublicationRules.PublicLore"/> by both addresses, so
    /// the address stops answering the moment the entry or its universe goes private, the entry goes to the Trash, or
    /// its picture is replaced, reframed or removed. The thumbnail id is an image version, not the entry's id.
    /// </summary>
    private static async Task<IResult> ReadLoreThumbnailAsync(
        string slug,
        string loreSlug,
        Guid thumbnailId,
        LorexDbContext db,
        IMediaObjectStore store,
        HttpContext context,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!PublicUniverseEndpoints.SlugShape().IsMatch(slug) || !PublicUniverseEndpoints.SlugShape().IsMatch(loreSlug))
        {
            return Results.NotFound();
        }

        var thumbnailKey = await PublicationRules.PublicLore(db).AsNoTracking()
            .Where(entity => entity.PublicSlug == loreSlug
                && entity.Universe!.PublicSlug == slug
                && entity.Image != null
                && entity.Image.ThumbnailId == thumbnailId)
            .Select(entity => entity.Image!.ThumbnailKey)
            .FirstOrDefaultAsync(cancellationToken);

        return thumbnailKey is null
            ? Results.NotFound()
            : await PublicUniverseEndpoints.ServeWebpAsync(thumbnailKey, thumbnailId, context, store, loggerFactory, cancellationToken);
    }

    internal static string ThumbnailUrl(string universeSlug, string loreSlug, Guid thumbnailId) =>
        string.Create(CultureInfo.InvariantCulture, $"/api/public/universes/{universeSlug}/lore/{loreSlug}/thumbnail/{thumbnailId:D}");

    /// <summary>The universe behind a public address, or null - private, missing and malformed alike. Never returned to anyone.</summary>
    private static async Task<Guid?> PublicUniverseIdAsync(LorexDbContext db, string slug, CancellationToken cancellationToken) =>
        PublicUniverseEndpoints.SlugShape().IsMatch(slug)
            ? await PublicationRules.Public(db).AsNoTracking()
                .Where(universe => universe.PublicSlug == slug)
                .Select(universe => (Guid?)universe.Id)
                .FirstOrDefaultAsync(cancellationToken)
            : null;

    private static (int Page, int PageSize) Clamp(int page, int pageSize) =>
        (Math.Max(page, 1), Math.Clamp(pageSize, 1, PublicUniverseEndpoints.MaxPageSize));

    private static int Skip(int page, int pageSize) => (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

    private static PublicContentPage<T> Page<T>(IReadOnlyList<T> items, int page, int pageSize, int totalCount) =>
        new(items, page, pageSize, totalCount, totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize));
}
