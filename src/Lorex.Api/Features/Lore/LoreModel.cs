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
/// What a field *means*, for the handful of meanings Lorex can reason about deterministically.
///
/// Fields are otherwise semantic-free: a type's fields are whatever the author invents, and
/// nothing infers meaning from a display name. "Birth Year", "Born", "Geburtsjahr" and
/// "b." are all the same thing to an author and nothing to a matcher, so a rule that keyed
/// off names would be wrong the moment someone renamed a field or wrote in another language.
/// Meaning is therefore declared, once, on the definition - never guessed, and never by AI.
///
/// Deliberately tiny and closed. This is not an ontology: it is the vocabulary the
/// chronology rules need, and it grows one entry at a time when a rule needs one.
///
/// Only *year* meanings exist, because the rest of Lorex counts fictional time in signed
/// integer years (see <c>docs/architecture/decisions/0009-fictional-chronology.md</c>).
/// <see cref="EntityFieldValue.DateValue"/> is a Gregorian <see cref="DateTime"/> and does
/// not compare with a universe's own calendar, so no BirthDate/DeathDate member is offered.
/// </summary>
public enum EntityFieldSemantic
{
    /// <summary>The year the subject was born, on the universe's own reckoning.</summary>
    BirthYear = 1,

    /// <summary>The year the subject died, on the universe's own reckoning.</summary>
    DeathYear = 2,

    /// <summary>
    /// How old the subject is. Recorded so the meaning can be declared, but no rule reads
    /// it yet: an age is only a claim about a moment, and nothing in the model says which
    /// moment. See <c>docs/architecture/decisions/0011-semantic-field-codes.md</c>.
    /// </summary>
    Age = 3,
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

    /// <summary>
    /// The type's icon key, or null for the neutral fallback. One of <see cref="EntityTypeIcons.Keys"/>,
    /// chosen by the author and never inferred from <see cref="Name"/>. A key, not markup and not a URL.
    /// </summary>
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

    /// <summary>
    /// What this field means to the integrity rules, or null - which is the normal case.
    /// A scalar column rather than JSON, so it is queryable and a rule can join on it.
    /// At most one field per type may carry any given meaning, or a rule reading "the
    /// birth year" would have to choose between two answers.
    /// </summary>
    public EntityFieldSemantic? Semantic { get; set; }

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

    /// <summary>
    /// When this entry was moved to Trash, or null while it is live. The marker *is* the
    /// Trash: the row and every row that points at it stay exactly where they are, so a
    /// restore has nothing to rebuild and nothing dependent is destroyed on the way in.
    ///
    /// Deliberately a timestamp rather than a flag - the Trash listing has to show when an
    /// entry was thrown away, and two columns that must agree is one too many.
    ///
    /// Not an EF global query filter. A filter follows navigations, and the reads that must
    /// see a trashed entry (the backup, the Trash itself) and the reads that must not (browse,
    /// search, pickers, every Canon rule) are both reached through those same navigations;
    /// <c>IgnoreQueryFilters</c> is all-or-nothing per query and could not separate them. Every
    /// read therefore says which it wants. See
    /// <c>docs/architecture/decisions/0015-entity-trash-and-restore.md</c>.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<EntityAlias> Aliases { get; set; } = [];

    public ICollection<EntityFieldValue> FieldValues { get; set; } = [];

    public ICollection<EntityTag> EntityTags { get; set; } = [];

    /// <summary>
    /// The entry's one primary image, or null. A reference rather than a set: an entry has one
    /// picture and the schema says so - see <see cref="EntityImage"/>. Trashing an entry does
    /// not touch it, because trashing deletes nothing.
    /// </summary>
    public EntityImage? Image { get; set; }
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
