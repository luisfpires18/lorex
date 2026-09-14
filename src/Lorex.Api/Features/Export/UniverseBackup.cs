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
    ///
    /// 6 - A story may group its scenes into chapters (ADR 0025). <see cref="BackupStory.Chapters"/>
    /// carries them, and <see cref="BackupScene.ChapterId"/> says which one each scene is told in - null
    /// for Unchaptered. Both fail the "ignorable" test twice over. A chapter's title, summary and notes
    /// are authored, so a reader that skipped them would lose writing. And the chapter id re-means
    /// <see cref="BackupScene.SortOrder"/>: from this version it is a scene's place inside its chapter or
    /// inside Unchaptered, not in the whole story, so every chapter starts again from 0. A version 5
    /// reader would find several scenes claiming each place and flatten the story into a wrong order.
    /// A file at version 5 has no <c>chapters</c> and no <c>chapterId</c>; both read as null, every
    /// scene is Unchaptered, and its story-wide order is exactly its order there.
    ///
    /// 7 - A story may plan its plot as arcs of beats (ADR 0026). <see cref="BackupStory.PlotArcs"/> carries every
    /// arc in order with its beats in order, each beat naming the scenes it plays out in and the entries it concerns
    /// by id. The member is nullable, but it is not the "ignorable" case either: an arc's and a beat's title,
    /// description and notes are authored, and so is every link, so a version 6 reader would restore each story
    /// with its plot silently gone - the loss version 5 was bumped for. A file at version 6 or earlier has no
    /// <c>plotArcs</c>; it reads as null, which means a story with no plot.
    ///
    /// 8 - A scene may hold manuscript prose (ADR 0027). <see cref="BackupScene.Manuscript"/> carries it - the text exactly
    /// as the author wrote it, and when it was last saved. Nullable, and the least ignorable member yet: it is the writing
    /// itself, so a version 7 reader would restore every scene with its prose silently gone. A file at version 7 or earlier
    /// has no <c>manuscript</c>; it reads as null, which means a scene with nothing written.
    ///
    /// 9 - An entry's article moved into a row of its own with a history of its own (ADR 0028).
    /// <see cref="BackupEntity.Content"/> keeps its meaning - the article as it stands - and gains
    /// <see cref="BackupEntity.ArticleUpdatedAt"/> and <see cref="BackupEntity.ArticleRevisions"/>, every saved version of
    /// the article. It fails the "ignorable" test twice. The versions are authored text a version 8 reader would drop
    /// silently, as it would have dropped an entry's history. And <see cref="BackupRevision.Content"/> is re-meant: in
    /// version 8 a null there said the entry had no article at that version, and restoring the version applied that; from
    /// version 9 an entry revision recorded after the move holds no copy of the article at all, so a version 8 reader
    /// restoring one would wipe an article that exists. A file at version 8 or earlier has neither new member; both read as
    /// null, and each revision's <c>content</c> is the article as it read then.
    ///
    /// 10 - A story's content may sit in the Trash, and a scene's manuscript keeps its saved versions (ADR 0029).
    /// <see cref="BackupStory.DeletedAt"/>, <see cref="BackupChapter.DeletedAt"/>, <see cref="BackupScene.DeletedAt"/>,
    /// <see cref="BackupPlotArc.DeletedAt"/> and <see cref="BackupPlotBeat.DeletedAt"/> say what is in it, and
    /// <see cref="BackupSceneManuscript.Revisions"/> carries every saved version of the prose. It fails the "ignorable" test
    /// twice, as versions 2 and 9 did. The markers re-mean <c>stories</c> and every collection inside a story: membership no
    /// longer implies something is live, and the <c>sortOrder</c> of a row in the Trash holds no place - so a version 9 reader
    /// would restore the Trash into the story as ordinary content, with two scenes claiming one place. And the versions are
    /// authored text a version 9 reader would drop silently. A file at version 9 or earlier has none of these members: each
    /// reads as null, everything in it is live, and a manuscript has no versions but its text.
    /// </summary>
    public const int CurrentVersion = 10;

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
/// <paramref name="Content"/> is the article as it stands: the Tiptap document exactly as stored - the same string, not a
/// re-serialised object graph - so it round-trips byte for byte. Null for an entry with no article, and for one whose
/// article was written and then cleared. <paramref name="ArticleUpdatedAt"/> is when the article was last saved, null if
/// it never was, which is what tells those two apart (since version 9).
///
/// <paramref name="ArticleRevisions"/> is every saved version of the article, oldest first; the newest is
/// <paramref name="Content"/>. Each is the whole document, or <c>""</c> for a save that cleared it. Its ids are preserved,
/// and a version's <c>restoredFromRevisionId</c> names another version of the same entry's article (since version 9).
///
/// A future importer restores the article to the entry of the same id, in the universe being restored and owned by the
/// importing account - nothing about ownership is in the file. It validates each document as a save does, re-creates the
/// versions with their ids and numbers, writes no entry revision for any of it, and reindexes search. It never applies a
/// <see cref="BackupRevision.Content"/> to the article.
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
    DateTime? ArticleUpdatedAt,
    CanonStatus CanonStatus,
    bool IsArchived,
    DateTime? DeletedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<Guid> TagIds,
    IReadOnlyList<BackupFieldValue> FieldValues,
    BackupEntityImage? Image,
    IReadOnlyList<BackupRevision> Revisions,
    IReadOnlyList<BackupArticleRevision>? ArticleRevisions);

