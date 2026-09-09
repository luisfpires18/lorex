using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Timeline;

namespace Lorex.Api.Features.Export;

/// <summary>
/// The whole export format, as records. This file *is* the contract: a future import reads
/// these shapes and nothing else, so a change here is a format change and owes a
/// <see cref="UniverseBackup.FormatVersion"/> bump.
///
/// See <c>docs/architecture/decisions/0014-universe-backup-format.md</c> for what is in a
/// backup, what is deliberately left out, and why.
/// </summary>
public sealed record UniverseBackup(
    string Format,
    int FormatVersion,
    DateTime GeneratedAt,
    UniverseBackupPayload Payload)
{
    /// <summary>Discriminator, so a reader can refuse a file that is merely JSON.</summary>
    public const string FormatName = "lorex.universe.backup";

    /// <summary>
    /// Bumped whenever the payload's shape or meaning changes in a way a reader must notice.
    /// Adding a nullable member that an older reader can ignore does not count; removing,
    /// renaming or re-meaning one does.
    ///
    /// 2 - Phase 019 added <see cref="BackupEntity.DeletedAt"/>. The member itself is nullable
    /// and ignorable, but it re-means the <c>entities</c> collection: membership no longer
    /// implies the entry is live, and a reader that ignored it would restore an author's Trash
    /// into their world as ordinary lore. That is the "re-meaning" case above, so it is a bump.
    /// A version 1 file still means exactly what it always meant - every entry in it is live.
    /// </summary>
    public const int CurrentVersion = 2;

    public static UniverseBackup Of(UniverseBackupPayload payload, DateTime generatedAt) =>
        new(FormatName, CurrentVersion, generatedAt, payload);
}

/// <summary>
/// Everything authored inside one universe, and nothing else.
///
/// This object is the deterministic half of the file: two exports of unchanged lore
/// serialise it byte for byte. Only the envelope around it carries anything volatile.
/// </summary>
public sealed record UniverseBackupPayload(
    BackupUniverse Universe,
    IReadOnlyList<BackupEntityType> EntityTypes,
    IReadOnlyList<BackupTag> Tags,
    IReadOnlyList<BackupEntity> Entities,
    IReadOnlyList<BackupRelationshipType> RelationshipTypes,
    IReadOnlyList<BackupRelationship> Relationships,
    IReadOnlyList<BackupTimelineEntry> TimelineEntries,
    IReadOnlyList<BackupDismissedConflict> DismissedConflicts);

