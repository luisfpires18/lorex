using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Relationships;

// ---------- Relationship types ----------

public sealed record RelationshipTypeRequest(
    string? Name,
    string? InverseName,
    bool IsSymmetric,
    string? Description,
    int? DisplayOrder);

public sealed record RelationshipTypeResponse(
    Guid Id,
    string Name,
    string? InverseName,
    bool IsSymmetric,
    string? Description,
    int DisplayOrder,
    int RelationshipCount);

// ---------- Relationships ----------

public sealed record RelationshipRequest(
    Guid RelationshipTypeId,
    Guid SourceEntityId,
    Guid TargetEntityId,
    CanonStatus CanonStatus,
    DateTime? StartDate,
    DateTime? EndDate,
    string? Notes);

/// <summary>Which reading of a link a row is being shown under.</summary>
public enum RelationshipPerspective
{
    /// <summary>The viewpoint entity is the source: the type's forward name applies.</summary>
    Forward = 0,

    /// <summary>The viewpoint entity is the target: the type's inverse name applies.</summary>
    Inverse = 1,
}

/// <summary>The stored row as it is: source, target, and the type's own wording.</summary>
public sealed record RelationshipDetail(
    Guid Id,
    Guid RelationshipTypeId,
    string RelationshipTypeName,
    string? RelationshipTypeInverseName,
    bool IsSymmetric,
    Guid SourceEntityId,
    string SourceEntityName,
    Guid TargetEntityId,
    string TargetEntityName,
    CanonStatus CanonStatus,
    DateTime? StartDate,
    DateTime? EndDate,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// One link seen from one entity. <see cref="Label"/> is already resolved for that
/// viewpoint, so a client never has to reconstruct inverse wording itself. The stored
/// source and target are still carried, so the row stays editable in place.
/// </summary>
public sealed record RelationshipView(
    Guid Id,
    Guid RelationshipTypeId,
    string RelationshipTypeName,
    string? RelationshipTypeInverseName,
    bool IsSymmetric,
    RelationshipPerspective Perspective,
    string Label,
    Guid FromEntityId,
    Guid RelatedEntityId,
    string RelatedEntityName,
    Guid RelatedEntityTypeId,
    string RelatedEntityTypeName,
    string? RelatedEntityTypeIcon,
    string? RelatedEntityTypeAccentColor,
    CanonStatus RelatedEntityCanonStatus,
    Guid SourceEntityId,
    Guid TargetEntityId,
    CanonStatus CanonStatus,
    DateTime? StartDate,
    DateTime? EndDate,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt);
