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
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record EntityPage(
    IReadOnlyList<EntitySummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

public sealed record TagResponse(Guid Id, string Name, int EntityCount);