/// <summary>
/// The universe itself. <c>OwnerId</c> is deliberately absent: it names an Identity row that
/// means nothing outside the installation that issued it, and a backup that carried it would
/// be a backup of an account rather than of a world.
/// </summary>
public sealed record BackupUniverse(
    Guid Id,
    string Name,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record BackupEntityType(
    Guid Id,
    string Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    int DisplayOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<BackupFieldDefinition> Fields);

/// <summary>
/// One custom field, with its declared meaning. <c>Semantic</c> is authored (ADR 0011) and
/// nothing infers it from a name, so losing it would silently disarm the chronology rules.
/// </summary>
public sealed record BackupFieldDefinition(
    Guid Id,
    string Name,
    EntityFieldKind Kind,
    EntityFieldSemantic? Semantic,
    bool IsRequired,
    int DisplayOrder,
    string? DefaultValue,
    IReadOnlyList<BackupFieldOption> Options);

public sealed record BackupFieldOption(Guid Id, string Value, int DisplayOrder);

/// <summary>
/// A tag by name. The stored <c>Slug</c> is not carried: it is
/// <c>Name.ToLowerInvariant()</c> at the one place a tag is ever created, so it is a
/// derived index column rather than something an author wrote.
/// </summary>
public sealed record BackupTag(Guid Id, string Name);

/// <summary>
/// One entry, with its history alongside it so a version never travels apart from the entry
/// it is a version of.
///
/// <paramref name="Content"/> is the Tiptap document exactly as stored - the same string,
/// not a re-serialised object graph - so the article round-trips byte for byte.
///
/// <paramref name="DeletedAt"/> is when the entry was moved to the Trash, or null while it is
/// live. Trashed entries are carried in full, with their values, aliases, tags and history:
/// they are authored lore the owner has not thrown away irrecoverably, and a backup that
/// silently omitted them would turn a recoverable mistake into a permanent one. It is why this
/// format is at version 2 - see <see cref="UniverseBackup.CurrentVersion"/> and ADR 0014.
/// </summary>
public sealed record BackupEntity(
    Guid Id,
    Guid EntityTypeId,
    string Name,
    string? Summary,
    string? Content,
    CanonStatus CanonStatus,
    bool IsArchived,
    DateTime? DeletedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<Guid> TagIds,
    IReadOnlyList<BackupFieldValue> FieldValues,
    IReadOnlyList<BackupRevision> Revisions);

/// <summary>
/// One stored value, in the same typed members the live row uses so a null stays a null and
/// never collapses into an empty string or a zero. A multi-select contributes one of these
/// per chosen option, exactly as the table does.
///
/// The value row's own id is absent. It is rewritten every time the entry is saved - which
/// is precisely why ADR 0010 fingerprints the field definition instead - so it identifies
/// nothing worth carrying.
/// </summary>
public sealed record BackupFieldValue(
    Guid FieldDefinitionId,
    string? TextValue,
    double? NumberValue,
    bool? BooleanValue,
    DateTime? DateValue,
    Guid? OptionId,
    Guid? ReferencedEntityId);

/// <summary>
/// One version of one entry, as ADR 0013 recorded it: a full snapshot, carrying both the raw
/// id of everything it references and the text that reference displayed at the time.
/// </summary>
public sealed record BackupRevision(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    EntityRevisionChange Changes,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    Guid EntityTypeId,
    string EntityTypeName,
    string Name,
    string? Summary,
    string? Content,
    CanonStatus CanonStatus,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<BackupRevisionFieldValue> FieldValues);

public sealed record BackupRevisionFieldValue(
    Guid FieldDefinitionId,
    string FieldName,
    EntityFieldKind Kind,
    int DisplayOrder,
    string? TextValue,
    double? NumberValue,
    bool? BooleanValue,
    DateTime? DateValue,
    Guid? OptionId,
    string? OptionValue,
    Guid? ReferencedEntityId,
    string? ReferencedEntityName);

public sealed record BackupRelationshipType(
    Guid Id,
    string Name,
    string? InverseName,
    bool IsSymmetric,
    string? Description,
    int DisplayOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>One link, stored once and read from either end (ADR 0008).</summary>
public sealed record BackupRelationship(
    Guid Id,
    Guid RelationshipTypeId,
    Guid SourceEntityId,
    Guid TargetEntityId,
    CanonStatus CanonStatus,
    DateTime? StartDate,
    DateTime? EndDate,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// One moment. The date components stay signed integers with the era label beside them, so a
/// year before a universe's own zero survives as the number the author typed (ADR 0009) and
/// is never coerced into a Gregorian date.
/// </summary>
public sealed record BackupTimelineEntry(
    Guid Id,
    string Title,
    string? Description,
    CanonStatus CanonStatus,
    TimelineDateKind DateKind,
    int? StartYear,
    int? StartMonth,
    int? StartDay,
    int? EndYear,
    int? EndMonth,
    int? EndDay,
    string? EraLabel,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<Guid> ParticipantEntityIds);

/// <summary>
/// The one piece of Canon Integrity that is not rebuildable: the author's decision to live
/// with a problem.
///
/// Conflicts themselves are derived findings and the whole table regenerates from the lore
/// by evaluating again (ADR 0010) - so nothing pending or resolved is carried. A dismissal
/// is not derived, and the fingerprint is enough to re-apply it, because it hashes only the
/// rule code and the ids of the records at fault, all of which this backup preserves.
/// </summary>
public sealed record BackupDismissedConflict(
    string RuleCode,
    CanonConflictSeverity Severity,
    string Fingerprint,
    DateTime DismissedAt);
