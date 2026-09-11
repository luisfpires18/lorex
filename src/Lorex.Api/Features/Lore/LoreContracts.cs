namespace Lorex.Api.Features.Lore;

// ---------- Entity types ----------

public sealed record EntityTypeRequest(
    string? Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    int? DisplayOrder);

public sealed record EntityTypeResponse(
    Guid Id,
    string Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    int DisplayOrder,
    int EntityCount,
    IReadOnlyList<FieldDefinitionResponse> Fields);

// ---------- Field definitions ----------

/// <summary>
/// <paramref name="Semantic"/> is optional and normally null: a field means nothing to
/// Lorex unless the author says it does. It is bound explicitly here, like every other
/// member, so nothing can be overposted onto the definition.
/// </summary>
public sealed record FieldDefinitionRequest(
    string? Name,
    EntityFieldKind Kind,
    bool IsRequired,
    int? DisplayOrder,
    string? DefaultValue,
    IReadOnlyList<string>? Options,
    EntityFieldSemantic? Semantic = null);

public sealed record FieldOptionResponse(Guid Id, string Value, int DisplayOrder);

public sealed record FieldDefinitionResponse(
    Guid Id,
    string Name,
    EntityFieldKind Kind,
    bool IsRequired,
    int DisplayOrder,
    string? DefaultValue,
    IReadOnlyList<FieldOptionResponse> Options,
    EntityFieldSemantic? Semantic);

// ---------- Entities ----------

/// <summary>One submitted field value. Only the member matching the field kind is read.</summary>
public sealed record FieldValueInput(
    Guid FieldDefinitionId,
    string? Text,
    double? Number,
    bool? Boolean,
    DateTime? Date,
    IReadOnlyList<Guid>? OptionIds,
    Guid? ReferencedEntityId);

public sealed record EntityRequest(
    Guid EntityTypeId,
    string? Name,
    string? Summary,
    string? Content,
    CanonStatus CanonStatus,
    IReadOnlyList<string>? Aliases,
    IReadOnlyList<string>? Tags,
    IReadOnlyList<FieldValueInput>? Fields);

/// <summary>
/// <paramref name="ReferencedEntityIsTrashed"/> says the reference still points at real lore
/// that is currently in the Trash. The id and the name are still reported, deliberately: this
/// value belongs to the *live* entry holding it, and the client sends its whole field set back
/// on every save, so hiding the reference would delete it the next time the author touched an
/// unrelated field. The client greys it out instead of following it.
/// </summary>
public sealed record FieldValueResponse(
    Guid FieldDefinitionId,
    string Name,
    EntityFieldKind Kind,
    string? Text,
    double? Number,
    bool? Boolean,
    DateTime? Date,
    IReadOnlyList<Guid> OptionIds,
    IReadOnlyList<string> OptionValues,
    Guid? ReferencedEntityId,
    string? ReferencedEntityName,
    bool ReferencedEntityIsTrashed);

/// <summary>
/// The entry's primary image, as identity and shape - never as a URL.
///
/// The client composes <c>/api/universes/{u}/entities/{e}/image/{assetId}/{variant}</c> from
/// these, which is the same derivation on the other side of the wire and keeps the contract
/// free of anything that would go stale if the route moved. Nothing that names Cloudflare, a
/// bucket or an endpoint is ever in a response.
///
/// <paramref name="Width"/> and <paramref name="Height"/> are the original's, sent so the client
/// can reserve the right space before a byte of the image has arrived.
///
/// <paramref name="ThumbnailId"/> names the thumbnail currently cut from that original. It is in
/// the thumbnail's route for the same reason the asset id is in both: choosing a new framing makes
/// a new thumbnail with a new address, so a cached one can never be served for the wrong crop.
///
/// <paramref name="Crop"/> is the square the thumbnail was cut from. Null only for a picture
/// stored before the author chose one, whose thumbnail is the centred square.
/// </summary>
public sealed record EntityImageRef(
    Guid AssetId,
    Guid ThumbnailId,
    int Width,
    int Height,
    string ContentType,
    string? FileName,
    long ByteSize,
    DateTime UploadedAt,
    EntityImageCrop? Crop)
{
    public static EntityImageRef Of(EntityImage image) => new(
        image.AssetId,
        image.ThumbnailId,
        image.Width,
        image.Height,
        image.ContentType,
        image.FileName,
        image.ByteSize,
        image.UploadedAt,
        EntityImageCrop.Of(image));
}

/// <summary>
/// The square a thumbnail is cut from, as fractions of the original rather than pixels of any
/// screen: <paramref name="X"/> and <paramref name="Width"/> of its width, <paramref name="Y"/> and
/// <paramref name="Height"/> of its height, from the top-left corner.
///
/// Fractions are what make the crop the picture's rather than the browser's. The same four
/// numbers select the same pixels however large the cropper was drawn, and whether the server
/// is rendering the thumbnail now or an importer is regenerating it from a backup years later.
///
/// "The original" means the picture as it is displayed: after its EXIF orientation for a JPEG or
/// a PNG, and as stored for a WebP - which is how browsers draw each one, so the square an author
/// frames is the square that gets cut. <see cref="EntityImageProcessing"/> owns that rule.
/// </summary>
public sealed record EntityImageCrop(double X, double Y, double Width, double Height)
{
    internal static EntityImageCrop? Of(EntityImage image) =>
        image is { CropX: { } x, CropY: { } y, CropWidth: { } width, CropHeight: { } height }
            ? new EntityImageCrop(x, y, width, height)
            : null;
}

/// <summary>
/// A new framing for the picture an entry already has.
///
/// <paramref name="AssetId"/> is the picture the author was looking at when they chose it. If the
/// image has been replaced since, the fractions describe a different picture, and the request is
/// refused rather than applied to it.
/// </summary>
public sealed record EntityThumbnailRequest(Guid AssetId, EntityImageCrop? Crop);

/// <summary>Card row. Carries enough to render a type-aware card, and no universe or owner id.</summary>
public sealed record EntitySummary(
    Guid Id,
    string Name,
    string? Summary,
    CanonStatus CanonStatus,
    bool IsArchived,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    EntityImageRef? Image,
    DateTime UpdatedAt);

public sealed record EntityDetail(
    Guid Id,
    string Name,
    string? Summary,
    string? Content,
    CanonStatus CanonStatus,
    bool IsArchived,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<FieldValueResponse> Fields,
    EntityImageRef? Image,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record EntityPage(
    IReadOnlyList<EntitySummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

public sealed record TagResponse(Guid Id, string Name, int EntityCount);
