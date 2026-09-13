using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Export;

/// <summary>
/// Reads one universe out of the database and assembles the backup payload.
///
/// Three properties are load-bearing, and everything here exists to hold one of them.
///
/// <b>Universe-scoped.</b> Every query starts from <c>universeId</c>, reached through a real
/// navigation rather than through a list of ids gathered a moment earlier, so there is no
/// window in which a row from another world could be picked up. Ownership itself is proved
/// once by the caller, before any of this runs.
///
/// <b>Consistent.</b> The whole read happens inside one transaction. Eighteen separate
/// queries would otherwise be eighteen separate points at which a concurrent write could
/// land, and a backup holding an entity from before an edit and its revisions from after it
/// is worse than no backup at all. Nothing is written and nothing is locked beyond the read.
///
/// <b>Deterministic.</b> Every collection is sorted in memory with an ordinal comparer, never
/// left in whatever order the database returned and never sorted by a database collation.
/// The same lore therefore produces the same bytes on any machine, which is what makes a
/// backup diffable and what the determinism test asserts.
/// </summary>
public sealed class UniverseBackupBuilder(LorexDbContext db)
{
    /// <summary>
    /// The document and the media list for one universe, or null when it does not exist. The
    /// caller has already proved ownership; this does not re-decide it, but it does re-read the
    /// universe inside the transaction so the snapshot includes the universe row itself.
    ///
    /// The media list is read here rather than by the archive writer, and inside the same
    /// transaction, so the object keys the writer fetches are the ones belonging to the assets
    /// the document names. Reading them afterwards would leave a window in which a replacement
    /// could land, and the archive would then hold a picture the document does not describe.
    /// </summary>
    public async Task<UniverseBackupSnapshot?> BuildAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var universe = await db.Universes.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == universeId, cancellationToken);

        if (universe is null)
        {
            return null;
        }

        var images = await ImagesAsync(universeId, cancellationToken);

        var payload = new UniverseBackupPayload(
            new BackupUniverse(
                universe.Id,
                universe.Name,
                universe.Description,
                universe.AccentColor,
                universe.IsArchived,
                Utc(universe.CreatedAt),
                Utc(universe.UpdatedAt)),
            await ErasAsync(universeId, cancellationToken),
            await EntityTypesAsync(universeId, cancellationToken),
            await TagsAsync(universeId, cancellationToken),
            await EntitiesAsync(universeId, images, cancellationToken),
            await RelationshipTypesAsync(universeId, cancellationToken),
            await RelationshipsAsync(universeId, cancellationToken),
            await TimelineAsync(universeId, cancellationToken),
            await StoriesAsync(universeId, cancellationToken),
            await DismissedConflictsAsync(universeId, cancellationToken));

        // Read-only, so there is nothing to commit; this just closes the snapshot.
        await transaction.CommitAsync(cancellationToken);

        return new UniverseBackupSnapshot(
            payload,
            [
                .. images.Values
                    .Select(image => new BackupMediaObject(
                        image.EntityId,
                        BackupArchive.MediaPathFor(image.EntityId, image.ContentType),
                        image.OriginalKey,
                        image.ContentType))
                    .OrderBy(one => one.ArchivePath, StringComparer.Ordinal),
            ]);
    }

    // ---------- Media ----------

    /// <summary>
    /// Every entry's primary image, live and trashed alike - a trashed entry is authored lore
    /// the owner has not thrown away irrecoverably (ADR 0015), and its picture travels with it
    /// for the same reason the rest of it does.
    ///
    /// Only the original. The thumbnail is derived from it by a fixed, deterministic recipe, so
    /// a reader regenerates it rather than being handed a second copy to keep in step.
    /// </summary>
    private async Task<Dictionary<Guid, EntityImage>> ImagesAsync(
        Guid universeId,
        CancellationToken cancellationToken) =>
        await db.EntityImages.AsNoTracking()
            .Where(image => image.Entity!.UniverseId == universeId)
            .ToDictionaryAsync(image => image.EntityId, cancellationToken);

    // ---------- Chronology ----------

    /// <summary>
    /// The reckoning, earliest era first. Positions are unique per universe, so the id only breaks
    /// a tie the schema already forbids - there for determinism, not because it is expected.
    /// </summary>
    private async Task<IReadOnlyList<BackupChronologyEra>> ErasAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var eras = await db.ChronologyEras.AsNoTracking()
            .Where(era => era.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        return
        [
            .. eras
                .OrderBy(era => era.SortOrder)
                .ThenBy(era => Key(era.Id), StringComparer.Ordinal)
                .Select(era => new BackupChronologyEra(
                    era.Id,
                    era.Name,
                    era.Abbreviation,
                    era.SortOrder,
                    era.Direction,
                    era.LabelPosition)),
        ];
    }

    // ---------- Types and fields ----------

    private async Task<IReadOnlyList<BackupEntityType>> EntityTypesAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var types = await db.EntityTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var fields = await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => field.EntityType!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var options = await db.EntityFieldOptions.AsNoTracking()
            .Where(option => option.FieldDefinition!.EntityType!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var optionsByField = options
            .GroupBy(option => option.FieldDefinitionId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<BackupFieldOption>)
                [
                    .. group
                        .OrderBy(option => option.DisplayOrder)
                        .ThenBy(option => option.Value, StringComparer.Ordinal)
                        .ThenBy(option => Key(option.Id), StringComparer.Ordinal)
                        .Select(option => new BackupFieldOption(
                            option.Id, option.Value, option.DisplayOrder)),
                ]);

        var fieldsByType = fields
            .GroupBy(field => field.EntityTypeId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<BackupFieldDefinition>)
                [
                    .. group
                        .OrderBy(field => field.DisplayOrder)
                        .ThenBy(field => field.Name, StringComparer.Ordinal)
                        .ThenBy(field => Key(field.Id), StringComparer.Ordinal)
                        .Select(field => new BackupFieldDefinition(
                            field.Id,
                            field.Name,
                            field.Kind,
                            field.Semantic,
                            field.IsRequired,
                            field.DisplayOrder,
                            field.DefaultValue,
                            optionsByField.GetValueOrDefault(field.Id, []))),
                ]);

        return
        [
            .. types
                .OrderBy(type => type.DisplayOrder)
                .ThenBy(type => type.Name, StringComparer.Ordinal)
                .ThenBy(type => Key(type.Id), StringComparer.Ordinal)
                .Select(type => new BackupEntityType(
                    type.Id,
                    type.Name,
                    type.Description,
                    type.Icon,
                    type.AccentColor,
                    type.DisplayOrder,
                    Utc(type.CreatedAt),
                    Utc(type.UpdatedAt),
                    fieldsByType.GetValueOrDefault(type.Id, []))),
        ];
    }

    // ---------- Tags ----------

    private async Task<IReadOnlyList<BackupTag>> TagsAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var tags = await db.Tags.AsNoTracking()
            .Where(tag => tag.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        return
        [
            .. tags
                .OrderBy(tag => tag.Name, StringComparer.Ordinal)
                .ThenBy(tag => Key(tag.Id), StringComparer.Ordinal)
                .Select(tag => new BackupTag(tag.Id, tag.Name)),
        ];
    }

    // ---------- Entries, their values and their history ----------

    private async Task<IReadOnlyList<BackupEntity>> EntitiesAsync(
        Guid universeId,
        Dictionary<Guid, EntityImage> images,
        CancellationToken cancellationToken)
    {
        // Every entry, the Trash included. A backup is the whole world as it currently stands,
        // and an entry the author can still restore is part of that world; each carries its own
        // DeletedAt so a reader can tell which is which.
        var entities = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var aliases = await db.EntityAliases.AsNoTracking()
            .Where(alias => alias.Entity!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var entityTags = await db.EntityTags.AsNoTracking()
            .Where(link => link.Entity!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var values = await db.EntityFieldValues.AsNoTracking()
            .Where(value => value.Entity!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var revisionsByEntity = await RevisionsAsync(universeId, cancellationToken);

        var aliasesByEntity = aliases
            .GroupBy(alias => alias.EntityId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<string>)[.. group.Select(alias => alias.Value).Order(StringComparer.Ordinal)]);

        var tagIdsByEntity = entityTags
            .GroupBy(link => link.EntityId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<Guid>)
                [
                    .. group
                        .Select(link => link.TagId)
                        .OrderBy(Key, StringComparer.Ordinal),
                ]);

        var valuesByEntity = values
            .GroupBy(value => value.EntityId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<BackupFieldValue>)
                [
                    .. group
                        .OrderBy(value => Key(value.FieldDefinitionId), StringComparer.Ordinal)
                        .ThenBy(value => Key(value.OptionId), StringComparer.Ordinal)
                        .ThenBy(value => Key(value.ReferencedEntityId), StringComparer.Ordinal)
                        .ThenBy(value => value.TextValue ?? string.Empty, StringComparer.Ordinal)
                        .ThenBy(value => Key(value.Id), StringComparer.Ordinal)
                        .Select(value => new BackupFieldValue(
                            value.FieldDefinitionId,
                            value.TextValue,
                            value.NumberValue,
                            value.EraId,
                            value.BooleanValue,
                            Utc(value.DateValue),
                            value.OptionId,
                            value.ReferencedEntityId)),
                ]);

        return
        [
            .. entities
                .OrderBy(entity => entity.Name, StringComparer.Ordinal)
                .ThenBy(entity => Key(entity.Id), StringComparer.Ordinal)
                .Select(entity => new BackupEntity(
                    entity.Id,
                    entity.EntityTypeId,
                    entity.Name,
                    entity.Summary,
                    entity.Content,
                    entity.CanonStatus,
                    entity.IsArchived,
                    Utc(entity.DeletedAt),
                    Utc(entity.CreatedAt),
                    Utc(entity.UpdatedAt),
                    aliasesByEntity.GetValueOrDefault(entity.Id, []),
                    tagIdsByEntity.GetValueOrDefault(entity.Id, []),
                    valuesByEntity.GetValueOrDefault(entity.Id, []),
                    Image(images, entity.Id),
                    revisionsByEntity.GetValueOrDefault(entity.Id, []))),
        ];
    }

    /// <summary>
    /// One entry's image as the document describes it: identity, shape, the framing its thumbnail
    /// was cut with, and where the bytes sit in this archive. The object keys it was read from are
    /// not here and never are - they name places in this installation's bucket, which is not what
    /// the picture *is*. Neither is the thumbnail's id: it names one rendering, and an importer
    /// makes its own.
    /// </summary>
    private static BackupEntityImage? Image(Dictionary<Guid, EntityImage> images, Guid entityId) =>
        images.TryGetValue(entityId, out var image)
            ? new BackupEntityImage(
                image.AssetId,
                image.FileName,
                image.ContentType,
                image.Width,
                image.Height,
                image.ByteSize,
                BackupArchive.MediaPathFor(entityId, image.ContentType),
                EntityImageCrop.Of(image) is { } crop
                    ? new BackupImageCrop(crop.X, crop.Y, crop.Width, crop.Height)
                    : null)
            : null;

    /// <summary>
    /// Every entry's history, keyed by entry and ordered oldest first - the order the versions
    /// were written in, and the order a reader rebuilding them would replay.
    /// </summary>
    private async Task<Dictionary<Guid, IReadOnlyList<BackupRevision>>> RevisionsAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var revisions = await db.EntityRevisions.AsNoTracking()
            .Where(revision => revision.Entity!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var aliases = await db.EntityRevisionAliases.AsNoTracking()
            .Where(alias => alias.Revision!.Entity!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var tags = await db.EntityRevisionTags.AsNoTracking()
            .Where(tag => tag.Revision!.Entity!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var values = await db.EntityRevisionFieldValues.AsNoTracking()
            .Where(value => value.Revision!.Entity!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var aliasesByRevision = aliases
            .GroupBy(alias => alias.RevisionId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<string>)[.. group.Select(alias => alias.Value).Order(StringComparer.Ordinal)]);

        var tagsByRevision = tags
            .GroupBy(tag => tag.RevisionId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<string>)[.. group.Select(tag => tag.Name).Order(StringComparer.Ordinal)]);

        var valuesByRevision = values
            .GroupBy(value => value.RevisionId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<BackupRevisionFieldValue>)
                [
                    .. group
                        .OrderBy(value => value.DisplayOrder)
                        .ThenBy(value => value.FieldName, StringComparer.Ordinal)
                        .ThenBy(value => value.OptionValue ?? string.Empty, StringComparer.Ordinal)
                        .ThenBy(value => Key(value.Id), StringComparer.Ordinal)
                        .Select(value => new BackupRevisionFieldValue(
                            value.FieldDefinitionId,
                            value.FieldName,
                            value.Kind,
                            value.DisplayOrder,
                            value.TextValue,
                            value.NumberValue,
                            value.EraId,
                            value.EraLabel,
                            value.BooleanValue,
                            Utc(value.DateValue),
                            value.OptionId,
                            value.OptionValue,
                            value.ReferencedEntityId,
                            value.ReferencedEntityName)),
                ]);

        return revisions
            .GroupBy(revision => revision.EntityId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<BackupRevision>)
                [
                    .. group
                        .OrderBy(revision => revision.Number)
                        .Select(revision => new BackupRevision(
                            revision.Id,
                            revision.Number,
                            revision.Kind,
                            revision.Changes,
                            revision.RestoredFromRevisionId,
                            Utc(revision.CreatedAt),
                            revision.EntityTypeId,
                            revision.EntityTypeName,
                            revision.Name,
                            revision.Summary,
                            revision.Content,
                            revision.CanonStatus,
                            aliasesByRevision.GetValueOrDefault(revision.Id, []),
                            tagsByRevision.GetValueOrDefault(revision.Id, []),
                            valuesByRevision.GetValueOrDefault(revision.Id, []))),
                ]);
    }

    // ---------- Relationships ----------

    private async Task<IReadOnlyList<BackupRelationshipType>> RelationshipTypesAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var types = await db.RelationshipTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        return
        [
            .. types
                .OrderBy(type => type.DisplayOrder)
                .ThenBy(type => type.Name, StringComparer.Ordinal)
                .ThenBy(type => Key(type.Id), StringComparer.Ordinal)
                .Select(type => new BackupRelationshipType(
                    type.Id,
                    type.Name,
                    type.InverseName,
                    type.IsSymmetric,
                    type.Description,
                    type.DisplayOrder,
                    type.AgeOrder,
                    type.MinAgeDifferenceYears,
                    type.MaxAgeDifferenceYears,
                    Utc(type.CreatedAt),
                    Utc(type.UpdatedAt))),
        ];
    }

    private async Task<IReadOnlyList<BackupRelationship>> RelationshipsAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var relationships = await db.Relationships.AsNoTracking()
            .Where(relationship => relationship.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        return
        [
            .. relationships
                .OrderBy(relationship => Key(relationship.SourceEntityId), StringComparer.Ordinal)
                .ThenBy(relationship => Key(relationship.TargetEntityId), StringComparer.Ordinal)
                .ThenBy(relationship => Key(relationship.RelationshipTypeId), StringComparer.Ordinal)
                .ThenBy(relationship => Key(relationship.Id), StringComparer.Ordinal)
                .Select(relationship => new BackupRelationship(
                    relationship.Id,
                    relationship.RelationshipTypeId,
                    relationship.SourceEntityId,
                    relationship.TargetEntityId,
                    relationship.CanonStatus,
                    Utc(relationship.StartDate),
                    Utc(relationship.EndDate),
                    relationship.Notes,
                    Utc(relationship.CreatedAt),
                    Utc(relationship.UpdatedAt))),
        ];
    }

    // ---------- Timeline ----------

    private async Task<IReadOnlyList<BackupTimelineEntry>> TimelineAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var entries = await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var links = await db.TimelineEntryLinks.AsNoTracking()
            .Where(link => link.TimelineEntry!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var participantsByEntry = links
            .GroupBy(link => link.TimelineEntryId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<Guid>)
                [
                    .. group.Select(link => link.EntityId).OrderBy(Key, StringComparer.Ordinal),
                ]);

        return
        [
            .. entries
                .OrderBy(entry => entry.Title, StringComparer.Ordinal)
                .ThenBy(entry => Key(entry.Id), StringComparer.Ordinal)
                .Select(entry => new BackupTimelineEntry(
                    entry.Id,
                    entry.Title,
                    entry.Description,
                    entry.CanonStatus,
                    entry.DateKind,
                    entry.StartYear,
                    entry.StartMonth,
                    entry.StartDay,
                    entry.EndYear,
                    entry.EndMonth,
                    entry.EndDay,
                    entry.StartEraId,
                    entry.EndEraId,
                    entry.EraLabel,
                    Utc(entry.CreatedAt),
                    Utc(entry.UpdatedAt),
                    participantsByEntry.GetValueOrDefault(entry.Id, []))),
        ];
    }

    // ---------- Stories ----------

    /// <summary>
    /// Every story by title, each with its scenes in narrative order and each scene's links sorted
    /// by id. Only ids and authored text: a linked entry's name is in the entry, not here.
    /// </summary>
    private async Task<IReadOnlyList<BackupStory>> StoriesAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var scenes = await db.Scenes.AsNoTracking()
            .Where(scene => scene.Story!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var links = await db.SceneEntityLinks.AsNoTracking()
            .Where(link => link.Scene!.Story!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var linkedByScene = links
            .GroupBy(link => link.SceneId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<Guid>)
                [
                    .. group.Select(link => link.EntityId).OrderBy(Key, StringComparer.Ordinal),
                ]);

        var scenesByStory = scenes
            .GroupBy(scene => scene.StoryId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<BackupScene>)
                [
                    .. group
                        .OrderBy(scene => scene.SortOrder)
                        .ThenBy(scene => Key(scene.Id), StringComparer.Ordinal)
                        .Select(scene => new BackupScene(
                            scene.Id,
                            scene.SortOrder,
                            scene.Title,
                            scene.Summary,
                            scene.Notes,
                            scene.PovEntityId,
                            scene.Year is { } year
                                ? new BackupChronologyValue(scene.EraId, year, scene.Month, scene.Day)
                                : null,
                            linkedByScene.GetValueOrDefault(scene.Id, []),
                            Utc(scene.CreatedAt),
                            Utc(scene.UpdatedAt))),
                ]);

        return
        [
            .. stories
                .OrderBy(story => story.Title, StringComparer.Ordinal)
                .ThenBy(story => Key(story.Id), StringComparer.Ordinal)
                .Select(story => new BackupStory(
                    story.Id,
                    story.Title,
                    story.Premise,
                    story.Status,
                    Utc(story.CreatedAt),
                    Utc(story.UpdatedAt),
                    scenesByStory.GetValueOrDefault(story.Id, []))),
        ];
    }

    // ---------- Canon lifecycle ----------

    /// <summary>
    /// Only the dismissals. A pending or resolved conflict is a finding the next evaluation
    /// re-derives from the lore in this same file; a dismissal is the author's own judgement
    /// and nothing re-derives it. <c>UpdatedAt</c> is when the status last moved, which for a
    /// dismissed conflict is when it was dismissed.
    /// </summary>
    private async Task<IReadOnlyList<BackupDismissedConflict>> DismissedConflictsAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var dismissed = await db.CanonConflicts.AsNoTracking()
            .Where(conflict => conflict.UniverseId == universeId
                && conflict.Status == CanonConflictStatus.Dismissed)
            .Select(conflict => new BackupDismissedConflict(
                conflict.RuleCode,
                conflict.Severity,
                conflict.Fingerprint,
                conflict.UpdatedAt))
            .ToListAsync(cancellationToken);

        return
        [
            .. dismissed
                .OrderBy(conflict => conflict.RuleCode, StringComparer.Ordinal)
                .ThenBy(conflict => conflict.Fingerprint, StringComparer.Ordinal)
                .Select(conflict => conflict with { DismissedAt = Utc(conflict.DismissedAt) }),
        ];
    }

    // ---------- Ordering and timestamps ----------

    /// <summary>
    /// A Guid as an invariant sort key. Ordering by the value would use the platform's own
    /// byte comparison, which is not what a reader of the file sees; ordering by the text is.
    /// </summary>
    private static string Key(Guid id) => id.ToString();

    private static string Key(Guid? id) => id?.ToString() ?? string.Empty;

    /// <summary>
    /// Timestamps are stored as UTC but come back from SQLite kind-less, which would serialise
    /// without a zone and leave the reader guessing. Every moment in the file is written with
    /// an explicit <c>Z</c>.
    /// </summary>
    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    private static DateTime? Utc(DateTime? value) => value is { } moment ? Utc(moment) : null;
}
