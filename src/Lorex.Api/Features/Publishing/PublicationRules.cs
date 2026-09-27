using Lorex.Api.Data;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Publishing;

/// <summary>
/// What a universe needs before it may be public, and the one query that decides what the public
/// portal may read. Both live here so they cannot disagree.
/// </summary>
internal static class PublicationRules
{
    // The names a missing requirement is reported under - the same keys a validation problem's
    // errors use, so a client reads either the same way. The order is the order a screen lists them.
    public const string PublicSummary = "publicSummary";
    public const string Category = "category";
    public const string Genres = "genres";
    public const string Artwork = "artwork";
    public const string PublicDisplayName = "publicDisplayName";

    /// <summary>
    /// What is still missing for this universe to be published, in words an author acts on, keyed as
    /// above. Empty means it may be. The name and the slug are not here: a universe always has a name,
    /// and publishing mints the slug.
    /// </summary>
    public static Dictionary<string, string[]> Missing(
        string? publicSummary,
        UniverseCategory? category,
        UniverseGenres genres,
        bool hasArtwork,
        string? authorName)
    {
        var missing = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(publicSummary))
        {
            missing[PublicSummary] = ["Write a public summary."];
        }

        if (category is null)
        {
            missing[Category] = ["Choose a category."];
        }

        if (genres == UniverseGenres.None)
        {
            missing[Genres] = ["Choose at least one genre."];
        }

        if (!hasArtwork)
        {
            missing[Artwork] = ["Add the universe's artwork."];
        }

        if (string.IsNullOrWhiteSpace(authorName))
        {
            missing[PublicDisplayName] = ["Choose the public name your universes are published under."];
        }

        return missing;
    }

    /// <summary>
    /// Every universe the public portal may read, and nothing else. Every public route starts here.
    ///
    /// Visibility alone would be enough while every write path holds the requirements - and they do
    /// (ADR 0036). The rest of the predicate is the second lock: a universe that were somehow public
    /// without its summary, category, genres, artwork, author name or address is simply not public,
    /// rather than a record served with holes in it. It is also what lets the public contract promise
    /// that none of those fields is ever null.
    /// </summary>
    public static IQueryable<Universe> Public(LorexDbContext db) =>
        db.Universes
            .Where(universe => universe.Visibility == UniverseVisibility.Public
                && universe.PublicSlug != null
                && universe.PublishedAt != null
                && universe.PublicSummary != null
                && universe.Category != null
                && universe.Genres != UniverseGenres.None
                && universe.Owner!.PublicDisplayName != null
                && db.UniverseArtworks.Any(artwork => artwork.UniverseId == universe.Id));

    /// <summary>Every genre in <paramref name="genres"/>, in the one order they are always listed in.</summary>
    public static IReadOnlyList<UniverseGenres> List(UniverseGenres genres) =>
        [.. Enum.GetValues<UniverseGenres>().Where(genre => genre != UniverseGenres.None && genres.HasFlag(genre))];

    /// <summary>Whether <paramref name="genre"/> is exactly one genre Lorex knows.</summary>
    public static bool IsOneGenre(UniverseGenres genre) =>
        genre != UniverseGenres.None
        && System.Numerics.BitOperations.IsPow2((int)genre)
        && Enum.IsDefined(genre);
}
