using System.Text.RegularExpressions;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Lorex.Api.Features.WorldRules;

namespace Lorex.Api.Features.Restore;

/// <summary>
/// One picture that passed validation: what the writer needs to store it again under new ids. The
/// thumbnail is already cut, by the same gate an upload goes through; the original is read back out
/// of the archive when it is written, so it is never held here.
/// </summary>
internal sealed record ValidatedImage(
    Guid EntityId,
    string MediaPath,
    string ContentType,
    string Extension,
    int Width,
    int Height,
    long ByteSize,
    byte[] Thumbnail);

/// <summary>
/// A backup that can be restored: the payload in the current shape (<see cref="BackupNormalization"/>),
/// every picture proven readable, and what the author is shown before they commit to it.
/// </summary>
internal sealed record RestorableBackup(
    int FormatVersion,
    DateTime GeneratedAt,
    UniverseBackupPayload Payload,
    IReadOnlyDictionary<Guid, ValidatedImage> Images,
    int RecordCount,
    BackupPreviewCounts Counts);

/// <summary>
/// Decides whether a parsed backup can be reconstructed, without writing anything anywhere.
///
/// <para><b>Structural, not semantic.</b> Every check here is one the destination already depends on:
/// an id is unique, a reference resolves to something of the right kind in the same file, an enum is
/// one Lorex knows, text fits its column, a unique index would not be broken, a document is one the
/// article editor may render, two live rows do not claim one place. Nothing is judged for sense - no
/// relationship read from its name, no era guessed from a label, no Canon re-decided - because a
/// fictional world that looks inconsistent is still the author's world.</para>
///
/// <para><b>Everything a reference could reach is in the file.</b> Every id the writer will translate
/// has to be listed here first, so no restored row can point at anything outside the universe being
/// created - not at the universe the backup came from, not at another account's. A reference to
/// something the file does not hold is refused rather than dropped.</para>
///
/// <para><b>Stored history is the exception, deliberately.</b> An entry version records the ids of the
/// field, option, era and entry it showed at the time, with no key behind them (ADR 0013): the field
/// may since have been deleted. Those ids are not required to resolve, and the writer gives each one
/// a fresh id of its own rather than keeping the source's, so history cannot point outside the
/// restored universe either.</para>
///
/// <para>The pictures are decoded in full - not just identified - and cut into thumbnails by
/// <see cref="ImagePreparation"/>, so a picture that would fail the restore fails the validation.</para>
/// </summary>
internal static partial class BackupValidation
{
    public static async Task<RestorableBackup> ValidateAsync(OpenedBackup opened, CancellationToken cancellationToken)
    {
        var version = opened.Backup.FormatVersion;
        var projected = BackupNormalization.Project(opened.Backup.Payload, version);

        var issues = new BackupIssueList();
        new ContentChecks(projected, version, issues, opened).Run();
        issues.ThrowIfAny();

        var payload = BackupNormalization.Normalize(projected, version);
        var records = CountRecords(payload);

        if (records > BackupRestoreLimits.MaxRecords)
        {
            throw BackupRejectedException.One(
                BackupRejection.TooLarge,
                BackupIssueCodes.TooLarge,
                $"This backup holds {records:N0} records. Lorex restores at most {BackupRestoreLimits.MaxRecords:N0} at once.");
        }

        var images = await CheckImagesAsync(payload, opened, issues, cancellationToken);
        issues.ThrowIfAny();

        return new RestorableBackup(
            version,
            opened.Backup.GeneratedAt,
            payload,
            images,
            records,
            BackupPreviewCounts.Of(payload, images.Count));
    }

    // ---------- Pictures ----------

