using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Relationships;

// ---------- Relationship types ----------

/// <summary>
/// <paramref name="CanonConstraints"/> is optional. On a create, null means no constraints. On an
/// update, null leaves the stored constraints exactly as they are, the way a null
/// <paramref name="DisplayOrder"/> leaves the order - so a client that predates constraints cannot
/// wipe them by saving a rename. To clear them, send the group with no rule in it.
///
/// <paramref name="FamilySemantic"/> follows the same rule for the same reason: null on a create is no family meaning, null on
/// an update keeps the stored one, and <c>None</c> clears it (ADR 0035).
/// </summary>
public sealed record RelationshipTypeRequest(
    string? Name,
    string? InverseName,
    bool IsSymmetric,
    string? Description,
    int? DisplayOrder,
    RelationshipTypeCanonConstraints? CanonConstraints = null,
    RelationshipFamilySemantic? FamilySemantic = null);

public sealed record RelationshipTypeResponse(
    Guid Id,
    string Name,
    string? InverseName,
    bool IsSymmetric,
    string? Description,
    int DisplayOrder,
    int RelationshipCount,
    RelationshipTypeCanonConstraints CanonConstraints,
    RelationshipFamilySemantic FamilySemantic);

/// <summary>
/// The rules Canon Integrity checks every Canon relationship of a type against, all on the stored
/// direction. A closed set of typed members, never an expression: see ADR 0023.
/// </summary>
public sealed record RelationshipTypeCanonConstraints(
    RelationshipAgeOrder AgeOrder,
    int? MinAgeDifferenceYears,
    int? MaxAgeDifferenceYears)
{
    /// <summary>No rule at all: how every type behaves until its author configures one.</summary>
    public static RelationshipTypeCanonConstraints None { get; } = new(RelationshipAgeOrder.None, null, null);

    public static RelationshipTypeCanonConstraints Of(RelationshipType type) =>
        new(type.AgeOrder, type.MinAgeDifferenceYears, type.MaxAgeDifferenceYears);
}

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
