using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;

namespace Lorex.Api.Features.Export;

/// <summary>
/// The whole export format, as records. This file *is* the contract: a future import reads
/// these shapes and nothing else, so a change here is a format change and owes a
/// <see cref="UniverseBackup.FormatVersion"/> bump.
///
/// Since version 3 a backup is an archive rather than one file, and these records describe
/// the <c>backup.json</c> inside it. The media beside it is addressed by
/// <see cref="BackupEntityImage.MediaPath"/>, which is a path within the same archive and
/// never a URL, a bucket or an object key.
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
    ///
    /// 3 - A backup became an archive. The download is a ZIP holding this document as
    /// <c>backup.json</c> plus every entry's original image beside it, and
    /// <see cref="BackupEntity.Image"/> names where each one sits. This is the largest kind of
    /// change the version can carry: a reader that only knows versions 1 and 2 is handed a file
    /// it cannot parse at all, which is exactly what a version number is for.
    ///
    /// 4 - A universe may name its eras (ADR 0022). <see cref="UniverseBackupPayload.ChronologyEras"/>
    /// carries them, and <see cref="BackupTimelineEntry.StartEraId"/>,
    /// <see cref="BackupTimelineEntry.EndEraId"/> and <see cref="BackupFieldValue.EraId"/> say
    /// which era a year is counted in. Each member is nullable, but together they re-mean the year
    /// beside them: a start year of 10 in an era that counts down is ten years before that era
    /// ends, not the signed year 10. A reader that ignored them would put every such year on the
    /// wrong line - the re-meaning case above, so it is a bump. A file at versions 1 to 3 names no
    /// eras, and every year in it is a plain signed year.
    ///
    /// 5 - A universe may hold stories (ADR 0024). <see cref="UniverseBackupPayload.Stories"/> carries
    /// every story with its scenes, their narrative order, point of view, chronology and linked lore.
    /// The member is nullable, but it is not the "ignorable" case above: that case is for members a
    /// reader can skip without losing anything an author wrote, which is why relationship constraints -
    /// rules checked against the lore - were added within version 4. A reader that skipped this one
    /// would restore a world with every story silently missing, turning a complete backup into a lossy
    /// one. So it is a bump: a reader that knows only version 4 is told it is holding something it
    /// cannot carry. A file at versions 1 to 4 holds no stories - <c>stories</c> is absent and reads
    /// as null.
    /// </summary>
    public const int CurrentVersion = 5;

    public static UniverseBackup Of(UniverseBackupPayload payload, DateTime generatedAt) =>
        new(FormatName, CurrentVersion, generatedAt, payload);
}

/// <summary>
/// Everything authored inside one universe, and nothing else.
///
/// This object is the deterministic half of the file: two exports of unchanged lore
/// serialise it byte for byte. Only the envelope around it carries anything volatile.
///
/// <paramref name="ChronologyEras"/> is the universe's reckoning, earliest era first. Empty means
/// plain signed years; absent - null, in any file before version 4 - means the same thing.
///
/// <paramref name="Stories"/> is every story told in the universe, by title. Empty means none;
/// absent - null, in any file before version 5 - means the same thing.
/// </summary>
public sealed record UniverseBackupPayload(
    BackupUniverse Universe,
    IReadOnlyList<BackupChronologyEra>? ChronologyEras,
    IReadOnlyList<BackupEntityType> EntityTypes,
    IReadOnlyList<BackupTag> Tags,
    IReadOnlyList<BackupEntity> Entities,
    IReadOnlyList<BackupRelationshipType> RelationshipTypes,
    IReadOnlyList<BackupRelationship> Relationships,
    IReadOnlyList<BackupTimelineEntry> TimelineEntries,
    IReadOnlyList<BackupStory>? Stories,
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

/// <summary>
/// One era of the universe's reckoning. The id is preserved because timeline entries and years on
/// entries reference it; <paramref name="SortOrder"/> and <paramref name="Direction"/> are what
/// place every year counted in it, and <paramref name="Abbreviation"/> and
/// <paramref name="LabelPosition"/> are how it is written. Nothing derived from them - a formatted
/// date, a sort key - is carried.
/// </summary>
public sealed record BackupChronologyEra(
    Guid Id,
    string Name,
    string? Abbreviation,
    int SortOrder,
    ChronologyEraDirection Direction,
    ChronologyLabelPosition LabelPosition);

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
    BackupEntityImage? Image,
    IReadOnlyList<BackupRevision> Revisions);

/// <summary>
/// The entry's primary image, as a reader of the archive needs to see it.
///
/// <paramref name="MediaPath"/> is the whole point: a path inside this same archive, holding
/// the original bytes exactly as the author uploaded them. A backup that only named an object
/// in a bucket would stop being a backup the moment the bucket did, so the picture travels with
/// the lore or the export fails.
///
/// <b>No object key, no bucket, no endpoint, no URL.</b> Those are how this installation happens
/// to store the file today; none of them is the picture's identity, and none of them means
/// anything to a reader on another machine. <paramref name="AssetId"/> is carried because it is
/// the identity the entry itself uses, so a future importer can recognise the same image across
/// two backups of the same world.
///
/// The thumbnail's bytes are deliberately absent. It is derived - the square in
/// <paramref name="Crop"/>, cut from the original and scaled to a fixed size in a fixed format -
/// so an importer regenerates it rather than carrying a second copy of every picture that would
/// have to be trusted to match. What is carried is the one part that is not derivable: which
/// square the author chose. See ADR 0019.
///
/// <paramref name="Width"/> and <paramref name="Height"/> are the picture as displayed, the frame
/// <paramref name="Crop"/>'s fractions are measured against.
///
/// Adding <paramref name="Crop"/> is not a version bump, by the rule on
/// <see cref="UniverseBackup.CurrentVersion"/>: it is nullable, and a reader that ignores it
/// still restores every picture whole - it only loses the framing, and falls back to the centred
/// square every thumbnail had before an author could choose.
///
/// For a short while (2026-09-11) a thumbnail could also fit the whole picture instead of cropping
/// it, and version 3 files written then carry a <c>framing</c> member - <c>"Crop"</c>, or
/// <c>"Fit"</c> with a null crop. That mode was withdrawn and the member is not part of the format:
/// a reader ignores it, so such a file reads exactly like any other version 3 file, and a fitted
/// picture's thumbnail is regenerated as the centred square. Nothing it held is lost: the original
/// is in the archive, and a chosen crop is still in <paramref name="Crop"/>.
/// </summary>
public sealed record BackupEntityImage(
    Guid AssetId,
    string? FileName,
    string ContentType,
    int Width,
    int Height,
    long ByteSize,
    string MediaPath,
    BackupImageCrop? Crop);