    private static async Task<Dictionary<Guid, ValidatedImage>> CheckImagesAsync(
        UniverseBackupPayload payload,
        OpenedBackup opened,
        BackupIssueList issues,
        CancellationToken cancellationToken)
    {
        var withImages = payload.Entities.Where(entity => entity.Image is not null).ToList();
        var results = new Dictionary<Guid, ValidatedImage>();
        using var gate = new SemaphoreSlim(BackupRestoreLimits.ImageConcurrency);

        await Task.WhenAll(withImages.Select(async entity =>
        {
            await gate.WaitAsync(cancellationToken);
            try
            {
                var image = entity.Image!;
                var bytes = await opened.ReadMediaAsync(image.MediaPath, cancellationToken);
                var crop = image.Crop is { } stored ? new ImageCrop(stored.X, stored.Y, stored.Width, stored.Height) : null;

                using var stream = new MemoryStream(bytes, writable: false);
                PreparedImage? prepared;
                ImageRejection? rejection;

                try
                {
                    (prepared, rejection) = await ImagePreparation.PrepareAsync(stream, bytes.Length, crop, cancellationToken);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    // The upload gate names the failures an author's own file produces; bytes built to break a decoder
                    // can fail in ways it does not, and those are a picture that cannot be used all the same.
                    (prepared, rejection) = (null, new ImageRejection(ImagePreparation.FileField, "That image could not be read."));
                }

                lock (results)
                {
                    if (prepared is null)
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} could not be used: {rejection!.Message}");
                    }
                    else if (!string.Equals(prepared.ContentType, image.ContentType, StringComparison.Ordinal))
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} is not the kind of image the backup says it is.");
                    }
                    else if (bytes.Length != image.ByteSize)
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} is not the size the backup says it is.");
                    }
                    else
                    {
                        results[entity.Id] = new ValidatedImage(
                            entity.Id,
                            image.MediaPath,
                            prepared.ContentType,
                            prepared.Extension,
                            prepared.Width,
                            prepared.Height,
                            bytes.Length,
                            prepared.Thumbnail);
                    }
                }
            }
            finally
            {
                gate.Release();
            }
        }));

        return results;
    }

    private static int CountRecords(UniverseBackupPayload payload)
    {
        long count = 1 + payload.ChronologyEras!.Count + payload.Tags.Count + payload.RelationshipTypes.Count
            + payload.DismissedConflicts.Count;

        foreach (var type in payload.EntityTypes)
        {
            count += 1 + type.Fields.Count + type.Fields.Sum(field => (long)field.Options.Count);
        }

        foreach (var entity in payload.Entities)
        {
            count += 2 + entity.Aliases.Count + entity.TagIds.Count + entity.FieldValues.Count + (entity.Image is null ? 0 : 1)
                + entity.ArticleRevisions!.Count;

            foreach (var revision in entity.Revisions)
            {
                count += 1 + revision.Aliases.Count + revision.Tags.Count + revision.FieldValues.Count;
            }
        }

        count += payload.Relationships.Count;
        count += payload.TimelineEntries.Sum(entry => 1L + entry.ParticipantEntityIds.Count);

        foreach (var story in payload.Stories!)
        {
            count += 1 + story.Chapters!.Count;
            count += story.Scenes.Sum(scene => 1L + scene.LinkedEntityIds.Count
                + (scene.Manuscript is null ? 0 : 1 + scene.Manuscript.Revisions!.Count));
            count += story.PlotArcs!.Sum(arc => 1L + arc.Beats.Sum(beat => 1L + beat.LinkedSceneIds.Count + beat.LinkedEntityIds.Count));
        }

        count += payload.Ideas!.Sum(idea => 1L + idea.References.Count);
        count += payload.WorldRules!.Sum(rule => rule.Validation is null ? 1L : 2L);
        count += payload.ValidationTerms!.Count;
        count += payload.TimelineEntries.Count(entry => entry.Validation is not null);

        return (int)Math.Min(count, int.MaxValue);
    }

    internal static string Entry(BackupEntity entity) => $"the entry {Quote(entity.Name)}";

    internal static string Quote(string? text) =>
        text is null ? "(unnamed)" : text.Length <= 60 ? $"\"{text}\"" : $"\"{text[..57]}...\"";

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    internal static partial Regex AccentColorPattern();

    [GeneratedRegex("^[0-9a-f]{64}$")]
    internal static partial Regex FingerprintPattern();

    /// <summary>One walk over a projected payload, adding every problem it finds to one list.</summary>
    private sealed class ContentChecks(UniverseBackupPayload payload, int version, BackupIssueList issues, OpenedBackup opened)
    {
        private readonly HashSet<Guid> _ids = [];
        private readonly Dictionary<Guid, BackupEntityType> _types = [];
        private readonly Dictionary<Guid, Guid> _fieldOwner = [];
        private readonly HashSet<Guid> _options = [];
        private readonly HashSet<Guid> _tags = [];
        private readonly Dictionary<Guid, BackupEntity> _entities = [];
        private readonly HashSet<Guid> _eras = [];
        private readonly HashSet<Guid> _relationshipTypes = [];
        private readonly HashSet<Guid> _stories = [];
        private readonly Dictionary<Guid, Guid> _sceneStory = [];
        private readonly HashSet<Guid> _arcs = [];
        private readonly HashSet<Guid> _beats = [];
        private readonly Dictionary<Guid, ValidationTermKind> _terms = [];
        private readonly HashSet<string> _referencedMedia = new(StringComparer.Ordinal);

        public void Run()
        {
            if (payload.Universe is null)
            {
                Missing("the universe itself");
                return;
            }

            CheckUniverse(payload.Universe);

            var eras = Required(payload.ChronologyEras, "the list of eras", since: 4);
            var types = Required(payload.EntityTypes, "the list of entry types");
            var tags = Required(payload.Tags, "the list of tags");
            var entities = Required(payload.Entities, "the list of entries");
            var relationshipTypes = Required(payload.RelationshipTypes, "the list of relation kinds");
            var relationships = Required(payload.Relationships, "the list of relationships");
            var timeline = Required(payload.TimelineEntries, "the timeline");
            var stories = Required(payload.Stories, "the list of stories", since: 5);
            var dismissed = Required(payload.DismissedConflicts, "the dismissed Canon conflicts");
            var ideas = Required(payload.Ideas, "the list of ideas", since: 11);
            var worldRules = Required(payload.WorldRules, "the list of world rules", since: 12);
            var terms = Required(payload.ValidationTerms, "the list of event kinds and methods", since: 13);

            // Everything that can be referenced is listed first, so a reference checked below can
            // point anywhere in the file regardless of order.
            RegisterEras(eras);
            RegisterTypes(types);
            RegisterTags(tags);
            RegisterEntities(entities);
            RegisterRelationshipTypes(relationshipTypes);
            RegisterStories(stories);
            RegisterValidationTerms(terms);

            foreach (var entity in entities)
            {
                if (entity is not null)
                {
                    CheckEntity(entity);
                }
            }

            foreach (var relationship in relationships)
            {
                CheckRelationship(relationship);
            }

            foreach (var entry in timeline)
            {
                CheckTimelineEntry(entry);
            }

            foreach (var story in stories)
            {
                if (story is not null)
                {
                    CheckStory(story);
                }
            }

            foreach (var idea in ideas)
            {
                CheckIdea(idea);
            }

            foreach (var rule in worldRules)
            {
                CheckWorldRule(rule);
            }

            foreach (var conflict in dismissed)
            {
                CheckDismissedConflict(conflict);
            }

            CheckArchiveHoldsOnlyPictures();
        }

        // ---------- Universe ----------

        private void CheckUniverse(BackupUniverse universe)
        {
            // The universe's own id is never used - a restore is a new universe - so it is not registered.
            Text(universe.Name, UniverseConfiguration.NameMaxLength, "The universe's name", required: true);
            Text(universe.Description, UniverseConfiguration.DescriptionMaxLength, "The universe's description");
            Accent(universe.AccentColor, "The universe's colour");
        }

        // ---------- Eras ----------

        private void RegisterEras(IReadOnlyList<BackupChronologyEra> eras)
        {
            if (eras.Count > ChronologyLimits.MaxEras)
            {
                Add(BackupIssueCodes.InvalidValue, $"The backup names {eras.Count} eras. A universe can name at most {ChronologyLimits.MaxEras}.");
            }

            var places = new HashSet<int>();

            foreach (var era in eras)
            {
                if (era is null)
                {
                    Missing("an era");
                    continue;
                }

                var what = $"The era {Quote(era.Name)}";
                Register(era.Id, what);
                _eras.Add(era.Id);
                Text(era.Name, ChronologyLimits.NameMaxLength, $"{what}'s name", required: true);
                Text(era.Abbreviation, ChronologyLimits.AbbreviationMaxLength, $"{what}'s short label");
                Defined(era.Direction, $"{what}'s direction");
                Defined(era.LabelPosition, $"{what}'s label position");

                if (!places.Add(era.SortOrder))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"{what} claims the same place in the reckoning as another era.");
                }
            }
        }

        // ---------- Types and fields ----------

        private void RegisterTypes(IReadOnlyList<BackupEntityType> types)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);

            foreach (var type in types)
            {
                if (type is null)
                {
                    Missing("an entry type");
                    continue;
                }

                var what = $"The entry type {Quote(type.Name)}";
                Register(type.Id, what);
                _types[type.Id] = type;

                if (Text(type.Name, LoreLimits.NameMaxLength, $"{what}'s name", required: true) && !names.Add(type.Name))
                {
                    Add(BackupIssueCodes.Duplicate, $"Two entry types are both called {Quote(type.Name)}.");
                }

                Text(type.Description, LoreLimits.DescriptionMaxLength, $"{what}'s description");
                Accent(type.AccentColor, $"{what}'s colour");

                // Before version 4 an icon is brought inside the set by normalization, as the migration did.
                if (version >= 4 && type.Icon is not null && !EntityTypeIcons.IsKnown(type.Icon))
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has an icon Lorex does not have.");
                }

                var fields = Required(type.Fields, $"{what}'s fields");
                var fieldNames = new HashSet<string>(StringComparer.Ordinal);
                var semantics = new HashSet<EntityFieldSemantic>();

                foreach (var field in fields)
                {
                    if (field is null)
                    {
                        Missing($"a field of {what.ToLowerInvariant()}");
                        continue;
                    }

                    var fieldWhat = $"The field {Quote(field.Name)} of {Quote(type.Name)}";
                    Register(field.Id, fieldWhat);
                    _fieldOwner[field.Id] = type.Id;

                    if (Text(field.Name, LoreLimits.NameMaxLength, $"{fieldWhat}'s name", required: true) && !fieldNames.Add(field.Name))
                    {
                        Add(BackupIssueCodes.Duplicate, $"The entry type {Quote(type.Name)} has two fields called {Quote(field.Name)}.");
                    }

                    Defined(field.Kind, $"{fieldWhat}'s kind");
                    Text(field.DefaultValue, LoreLimits.TextValueMaxLength, $"{fieldWhat}'s default value");

                    if (field.Semantic is { } semantic)
                    {
                        if (!Enum.IsDefined(semantic))
                        {
                            Add(BackupIssueCodes.InvalidValue, $"{fieldWhat} declares a meaning Lorex does not know.");
                        }
                        else if (!LoreValidation.IsSemanticCompatible(semantic, field.Kind))
                        {
                            Add(BackupIssueCodes.InvalidValue, $"{fieldWhat} means {LoreValidation.SemanticWord(semantic)} but is not a Number field.");
                        }
                        else if (!semantics.Add(semantic))
                        {
                            Add(BackupIssueCodes.Duplicate, $"The entry type {Quote(type.Name)} has two fields that mean {LoreValidation.SemanticWord(semantic)}.");
                        }
                    }

                    var optionValues = new HashSet<string>(StringComparer.Ordinal);

                    foreach (var option in Required(field.Options, $"{fieldWhat}'s options"))
                    {
                        if (option is null)
                        {
                            Missing($"an option of {fieldWhat.ToLowerInvariant()}");
                            continue;
                        }

                        Register(option.Id, $"An option of {fieldWhat.ToLowerInvariant()}");
                        _options.Add(option.Id);

                        if (Text(option.Value, LoreLimits.OptionMaxLength, $"An option of {fieldWhat.ToLowerInvariant()}", required: true)
                            && !optionValues.Add(option.Value))
                        {
                            Add(BackupIssueCodes.Duplicate, $"{fieldWhat} lists the option {Quote(option.Value)} twice.");
                        }
                    }
                }
            }
        }

        private void RegisterTags(IReadOnlyList<BackupTag> tags)
        {
            var slugs = new HashSet<string>(StringComparer.Ordinal);

            foreach (var tag in tags)
            {
                if (tag is null)
                {
                    Missing("a tag");
                    continue;
                }

                Register(tag.Id, $"The tag {Quote(tag.Name)}");
                _tags.Add(tag.Id);

                // A tag is found by its lower-cased name, and that is unique per universe.
                if (Text(tag.Name, LoreLimits.TagMaxLength, $"The tag {Quote(tag.Name)}", required: true)
                    && !slugs.Add(tag.Name.ToLowerInvariant()))
                {
                    Add(BackupIssueCodes.Duplicate, $"Two tags are both called {Quote(tag.Name)}, apart from capital letters.");
                }
            }
        }

        // ---------- Entries ----------

        private void RegisterEntities(IReadOnlyList<BackupEntity> entities)
        {
            foreach (var entity in entities)
            {
                if (entity is null)
                {
                    Missing("an entry");
                    continue;
                }

                Register(entity.Id, $"The entry {Quote(entity.Name)}");
                _entities[entity.Id] = entity;

                foreach (var revision in entity.Revisions ?? [])
                {
                    if (revision is not null)
                    {
                        Register(revision.Id, $"A saved version of {Entry(entity)}");
                    }
                }

                foreach (var revision in entity.ArticleRevisions ?? [])
                {
                    if (revision is not null)
                    {
                        Register(revision.Id, $"A saved version of the article of {Entry(entity)}");
                    }
                }
            }
        }

        private void CheckEntity(BackupEntity entity)
        {
            var what = char.ToUpperInvariant(Entry(entity)[0]) + Entry(entity)[1..];

            Text(entity.Name, LoreLimits.NameMaxLength, $"{what}'s name", required: true);
            Text(entity.Summary, LoreLimits.SummaryMaxLength, $"{what}'s summary");
            Defined(entity.CanonStatus, $"{what}'s Canon status");
            Reference(_types.ContainsKey(entity.EntityTypeId), $"{what} is of an entry type the backup does not hold.");
            Article(entity.Content, $"{what}'s article");

            if (version >= 9 && entity.Content is not null && entity.ArticleUpdatedAt is null)
            {
                Add(BackupIssueCodes.MissingMember, $"{what} has an article but no record of when it was saved.");
            }

            var aliases = new HashSet<string>(StringComparer.Ordinal);
            foreach (var alias in Required(entity.Aliases, $"{what}'s aliases"))
            {
                if (Text(alias, LoreLimits.NameMaxLength, $"An alias of {Entry(entity)}", required: true) && !aliases.Add(alias))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} lists the alias {Quote(alias)} twice.");
                }
            }

            var tags = new HashSet<Guid>();
            foreach (var tagId in Required(entity.TagIds, $"{what}'s tags"))
            {
                Reference(_tags.Contains(tagId), $"{what} is tagged with a tag the backup does not hold.");

                if (!tags.Add(tagId))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} lists the same tag twice.");
                }
            }

            foreach (var value in Required(entity.FieldValues, $"{what}'s field values"))
            {
                if (value is null)
                {
                    Missing($"a field value of {Entry(entity)}");
                    continue;
                }

                Reference(_fieldOwner.ContainsKey(value.FieldDefinitionId), $"{what} has a value for a field the backup does not hold.");
                Text(value.TextValue, LoreLimits.TextValueMaxLength, $"A value of {Entry(entity)}");

                if (value.OptionId is { } option)
                {
                    Reference(_options.Contains(option), $"{what} has a value naming an option the backup does not hold.");
                }

                if (value.ReferencedEntityId is { } referenced)
                {
                    Reference(_entities.ContainsKey(referenced), $"{what} has a value pointing at an entry the backup does not hold.");
                }

                if (value.EraId is { } era)
                {
                    Reference(_eras.Contains(era), $"{what} has a year counted in an era the backup does not name.");
                }
            }

            if (entity.Image is { } image)
            {
                CheckImage(entity, image, what);
            }

            CheckRevisions(entity, what);
            CheckArticleRevisions(entity, what);
        }

        private void CheckImage(BackupEntity entity, BackupEntityImage image, string what)
        {
            if (image.ContentType is not ("image/jpeg" or "image/png" or "image/webp"))
            {
                Add(BackupIssueCodes.InvalidImage, $"{what} has a picture of a kind Lorex does not store.");
                return;
            }

            // The path is not trusted as written: it has to be exactly the one Lorex would have built from the
            // entry's own id and the picture's kind, which also keeps every read inside the archive's media folder.
            var expected = BackupArchive.MediaPathFor(entity.Id, image.ContentType);

            if (!string.Equals(image.MediaPath, expected, StringComparison.Ordinal))
            {
                Add(BackupIssueCodes.InvalidImage, $"{what} names its picture at a place Lorex would not have put it.");
                return;
            }

            _referencedMedia.Add(expected);

            if (opened.MediaLength(expected) is not { } length)
            {
                Add(BackupIssueCodes.MissingMedia, $"The picture of {Entry(entity)} is missing from the archive.");
                return;
            }

            if (length != image.ByteSize || image.ByteSize <= 0 || image.ByteSize > BackupRestoreLimits.MaxMediaBytes)
            {
                Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} is not the size the backup says it is.");
            }

            if (image.Width <= 0 || image.Height <= 0 || image.Width > ImagePreparation.MaxSide || image.Height > ImagePreparation.MaxSide)
            {
                Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} has dimensions Lorex does not accept.");
            }

            Text(image.FileName, StoredImageLimits.FileNameMaxLength, $"The file name of the picture of {Entry(entity)}");

            if (image.Crop is { } crop && ImagePreparation.CheckCrop(new ImageCrop(crop.X, crop.Y, crop.Width, crop.Height)) is { } badCrop)
            {
                Add(BackupIssueCodes.InvalidImage, $"The thumbnail framing of {Entry(entity)} cannot be used: {badCrop}");
            }
        }

        private void CheckRevisions(BackupEntity entity, string what)
        {
            var numbers = new HashSet<int>();

            foreach (var revision in Required(entity.Revisions, $"{what}'s saved versions"))
            {
                if (revision is null)
                {
                    Missing($"a saved version of {Entry(entity)}");
                    continue;
                }

                var label = $"Version {revision.Number} of {Entry(entity)}";

                if (!numbers.Add(revision.Number))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has two saved versions numbered {revision.Number}.");
                }

                Defined(revision.Kind, $"{label}'s kind");
                Flags(revision.Changes, $"{label}'s changes");
                Defined(revision.CanonStatus, $"{label}'s Canon status");
                Text(revision.EntityTypeName, LoreLimits.NameMaxLength, $"{label}'s type name", required: true);
                Text(revision.Name, LoreLimits.NameMaxLength, $"{label}'s name", required: true);
                Text(revision.Summary, LoreLimits.SummaryMaxLength, $"{label}'s summary");

                // A version from before articles had their own history holds the article as it read then, and it is
                // still shown - so it has to be a document the editor may render, like any article.
                Article(revision.Content, $"{label}'s copy of the article");

                foreach (var alias in Required(revision.Aliases, $"{label}'s aliases"))
                {
                    Text(alias, LoreLimits.NameMaxLength, $"An alias in {label.ToLowerInvariant()}", required: true);
                }

                foreach (var tag in Required(revision.Tags, $"{label}'s tags"))
                {
                    Text(tag, LoreLimits.TagMaxLength, $"A tag in {label.ToLowerInvariant()}", required: true);
                }

                foreach (var value in Required(revision.FieldValues, $"{label}'s field values"))
                {
                    if (value is null)
                    {
                        Missing($"a field value in {label.ToLowerInvariant()}");
                        continue;
                    }

                    Text(value.FieldName, LoreLimits.NameMaxLength, $"A field name in {label.ToLowerInvariant()}", required: true);
                    Defined(value.Kind, $"A field kind in {label.ToLowerInvariant()}");
                    Text(value.TextValue, LoreLimits.TextValueMaxLength, $"A value in {label.ToLowerInvariant()}");
                    Text(value.OptionValue, LoreLimits.OptionMaxLength, $"An option in {label.ToLowerInvariant()}");
                    Text(value.ReferencedEntityName, LoreLimits.NameMaxLength, $"An entry name in {label.ToLowerInvariant()}");
                    Text(value.EraLabel, ChronologyLimits.NameMaxLength, $"An era label in {label.ToLowerInvariant()}");
                }
            }
        }

        private void CheckArticleRevisions(BackupEntity entity, string what)
        {
            if (version < 9)
            {
                return;
            }

            var numbers = new HashSet<int>();

            foreach (var revision in Required(entity.ArticleRevisions, $"{what}'s saved article versions", since: 9))
            {
                if (revision is null)
                {
                    Missing($"a saved version of the article of {Entry(entity)}");
                    continue;
                }

                if (!numbers.Add(revision.Number))
                {
                    Add(BackupIssueCodes.Duplicate, $"The article of {Entry(entity)} has two saved versions numbered {revision.Number}.");
                }

                Defined(revision.Kind, $"Version {revision.Number} of the article of {Entry(entity)}");

                if (revision.Content is null)
                {
                    Missing($"the text of version {revision.Number} of the article of {Entry(entity)}");
                }
                else
                {
                    Article(revision.Content, $"Version {revision.Number} of the article of {Entry(entity)}");
                }
            }
        }

        // ---------- Relationships ----------

        private void RegisterRelationshipTypes(IReadOnlyList<BackupRelationshipType> types)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);

            foreach (var type in types)
            {
                if (type is null)
                {
                    Missing("a relation kind");
                    continue;
                }

                var what = $"The relation kind {Quote(type.Name)}";
                Register(type.Id, what);
                _relationshipTypes.Add(type.Id);

                if (Text(type.Name, RelationshipLimits.NameMaxLength, $"{what}'s name", required: true) && !names.Add(type.Name))
                {
                    Add(BackupIssueCodes.Duplicate, $"Two relation kinds are both called {Quote(type.Name)}.");
                }

                Text(type.InverseName, RelationshipLimits.NameMaxLength, $"{what}'s other reading");
                Text(type.Description, RelationshipLimits.DescriptionMaxLength, $"{what}'s description");

                if (Defined(type.AgeOrder, $"{what}'s age rule") && type.IsSymmetric && type.AgeOrder != RelationshipAgeOrder.None)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} reads the same from both sides, so it cannot name an older side.");
                }

                if (Defined(type.FamilySemantic, $"{what}'s family meaning") && type.IsSymmetric && type.FamilySemantic != RelationshipFamilySemantic.None)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} reads the same from both sides, so it cannot name a parent side.");
                }

                if (type.MinAgeDifferenceYears is < 0 || type.MaxAgeDifferenceYears is < 0)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has a negative age gap.");
                }
                else if (type.MinAgeDifferenceYears > type.MaxAgeDifferenceYears)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what}'s smallest age gap is larger than its largest.");
                }
            }
        }

        private void CheckRelationship(BackupRelationship relationship)
        {
            if (relationship is null)
            {
                Missing("a relationship");
                return;
            }

            Register(relationship.Id, "A relationship");
            Defined(relationship.CanonStatus, "A relationship's Canon status");
            Text(relationship.Notes, RelationshipLimits.NotesMaxLength, "A relationship's notes");
            Reference(_relationshipTypes.Contains(relationship.RelationshipTypeId), "A relationship is of a relation kind the backup does not hold.");

            var source = _entities.GetValueOrDefault(relationship.SourceEntityId);
            var target = _entities.GetValueOrDefault(relationship.TargetEntityId);

            Reference(source is not null && target is not null, "A relationship connects an entry the backup does not hold.");

            if (relationship.SourceEntityId == relationship.TargetEntityId)
            {
                Add(BackupIssueCodes.InvalidValue, $"A relationship connects {(source is null ? "an entry" : Entry(source))} to itself.");
            }
        }

        // ---------- Timeline ----------

        private void CheckTimelineEntry(BackupTimelineEntry entry)
        {
            if (entry is null)
            {
                Missing("a timeline entry");
                return;
            }

            var what = $"The moment {Quote(entry.Title)}";
            Register(entry.Id, what);
            Text(entry.Title, TimelineLimits.TitleMaxLength, $"{what}'s title", required: true);
            Text(entry.Description, TimelineLimits.DescriptionMaxLength, $"{what}'s description");
            Text(entry.EraLabel, TimelineLimits.EraLabelMaxLength, $"{what}'s era label");
            Defined(entry.CanonStatus, $"{what}'s Canon status");
            Defined(entry.DateKind, $"{what}'s kind of date");
            Point(entry.StartEraId, entry.StartYear, entry.StartMonth, entry.StartDay, $"{what}'s start");
            Point(entry.EndEraId, entry.EndYear, entry.EndMonth, entry.EndDay, $"{what}'s end");

            var participants = new HashSet<Guid>();
            foreach (var participant in Required(entry.ParticipantEntityIds, $"{what}'s participants"))
            {
                Reference(_entities.ContainsKey(participant), $"{what} names a participant the backup does not hold.");

                if (!participants.Add(participant))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} names the same participant twice.");
                }
            }

            if (entry.Validation is { } details)
            {
                Term(details.EventKindTermId, ValidationTermKind.EventKind, $"{what} is described with an event kind the backup does not hold.");
                Term(details.MethodTermId, ValidationTermKind.Method, $"{what} is described with a method the backup does not hold.");

                if (details.ParticipantEntityId is { } participant)
                {
                    Reference(_entities.ContainsKey(participant), $"{what} is described with a participant the backup does not hold.");
                }
            }
        }

        // ---------- Stories ----------

        private void RegisterStories(IReadOnlyList<BackupStory> stories)
        {
            foreach (var story in stories)
            {
                if (story is null)
                {
                    Missing("a story");
                    continue;
                }

                Register(story.Id, $"The story {Quote(story.Title)}");
                _stories.Add(story.Id);

                foreach (var scene in story.Scenes ?? [])
                {
                    if (scene is not null)
                    {
                        Register(scene.Id, $"The scene {Quote(scene.Title)}");
                        _sceneStory[scene.Id] = story.Id;

                        foreach (var revision in scene.Manuscript?.Revisions ?? [])
                        {
                            if (revision is not null)
                            {
                                Register(revision.Id, $"A saved version of the manuscript of the scene {Quote(scene.Title)}");
                            }
                        }
                    }
                }

                foreach (var arc in story.PlotArcs ?? [])
                {
                    if (arc is not null)
                    {
                        Register(arc.Id, $"The arc {Quote(arc.Title)}");
                        _arcs.Add(arc.Id);

                        foreach (var beat in arc.Beats ?? [])
                        {
                            if (beat is not null)
                            {
                                Register(beat.Id, $"The beat {Quote(beat.Title)}");
                                _beats.Add(beat.Id);
                            }
                        }
                    }
                }
            }
        }

        private void CheckStory(BackupStory story)
        {
            var what = $"The story {Quote(story.Title)}";
            Text(story.Title, StoryLimits.TitleMaxLength, $"{what}'s title", required: true);
            Text(story.Premise, StoryLimits.PremiseMaxLength, $"{what}'s premise");
            Defined(story.Status, $"{what}'s status");

            var chapters = new HashSet<Guid>();
            var chapterPlaces = new HashSet<int>();

            foreach (var chapter in Required(story.Chapters, $"{what}'s chapters", since: 6))
            {
                if (chapter is null)
                {
                    Missing($"a chapter of {what.ToLowerInvariant()}");
                    continue;
                }

                var chapterWhat = $"The chapter {Quote(chapter.Title)}";
                Register(chapter.Id, chapterWhat);
                chapters.Add(chapter.Id);
                Text(chapter.Title, StoryLimits.TitleMaxLength, $"{chapterWhat}'s title", required: true);
                Text(chapter.Summary, StoryLimits.ChapterSummaryMaxLength, $"{chapterWhat}'s summary");
                Text(chapter.Notes, StoryLimits.ChapterNotesMaxLength, $"{chapterWhat}'s notes");

                if (chapter.DeletedAt is null && !chapterPlaces.Add(chapter.SortOrder))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"Two chapters of {Quote(story.Title)} claim the same place.");
                }
            }

            var scenePlaces = new HashSet<(Guid?, int)>();

            foreach (var scene in Required(story.Scenes, $"{what}'s scenes"))
            {
                if (scene is null)
                {
                    Missing($"a scene of {what.ToLowerInvariant()}");
                    continue;
                }

                var sceneWhat = $"The scene {Quote(scene.Title)}";
                Text(scene.Title, StoryLimits.TitleMaxLength, $"{sceneWhat}'s title", required: true);
                Text(scene.Summary, StoryLimits.SceneSummaryMaxLength, $"{sceneWhat}'s summary");
                Text(scene.Notes, StoryLimits.SceneNotesMaxLength, $"{sceneWhat}'s notes");

                if (scene.ChapterId is { } chapterId)
                {
                    Reference(chapters.Contains(chapterId), $"{sceneWhat} is in a chapter its story does not hold.");
                }

                if (scene.DeletedAt is null && !scenePlaces.Add((scene.ChapterId, scene.SortOrder)))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"Two scenes of {Quote(story.Title)} claim the same place.");
                }

                if (scene.PovEntityId is { } pov)
                {
                    Reference(_entities.ContainsKey(pov), $"{sceneWhat} is told from the point of view of an entry the backup does not hold.");
                }

                if (scene.Chronology is { } chronology)
                {
                    Point(chronology.EraId, chronology.Year, chronology.Month, chronology.Day, $"{sceneWhat}'s date");
                }

                var linked = new HashSet<Guid>();
                foreach (var entityId in Required(scene.LinkedEntityIds, $"{sceneWhat}'s lore"))
                {
                    Reference(_entities.ContainsKey(entityId), $"{sceneWhat} links an entry the backup does not hold.");

                    if (!linked.Add(entityId))
                    {
                        Add(BackupIssueCodes.Duplicate, $"{sceneWhat} links the same entry twice.");
                    }
                }

                if (scene.Manuscript is { } manuscript)
                {
                    CheckManuscript(manuscript, sceneWhat);
                }
            }

            var arcPlaces = new HashSet<int>();

            foreach (var arc in Required(story.PlotArcs, $"{what}'s plot", since: 7))
            {
                if (arc is null)
                {
                    Missing($"an arc of {what.ToLowerInvariant()}");
                    continue;
                }

                var arcWhat = $"The arc {Quote(arc.Title)}";
                Text(arc.Title, StoryLimits.TitleMaxLength, $"{arcWhat}'s title", required: true);
                Text(arc.Description, StoryLimits.PlotDescriptionMaxLength, $"{arcWhat}'s description");
                Text(arc.Notes, StoryLimits.PlotNotesMaxLength, $"{arcWhat}'s notes");

                if (arc.DeletedAt is null && !arcPlaces.Add(arc.SortOrder))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"Two arcs of {Quote(story.Title)} claim the same place.");
                }

                var beatPlaces = new HashSet<int>();

                foreach (var beat in Required(arc.Beats, $"{arcWhat}'s beats"))
                {
                    if (beat is null)
                    {
                        Missing($"a beat of {arcWhat.ToLowerInvariant()}");
                        continue;
                    }

                    var beatWhat = $"The beat {Quote(beat.Title)}";
                    Text(beat.Title, StoryLimits.TitleMaxLength, $"{beatWhat}'s title", required: true);
                    Text(beat.Description, StoryLimits.PlotDescriptionMaxLength, $"{beatWhat}'s description");
                    Text(beat.Notes, StoryLimits.PlotNotesMaxLength, $"{beatWhat}'s notes");

                    if (beat.DeletedAt is null && !beatPlaces.Add(beat.SortOrder))
                    {
                        Add(BackupIssueCodes.InvalidOrder, $"Two beats of {Quote(arc.Title)} claim the same place.");
                    }

                    var scenes = new HashSet<Guid>();
                    foreach (var sceneId in Required(beat.LinkedSceneIds, $"{beatWhat}'s scenes"))
                    {
                        // A beat plays out in scenes of its own story, never another's (ADR 0026).
                        Reference(
                            _sceneStory.TryGetValue(sceneId, out var sceneStory) && sceneStory == story.Id,
                            $"{beatWhat} links a scene its story does not hold.");

                        if (!scenes.Add(sceneId))
                        {
                            Add(BackupIssueCodes.Duplicate, $"{beatWhat} links the same scene twice.");
                        }
                    }

                    var entities = new HashSet<Guid>();
                    foreach (var entityId in Required(beat.LinkedEntityIds, $"{beatWhat}'s lore"))
                    {
                        Reference(_entities.ContainsKey(entityId), $"{beatWhat} links an entry the backup does not hold.");

                        if (!entities.Add(entityId))
                        {
                            Add(BackupIssueCodes.Duplicate, $"{beatWhat} links the same entry twice.");
                        }
                    }
                }
            }
        }

        private void CheckManuscript(BackupSceneManuscript manuscript, string sceneWhat)
        {
            if (manuscript.Content is null)
            {
                Missing($"the text of the manuscript of {sceneWhat.ToLowerInvariant()}");
            }
            else
            {
                Text(manuscript.Content, StoryLimits.ManuscriptMaxLength, $"The manuscript of {sceneWhat.ToLowerInvariant()}");
            }

            var numbers = new HashSet<int>();

            foreach (var revision in Required(manuscript.Revisions, $"the saved versions of the manuscript of {sceneWhat.ToLowerInvariant()}", since: 10))
            {
                if (revision is null)
                {
                    Missing($"a saved version of the manuscript of {sceneWhat.ToLowerInvariant()}");
                    continue;
                }

                var revisionWhat = $"Version {revision.Number} of the manuscript of {sceneWhat.ToLowerInvariant()}";

                if (!numbers.Add(revision.Number))
                {
                    Add(BackupIssueCodes.Duplicate, $"The manuscript of {sceneWhat.ToLowerInvariant()} has two saved versions numbered {revision.Number}.");
                }

                Defined(revision.Kind, $"{revisionWhat}'s kind");

                if (revision.Content is null)
                {
                    Missing($"the text of {revisionWhat.ToLowerInvariant()}");
                }
                else
                {
                    Text(revision.Content, StoryLimits.ManuscriptMaxLength, revisionWhat);
                }
            }
        }

        // ---------- Ideas ----------

        private void CheckIdea(BackupIdea idea)
        {
            if (idea is null)
            {
                Missing("an idea");
                return;
            }

            var what = $"The idea {Quote(idea.Title)}";
            Register(idea.Id, what);
            Text(idea.Title, IdeaLimits.TitleMaxLength, $"{what}'s title", required: true);

            if (idea.Body is null)
            {
                Missing($"the body of {what.ToLowerInvariant()}");
            }
            else
            {
                Text(idea.Body, IdeaLimits.BodyMaxLength, $"{what}'s body");
            }

            var references = new HashSet<(IdeaReferenceKind, Guid)>();

            foreach (var reference in Required(idea.References, $"{what}'s references"))
            {
                if (reference is null)
                {
                    Missing($"a reference of {what.ToLowerInvariant()}");
                    continue;
                }

                // The kind is read as written and never inferred: an id that is an entry is still refused as a scene.
                var resolves = reference.Kind switch
                {
                    IdeaReferenceKind.Entity => _entities.ContainsKey(reference.Id),
                    IdeaReferenceKind.Story => _stories.Contains(reference.Id),
                    IdeaReferenceKind.Scene => _sceneStory.ContainsKey(reference.Id),
                    IdeaReferenceKind.PlotArc => _arcs.Contains(reference.Id),
                    IdeaReferenceKind.PlotBeat => _beats.Contains(reference.Id),
                    _ => false,
                };

                if (!Enum.IsDefined(reference.Kind))
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has a reference of a kind Lorex does not know.");
                }
                else
                {
                    Reference(resolves, $"{what} refers to something the backup does not hold.");
                }

                if (!references.Add((reference.Kind, reference.Id)))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} lists the same reference twice.");
                }
            }
        }

        // ---------- World rules ----------

        /// <summary>A rule's shape only: an id, a title, a description that is there and fits. What it says is never judged.</summary>
        private void CheckWorldRule(BackupWorldRule rule)
        {
            if (rule is null)
            {
                Missing("a world rule");
                return;
            }

            var what = $"The world rule {Quote(rule.Title)}";
            Register(rule.Id, what);
            Text(rule.Title, WorldRuleLimits.TitleMaxLength, $"{what}'s title", required: true);

            if (rule.Description is null)
            {
                Missing($"the description of {what.ToLowerInvariant()}");
            }
            else
            {
                Text(rule.Description, WorldRuleLimits.DescriptionMaxLength, $"{what}'s description");
            }

            // A check's shape only: a pattern Lorex knows, terms of the right kind in the file, a limit it can count to.
            if (rule.Validation is { } check
                && Defined(check.Kind, $"{what}'s check")
                && check.Kind != WorldRuleValidationKind.None)
            {
                Term(check.EventKindTermId, ValidationTermKind.EventKind, $"{what}'s check limits an event kind the backup does not hold.");
                Term(check.MethodTermId, ValidationTermKind.Method, $"{what}'s check limits a method the backup does not hold.");

                if (check.MaxOccurrences is < 1 or > RuleValidationLimits.MaxOccurrencesCeiling)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what}'s check has a limit that is not a whole number from 1 to {RuleValidationLimits.MaxOccurrencesCeiling:N0}.");
                }
            }
        }

        // ---------- Event kinds and methods ----------

        /// <summary>Each term's id, kind and name, and no two of one kind an author could not tell apart. Nothing a name says is judged.</summary>
        private void RegisterValidationTerms(IReadOnlyList<BackupValidationTerm> terms)
        {
            var names = new HashSet<(ValidationTermKind, string)>();

            foreach (var term in terms)
            {
                if (term is null)
                {
                    Missing("an event kind or method");
                    continue;
                }

                var what = $"The event kind or method {Quote(term.Name)}";
                Register(term.Id, what);
                var named = Text(term.Name, RuleValidationLimits.TermNameMaxLength, $"{what}'s name", required: true);

                if (!Defined(term.Kind, $"{what}'s kind"))
                {
                    continue;
                }

                _terms[term.Id] = term.Kind;

                if (named && !names.Add((term.Kind, ValidationTerm.Normalize(term.Name))))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has the same name as another {ValidationTermEndpoints.Word(term.Kind)}.");
                }
            }
        }

        /// <summary>A reference to a term in the file, of exactly the kind named. Absent is allowed; a term of the other kind is not there.</summary>
        private void Term(Guid? termId, ValidationTermKind kind, string message)
        {
            if (termId is { } id)
            {
                Reference(_terms.TryGetValue(id, out var found) && found == kind, message);
            }
        }

        // ---------- Canon ----------

        private void CheckDismissedConflict(BackupDismissedConflict conflict)
        {
            if (conflict is null)
            {
                Missing("a dismissed Canon conflict");
                return;
            }

            Text(conflict.RuleCode, CanonIntegrityLimits.RuleCodeMaxLength, "A dismissed Canon conflict's rule", required: true);
            Defined(conflict.Severity, "A dismissed Canon conflict's severity");

            if (conflict.Fingerprint is null || !FingerprintPattern().IsMatch(conflict.Fingerprint))
            {
                Add(BackupIssueCodes.InvalidValue, "A dismissed Canon conflict does not carry a fingerprint Lorex wrote.");
            }
        }

        // ---------- The archive ----------

        /// <summary>
        /// A Lorex archive is the document and the pictures the document names. Anything else was put there by
        /// something other than Lorex, and is refused rather than silently skipped.
        /// </summary>
        private void CheckArchiveHoldsOnlyPictures()
        {
            foreach (var path in opened.MediaPaths)
            {
                if (!_referencedMedia.Contains(path))
                {
                    Add(BackupIssueCodes.UnexpectedEntry, "The archive holds a file the backup does not name. Lorex writes only backup.json and the entries' pictures.");
                    return;
                }
            }
        }

        // ---------- Shared checks ----------

        private void Register(Guid id, string what)
        {
            if (id == Guid.Empty)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} has no id.");
            }
            else if (!_ids.Add(id))
            {
                Add(BackupIssueCodes.DuplicateId, $"{what} has the same id as something else in the backup.");
            }
        }

        private IReadOnlyList<T> Required<T>(IReadOnlyList<T>? list, string what, int since = 1)
        {
            if (list is null)
            {
                if (version >= since)
                {
                    Missing(what);
                }

                return [];
            }

            return list;
        }

        private void Missing(string what) =>
            Add(BackupIssueCodes.MissingMember, $"The backup is incomplete: {what} is missing.");

        /// <summary>Text within its column's bound; when <paramref name="required"/>, present and not blank. True when it passed.</summary>
        private bool Text(string? value, int max, string what, bool required = false)
        {
            if (value is null || (required && string.IsNullOrWhiteSpace(value)))
            {
                if (required)
                {
                    Add(BackupIssueCodes.MissingMember, $"{what} is missing.");
                    return false;
                }

                return true;
            }

            if (value.Length > max)
            {
                Add(BackupIssueCodes.TooLong, $"{what} is longer than Lorex keeps ({max:N0} characters).");
                return false;
            }

            return true;
        }

        private void Article(string? content, string what)
        {
            if (!LoreContent.TryValidate(content, out var error))
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} cannot be restored: {error}");
            }
        }

        private void Accent(string? color, string what)
        {
            if (color is not null && !AccentColorPattern().IsMatch(color))
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} is not a colour like #4f6bd6.");
            }
        }

        private bool Defined<TEnum>(TEnum value, string what)
            where TEnum : struct, Enum
        {
            if (Enum.IsDefined(value))
            {
                return true;
            }

            Add(BackupIssueCodes.InvalidValue, $"{what} is not a value Lorex knows.");
            return false;
        }

        private void Flags(EntityRevisionChange changes, string what)
        {
            var known = Enum.GetValues<EntityRevisionChange>().Aggregate(EntityRevisionChange.None, (all, flag) => all | flag);

            if ((changes & ~known) != 0)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} is not a value Lorex knows.");
            }
        }

        /// <summary>A stored date's shape: an era the file names, a year from 1 inside one, a month and a day in range.</summary>
        private void Point(Guid? eraId, int? year, int? month, int? day, string what)
        {
            if (eraId is { } era)
            {
                Reference(_eras.Contains(era), $"{what} is counted in an era the backup does not name.");

                if (year is { } value && !ChronologyPoint.IsEraYear(value))
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} is a year inside an era that is not counted from 1.");
                }
            }

            if (month is < 1 or > 12 || day is < 1 or > 31)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} has a month or a day out of range.");
            }
        }

        private void Reference(bool resolves, string message)
        {
            if (!resolves)
            {
                Add(BackupIssueCodes.MissingReference, message);
            }
        }

        private void Add(string code, string message) => issues.Add(code, message);
    }
}
