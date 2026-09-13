using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Relationships;

/// <summary>
/// A kind of link an author invents inside one universe: "rules", "parent of",
/// "married to". The type carries both readings of the link, so a relationship is stored
/// once and read from either end.
/// </summary>
public sealed class RelationshipType
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>The forward reading, source to target: "rules".</summary>
    public required string Name { get; set; }

    /// <summary>
    /// The reverse reading, target to source: "ruled by". Null for a symmetric type,
    /// where both ends read the same and a second wording would be meaningless.
    /// </summary>
    public string? InverseName { get; set; }

    /// <summary>True when the link reads identically from both ends: "married to".</summary>
    public bool IsSymmetric { get; set; }

    public string? Description { get; set; }

    public int DisplayOrder { get; set; }

    /// <summary>
    /// Which end of every Canon relationship of this type must be older, as the author configured
    /// it. Stated on the stored direction, source then target, and never read out of
    /// <see cref="Name"/>: "parent of" orders nothing until someone says it does. See
    /// <c>docs/architecture/decisions/0023-relationship-canon-constraints.md</c>.
    /// </summary>
    public RelationshipAgeOrder AgeOrder { get; set; }

    /// <summary>The smallest gap allowed between the two ends' birth years, in whole years. Null for none.</summary>
    public int? MinAgeDifferenceYears { get; set; }

    /// <summary>The largest gap allowed between the two ends' birth years, in whole years. Null for none.</summary>
    public int? MaxAgeDifferenceYears { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Which end of a relationship must have been born first. A Canon constraint the author sets on a
/// <see cref="RelationshipType"/>; Canon Integrity checks it and nothing else reads it.
/// </summary>
public enum RelationshipAgeOrder
{
    /// <summary>No age order. Every type written before constraints existed, and the default.</summary>
    None = 0,

    /// <summary>The source was born before the target.</summary>
    SourceOlder = 1,

    /// <summary>The source was born after the target.</summary>
    SourceYounger = 2,
}

/// <summary>
/// One link between two entities of the same universe. Exactly one row is stored per
/// link; the reverse reading is derived from <see cref="RelationshipType.InverseName"/>
/// at read time, never persisted as a second row.
/// </summary>
public sealed class LoreRelationship
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public Guid RelationshipTypeId { get; set; }

    public RelationshipType? RelationshipType { get; set; }

    public Guid SourceEntityId { get; set; }

    public LoreEntity? SourceEntity { get; set; }

    public Guid TargetEntityId { get; set; }

    public LoreEntity? TargetEntity { get; set; }

    public CanonStatus CanonStatus { get; set; }

    /// <summary>UTC. Optional; real-world calendar only, no fantasy calendars yet.</summary>
    public DateTime? StartDate { get; set; }

    /// <summary>UTC. Optional. Never earlier than <see cref="StartDate"/> when both are set.</summary>
    public DateTime? EndDate { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
