using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Lore;

/// <summary>How settled a piece of lore is. Ordered from least to most committed.</summary>
public enum CanonStatus
{
    Idea = 0,
    Draft = 1,
    Canon = 2,
}

/// <summary>The shape of a custom field. Storage column is chosen from this.</summary>
public enum EntityFieldKind
{
    ShortText = 0,
    LongText = 1,
    Number = 2,
    Boolean = 3,
    Date = 4,
    Select = 5,
    MultiSelect = 6,
    EntityReference = 7,
}

/// <summary>
/// A kind of thing a universe contains: Character, Location, whatever the author invents.
/// Types carry no domain behaviour, only presentation hints and their field definitions.
/// </summary>
public sealed class EntityType
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Name { get; set; }

    public string? Description { get; set; }

    /// <summary>Icon identifier chosen by the client. Never rendered as markup.</summary>
    public string? Icon { get; set; }

    public string? AccentColor { get; set; }

    public int DisplayOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<EntityFieldDefinition> Fields { get; set; } = [];
}

/// <summary>One custom field on a type. No formulas, no nesting, no JSON.</summary>
public sealed class EntityFieldDefinition
{
    public Guid Id { get; set; }

    public Guid EntityTypeId { get; set; }

    public EntityType? EntityType { get; set; }

    public required string Name { get; set; }

    public EntityFieldKind Kind { get; set; }

    public bool IsRequired { get; set; }

    public int DisplayOrder { get; set; }

    /// <summary>Default rendered into a new entity's form. Interpreted per <see cref="Kind"/>.</summary>
    public string? DefaultValue { get; set; }

    public ICollection<EntityFieldOption> Options { get; set; } = [];

    public ICollection<EntityFieldValue> Values { get; set; } = [];
}

/// <summary>A choice for a select or multi-select field. Relational, not a JSON array.</summary>
public sealed class EntityFieldOption
{
    public Guid Id { get; set; }

    public Guid FieldDefinitionId { get; set; }

    public EntityFieldDefinition? FieldDefinition { get; set; }

    public required string Value { get; set; }

    public int DisplayOrder { get; set; }
}

/// <summary>
/// A record in a universe. Named LoreEntity so it does not collide with EF Core's own
/// use of "entity" throughout the codebase.
/// </summary>
public sealed class LoreEntity
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public Guid EntityTypeId { get; set; }

    public EntityType? EntityType { get; set; }

    public required string Name { get; set; }

    public string? Summary { get; set; }

    /// <summary>
    /// The lore article, stored as a Tiptap document. JSON is the editor's own format and
    /// is validated structurally on the way in; it is never the model for custom fields,
    /// and the raw text is never shown to the author.
    /// </summary>
    public string? Content { get; set; }

    public CanonStatus CanonStatus { get; set; }

    public bool IsArchived { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<EntityAlias> Aliases { get; set; } = [];

    public ICollection<EntityFieldValue> FieldValues { get; set; } = [];

    public ICollection<EntityTag> EntityTags { get; set; } = [];
}

/// <summary>Another name the same thing goes by. Searched alongside the name.</summary>
public sealed class EntityAlias
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public required string Value { get; set; }
}

/// <summary>
/// One stored value. Typed columns rather than a JSON blob, so values stay queryable and
/// a field's type change cannot silently reinterpret what is already there. Multi-select
/// stores one row per chosen option.
/// </summary>
public sealed class EntityFieldValue
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public Guid FieldDefinitionId { get; set; }

    public EntityFieldDefinition? FieldDefinition { get; set; }

    public string? TextValue { get; set; }

    public double? NumberValue { get; set; }

    public bool? BooleanValue { get; set; }

    public DateTime? DateValue { get; set; }

    /// <summary>Set for Select and MultiSelect.</summary>
    public Guid? OptionId { get; set; }

    public EntityFieldOption? Option { get; set; }

    /// <summary>Set for EntityReference. Always another entity in the same universe.</summary>
    public Guid? ReferencedEntityId { get; set; }

    public LoreEntity? ReferencedEntity { get; set; }
}

/// <summary>A label scoped to one universe.</summary>
public sealed class Tag
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Name { get; set; }

    /// <summary>Lowercased name, so tags are matched case-insensitively without collation tricks.</summary>
    public required string Slug { get; set; }

    public ICollection<EntityTag> EntityTags { get; set; } = [];
}

public sealed class EntityTag
{
    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public Guid TagId { get; set; }

    public Tag? Tag { get; set; }
}
