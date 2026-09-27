using Lorex.Api.Features.Media;

namespace Lorex.Api.Features.Publishing;

// ---------- The owner's side: authenticated, owner-scoped ----------

/// <summary>
/// The public details an owner saves. Visibility is deliberately not here - it changes only through
/// publish and unpublish - and neither is the slug, which Lorex mints. A body carrying either has it
/// ignored, because these three members are all that is bound.
/// </summary>
public sealed record PublicationDetailsRequest(
    string? PublicSummary,
    UniverseCategory? Category,
    IReadOnlyList<UniverseGenres>? Genres);

/// <summary>
/// One universe's public face as its owner sees it in Settings: what is saved, whether it is public,
/// and what publishing it still needs (<see cref="Missing"/>, keyed as a validation problem is, in the
/// order a screen lists them). <see cref="AuthorDisplayName"/> is the owner's own public name.
/// </summary>
public sealed record PublicationState(
    string Name,
    UniverseVisibility Visibility,
    string? PublicSummary,
    UniverseCategory? Category,
    IReadOnlyList<UniverseGenres> Genres,
    string? PublicSlug,
    DateTime? PublishedAt,
    string? AuthorDisplayName,
    UniverseArtworkRef? Artwork,
    IReadOnlyDictionary<string, string[]> Missing);

/// <summary>
/// The artwork as its owner's client needs it: ids to compose the owner-only addresses of the
/// original and the card from, the picture's shape, and the frame to reopen the cropper on. No key
/// and no URL, as with every other picture (ADR 0019).
/// </summary>
public sealed record UniverseArtworkRef(
    Guid AssetId,
    Guid CardId,
    int Width,
    int Height,
    string ContentType,
    string? FileName,
    long ByteSize,
    DateTime UploadedAt,
    ImageCrop Crop)
{
    public static UniverseArtworkRef Of(UniverseArtwork artwork) => new(
        artwork.AssetId,
        artwork.CardId,
        artwork.Width,
        artwork.Height,
        artwork.ContentType,
        artwork.FileName,
        artwork.ByteSize,
        artwork.UploadedAt,
        new ImageCrop(artwork.CropX, artwork.CropY, artwork.CropWidth, artwork.CropHeight));
}

/// <summary>A new card frame for the artwork already stored; refused if the artwork was replaced since.</summary>
public sealed record UniverseArtworkCardRequest(Guid AssetId, ImageCrop? Crop);

// ---------- The public side: anonymous ----------

/// <summary>
/// A public universe, as anyone may read it. <b>An allow-list</b>: every member here was chosen to be
/// public, and it is built by a projection that names each one - never by serialising a universe and
/// leaving things out - so a property added to <c>Universe</c> can never reach this by accident. No
/// id, no owner, no username or email, no description, no colour, no audit dates, no object key.
///
/// None of these is ever null: the public query only returns universes that have all of them.
/// <see cref="Genres"/> are in their one fixed order. <see cref="CardImageUrl"/> is a same-origin
/// path that answers only while the universe is public. <see cref="PublishedAt"/> is when it was first
/// published.
/// </summary>
public sealed record PublicUniverse(
    string Slug,
    string Name,
    string PublicSummary,
    UniverseCategory Category,
    IReadOnlyList<UniverseGenres> Genres,
    string AuthorDisplayName,
    string CardImageUrl,
    DateTime PublishedAt);

/// <summary>One page of the public listing, most recently published first.</summary>
public sealed record PublicUniversePage(
    IReadOnlyList<PublicUniverse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

// ---------- The account's public name ----------

public sealed record PublicNameRequest(string? PublicDisplayName);

public sealed record PublicNameResponse(string? PublicDisplayName);