/// <summary>
/// One saved version of an entry's article (since version 9). <paramref name="Content"/> is the whole document exactly as
/// saved, or <c>""</c> for a save that cleared the article. <paramref name="Kind"/> is <c>Created</c> for the first version,
/// <c>Edited</c> for a save and <c>Restored</c> for a version put back, which names it in
/// <paramref name="RestoredFromRevisionId"/>.
/// </summary>
public sealed record BackupArticleRevision(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string Content);

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
///
/// <paramref name="Content"/> is the article as it read then, for a version recorded before articles kept their own
/// history, and null for every version recorded since - which holds no copy of the article and says nothing about it.
/// A reader keeps it as history and never applies it to the article (version 9, ADR 0028).
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
/// One story, with its chapters and scenes alongside it so neither travels apart from the story it is
/// told in (since version 5). Authored narrative, not lore: nothing in it is a fact about the world.
///
/// <paramref name="Chapters"/> are in story order (since version 6). Empty means a story with no
/// chapters; absent - null, in a version 5 file - means the same thing.
///
/// <paramref name="Scenes"/> is every scene of the story in reading order: Unchaptered first, then chapter
/// by chapter, each in its own narrative order.
///
/// <paramref name="PlotArcs"/> is the story's plot, arcs in order (since version 7). Empty means a story with no
/// arcs; absent - null, in any earlier file - means the same thing.
///
/// <paramref name="DeletedAt"/> is when the story was moved to the Trash, or null while it is live (since version 10).
/// A story in the Trash travels whole - it is authored work its owner can still restore - and what it holds is exactly
/// what it held: nothing inside it is marked on its account.
///
/// A future importer restores every row with its marker, and puts nothing in the Trash into a live order: in each
/// collection below, a row carrying <c>deletedAt</c> is listed after the live ones and its <c>sortOrder</c> is the place
/// it had, which it no longer holds.
/// </summary>
public sealed record BackupStory(
    Guid Id,
    string Title,
    string? Premise,
    StoryStatus Status,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt,
    IReadOnlyList<BackupChapter>? Chapters,
    IReadOnlyList<BackupScene> Scenes,
    IReadOnlyList<BackupPlotArc>? PlotArcs);

/// <summary>
/// One chapter (since version 6): its place in the story, from 0, and the author's title, summary and
/// notes. The number a reader sees - "Chapter 3" - is <paramref name="SortOrder"/> plus one and is not
/// carried; neither is anything the chapter holds, because each scene names its chapter itself.
/// <paramref name="DeletedAt"/> is when it went to the Trash (since version 10); a chapter there holds no scene.
/// </summary>
public sealed record BackupChapter(
    Guid Id,
    int SortOrder,
    string Title,
    string? Summary,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt);