/// <summary>
/// The square the entry's thumbnail is cut from, as fractions of the displayed original: X and
/// Width of its width, Y and Height of its height, from the top-left corner.
///
/// To regenerate the thumbnail: orient the original as a browser displays it (EXIF orientation
/// applied for JPEG and PNG, ignored for WebP), round each edge to the nearest pixel, cut that
/// square, and scale it to at most 320 pixels square. Null means the picture predates framing
/// and its thumbnail is the largest centred square.
/// </summary>
public sealed record BackupImageCrop(double X, double Y, double Width, double Height);

/// <summary>
/// One stored value, in the same typed members the live row uses so a null stays a null and
/// never collapses into an empty string or a zero. A multi-select contributes one of these
/// per chosen option, exactly as the table does.
///
/// The value row's own id is absent. It is rewritten every time the entry is saved - which
/// is precisely why ADR 0010 fingerprints the field definition instead - so it identifies
/// nothing worth carrying.
///
/// <paramref name="EraId"/> is the era <paramref name="NumberValue"/> is a year in, or null for
/// a plain number - since version 4.
/// </summary>
public sealed record BackupFieldValue(
    Guid FieldDefinitionId,
    string? TextValue,
    double? NumberValue,
    Guid? EraId,
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

/// <summary>
/// One value of one version. <paramref name="EraLabel"/> is what was written beside the year at
/// the time, kept with <paramref name="EraId"/> the way every other reference in a version keeps
/// its display text.
/// </summary>
public sealed record BackupRevisionFieldValue(
    Guid FieldDefinitionId,
    string FieldName,
    EntityFieldKind Kind,
    int DisplayOrder,
    string? TextValue,
    double? NumberValue,
    Guid? EraId,
    string? EraLabel,
    bool? BooleanValue,
    DateTime? DateValue,
    Guid? OptionId,
    string? OptionValue,
    Guid? ReferencedEntityId,
    string? ReferencedEntityName);

/// <summary>
/// One relationship type, with the Canon constraints its author configured (ADR 0023).
///
/// <paramref name="AgeOrder"/>, <paramref name="MinAgeDifferenceYears"/> and
/// <paramref name="MaxAgeDifferenceYears"/> were added within version 4, not as a bump, by the rule on
/// <see cref="UniverseBackup.CurrentVersion"/>. They are rules checked against the lore, not lore: a
/// reader that ignores them loses the checks and misreads no year, link or entry. A type is written
/// with <c>None</c> and two nulls when it has no constraint, and a file written before they existed -
/// where all three are absent - means exactly that.
/// </summary>
public sealed record BackupRelationshipType(
    Guid Id,
    string Name,
    string? InverseName,
    bool IsSymmetric,
    string? Description,
    int DisplayOrder,
    RelationshipAgeOrder AgeOrder,
    int? MinAgeDifferenceYears,
    int? MaxAgeDifferenceYears,
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
/// One moment. The date components stay integers with their eras beside them, so a year survives
/// as the number the author typed (ADR 0009) and is never coerced into a Gregorian date.
///
/// <paramref name="StartEraId"/> and <paramref name="EndEraId"/> name the era each year is counted
/// in, on a universe with eras (version 4). Null means a plain signed year, and then
/// <paramref name="EraLabel"/> is the free-text label that reckoning allows.
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
    Guid? StartEraId,
    Guid? EndEraId,
    string? EraLabel,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<Guid> ParticipantEntityIds);

/// <summary>
/// One story, with its scenes alongside it so a scene never travels apart from the story it is told
/// in (since version 5). Authored narrative, not lore: nothing in it is a fact about the world.
/// </summary>
public sealed record BackupStory(
    Guid Id,
    string Title,
    string? Premise,
    StoryStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<BackupScene> Scenes);

/// <summary>
/// One scene, in the story's narrative order - the list is sorted by <paramref name="SortOrder"/>,
/// and the number itself is carried so the order is explicit rather than implied by position.
///
/// <paramref name="PovEntityId"/> and <paramref name="LinkedEntityIds"/> are references to entries in
/// this same file, never copies of them: no name, type or picture is carried here. An entry in the
/// Trash may be among them, and is in the file too. <paramref name="Chronology"/> is where the scene
/// happens in the world, or null; it has no bearing on the order.
/// </summary>
public sealed record BackupScene(
    Guid Id,
    int SortOrder,
    string Title,
    string? Summary,
    string? Notes,
    Guid? PovEntityId,
    BackupChronologyValue? Chronology,
    IReadOnlyList<Guid> LinkedEntityIds,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// A position on the universe's line: the era the year is counted in - null on the plain reckoning -
/// and the numbers. Nothing formatted is carried; the eras in the same file say how to write it.
/// </summary>
public sealed record BackupChronologyValue(Guid? EraId, int Year, int? Month, int? Day);

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