/// <summary>
/// One scene, carried with its container and its place in it.
///
/// <paramref name="ChapterId"/> is the chapter of this same story the scene is told in, or null for
/// Unchaptered - and null too in a version 5 file, where every scene was. <paramref name="SortOrder"/> is
/// the scene's place inside that container, from 0 (story-wide before version 6, which is the same thing
/// when every scene is Unchaptered). The number is carried so the order is explicit rather than implied by
/// position.
///
/// <paramref name="PovEntityId"/> and <paramref name="LinkedEntityIds"/> are references to entries in
/// this same file, never copies of them: no name, type or picture is carried here. An entry in the
/// Trash may be among them, and is in the file too. <paramref name="Chronology"/> is where the scene
/// happens in the world, or null; it has no bearing on the order.
///
/// <paramref name="Manuscript"/> is the scene's prose (since version 8), carried with the scene it belongs to rather than
/// in a file of its own, or null when nothing has been written for it.
///
/// <paramref name="DeletedAt"/> is when the scene was moved to the Trash, or null while it is live (since version 10). A
/// scene in the Trash carries its prose, versions and links like any other, and its <paramref name="SortOrder"/> holds no
/// place in its container.
/// </summary>
public sealed record BackupScene(
    Guid Id,
    Guid? ChapterId,
    int SortOrder,
    string Title,
    string? Summary,
    string? Notes,
    Guid? PovEntityId,
    BackupChronologyValue? Chronology,
    IReadOnlyList<Guid> LinkedEntityIds,
    BackupSceneManuscript? Manuscript,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt);

/// <summary>
/// One scene's prose (since version 8), exactly as stored: the text with every line break, blank line and character the
/// author wrote, and when it was last saved. Plain text - never HTML, Markdown or an editor's document - and never read
/// for meaning. A scene saved and then emptied carries an empty <paramref name="Content"/>; a scene never written for
/// carries no manuscript at all, and both read as nothing written.
///
/// <paramref name="Revisions"/> is every saved version of the prose, oldest first, the newest being
/// <paramref name="Content"/> (since version 10). A future importer re-creates them with their ids and numbers and never
/// applies one to the prose. A browser's unsaved recovery copy is never in a backup: it was never saved.
/// </summary>
public sealed record BackupSceneManuscript(
    string Content,
    DateTime UpdatedAt,
    IReadOnlyList<BackupManuscriptRevision>? Revisions);

/// <summary>
/// One saved version of a scene's manuscript (since version 10): the whole text exactly as saved, or <c>""</c> for a save
/// that emptied it. <paramref name="Kind"/> is <c>Created</c> for the first version, <c>Edited</c> for a save and
/// <c>Restored</c> for a version put back, which names it in <paramref name="RestoredFromRevisionId"/>.
/// </summary>
public sealed record BackupManuscriptRevision(
    Guid Id,
    int Number,
    SceneManuscriptRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string Content);

/// <summary>
/// One plot arc (since version 7): its place in the story's plot, from 0, the author's title, description and
/// notes, and its beats in order. The number a reader sees - "Arc 2" - is <paramref name="SortOrder"/> plus one and
/// is not carried. <paramref name="DeletedAt"/> is when it went to the Trash (since version 10); its beats are
/// carried as they stood, and come back with it.
/// </summary>
public sealed record BackupPlotArc(
    Guid Id,
    int SortOrder,
    string Title,
    string? Description,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt,
    IReadOnlyList<BackupPlotBeat> Beats);

/// <summary>
/// One beat (since version 7): its place in its arc, from 0, its text, and what it points at.
///
/// <paramref name="LinkedSceneIds"/> are scenes of this same story and <paramref name="LinkedEntityIds"/> entries
/// in this same file, each list sorted by id so an unchanged plot writes the same bytes. Ids only: no scene title,
/// chapter, entry name or number is carried, so a scene that moved chapter is still the scene the beat names. A
/// trashed entry may be among them, and is in the file too, and so may a scene in the Trash. The beat's order has no
/// bearing on any scene's. <paramref name="DeletedAt"/> is when the beat went to the Trash (since version 10).
/// </summary>
public sealed record BackupPlotBeat(
    Guid Id,
    int SortOrder,
    string Title,
    string? Description,
    string? Notes,
    IReadOnlyList<Guid> LinkedSceneIds,
    IReadOnlyList<Guid> LinkedEntityIds,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt);

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
