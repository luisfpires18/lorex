using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Stories;

namespace Lorex.Api.Features.Restore;

/// <summary>
/// Turns a backup of any supported version into one shape: the current one, with every collection
/// present and every older meaning made explicit. The writer only ever sees this shape, so there is
/// one restore path, not one per version (ADR 0032).
///
/// Two passes, either side of validation.
///
/// <see cref="Project"/> first reads the payload the way its own version defines it. A member that
/// version did not have is taken as absent even if the file carries one: the version number is what
/// says what the file means (ADR 0014), so a version 4 file holding <c>stories</c> was not written by
/// Lorex and its stories are not part of what it claims to be.
///
/// <see cref="Normalize"/> then, on a payload validation has accepted, fills in what an older version
/// left implicit, each exactly as the migration that introduced it did to a live database:
/// <list type="bullet">
/// <item>Version 1: every entry is live.</item>
/// <item>Versions 1-3: a type's icon is kept when it is a known key after trimming and lowercasing, and
/// cleared otherwise (<c>RestrictEntityTypeIconKeys</c>, ADR 0020).</item>
/// <item>Versions 1-3: no eras, so every year is a plain signed year; no relationship constraint.</item>
/// <item>Versions 1-4: no stories. Version 5: every scene is Unchaptered, its story-wide order its order
/// there. Version 6: no plot. Version 7: no prose.</item>
/// <item>Versions 1-8: <c>content</c> is the article, which becomes the article's row with the entry's
/// <c>updatedAt</c> and its version 1 (<c>AddEntityArticles</c>, ADR 0028). Each entry revision's
/// <c>content</c> is the article as it read then, kept as history exactly as the migration kept it.</item>
/// <item>Versions 1-9: nothing is in the Trash, and each manuscript becomes its own version 1
/// (<c>AddContentRecovery</c>, ADR 0029).</item>
/// <item>Versions 1-10: no ideas.</item>
/// </list>
///
/// One thing is normalized for every version: the live rows of each ordered collection are numbered
/// 0, 1, 2… in the order their stored numbers put them. A backup Lorex wrote is already numbered that
/// way, so this changes nothing in one; it only means a file with a gap still restores in its order
/// rather than leaving the next append to collide. Two live rows claiming one place are refused by
/// validation - which of them comes first cannot be known.
/// </summary>
internal static class BackupNormalization
{
    // ---------- Reading a payload as its version defines it ----------

    public static UniverseBackupPayload Project(UniverseBackupPayload payload, int version) => payload with
    {
        ChronologyEras = version >= 4 ? payload.ChronologyEras : null,
        Entities = payload.Entities is null ? null! : [.. payload.Entities.Select(entity => entity is null ? null! : ProjectEntity(entity, version))],
        RelationshipTypes = version >= 4 || payload.RelationshipTypes is null
            ? payload.RelationshipTypes!
            : [.. payload.RelationshipTypes.Select(type => type is null
                ? null!
                : type with { AgeOrder = RelationshipAgeOrder.None, MinAgeDifferenceYears = null, MaxAgeDifferenceYears = null })],
        TimelineEntries = version >= 4 || payload.TimelineEntries is null
            ? payload.TimelineEntries!
            : [.. payload.TimelineEntries.Select(entry => entry is null ? null! : entry with { StartEraId = null, EndEraId = null })],
        Stories = version >= 5 && payload.Stories is not null
            ? [.. payload.Stories.Select(story => story is null ? null! : ProjectStory(story, version))]
            : null,
        Ideas = version >= 11 ? payload.Ideas : null,
    };

    private static BackupEntity ProjectEntity(BackupEntity entity, int version) => entity with
    {
        DeletedAt = version >= 2 ? entity.DeletedAt : null,
        Image = version >= 3 ? entity.Image : null,
        ArticleUpdatedAt = version >= 9 ? entity.ArticleUpdatedAt : null,
        ArticleRevisions = version >= 9 ? entity.ArticleRevisions : null,
        FieldValues = version >= 4 || entity.FieldValues is null
            ? entity.FieldValues!
            : [.. entity.FieldValues.Select(value => value is null ? null! : value with { EraId = null })],
        Revisions = version >= 4 || entity.Revisions is null
            ? entity.Revisions!
            : [.. entity.Revisions.Select(revision => revision is null || revision.FieldValues is null
                ? revision!
                : revision with
                {
                    FieldValues = [.. revision.FieldValues.Select(value => value is null ? null! : value with { EraId = null, EraLabel = null })],
                })],
    };

    private static BackupStory ProjectStory(BackupStory story, int version) => story with
    {
        DeletedAt = version >= 10 ? story.DeletedAt : null,
        Chapters = version >= 6 && story.Chapters is not null
            ? [.. story.Chapters.Select(chapter => chapter is null ? null! : chapter with { DeletedAt = version >= 10 ? chapter.DeletedAt : null })]
            : version >= 6 ? null : [],
        Scenes = story.Scenes is null
            ? null!
            : [.. story.Scenes.Select(scene => scene is null
                ? null!
                : scene with
                {
                    ChapterId = version >= 6 ? scene.ChapterId : null,
                    DeletedAt = version >= 10 ? scene.DeletedAt : null,
                    Manuscript = version < 8 || scene.Manuscript is null
                        ? null
                        : scene.Manuscript with { Revisions = version >= 10 ? scene.Manuscript.Revisions : null },
                })],
        PlotArcs = version >= 7 && story.PlotArcs is not null
            ? [.. story.PlotArcs.Select(arc => arc is null
                ? null!
                : arc with
                {
                    DeletedAt = version >= 10 ? arc.DeletedAt : null,
                    Beats = arc.Beats is null
                        ? null!
                        : [.. arc.Beats.Select(beat => beat is null ? null! : beat with { DeletedAt = version >= 10 ? beat.DeletedAt : null })],
                })]
            : version >= 7 ? null : [],
    };

    // ---------- Filling in what an older version left implicit ----------

    public static UniverseBackupPayload Normalize(UniverseBackupPayload payload, int version) => payload with
    {
        ChronologyEras = Renumber(payload.ChronologyEras ?? [], _ => true, era => era.SortOrder, (era, order) => era with { SortOrder = order }),
        EntityTypes = version >= 4
            ? payload.EntityTypes
            : [.. payload.EntityTypes.Select(type => type with { Icon = LegacyIcon(type.Icon) })],
        Entities = [.. payload.Entities.Select(entity => NormalizeEntity(entity, version))],
        Stories = [.. (payload.Stories ?? []).Select(story => NormalizeStory(story, version))],
        Ideas = payload.Ideas ?? [],
        DismissedConflicts = [.. payload.DismissedConflicts.DistinctBy(conflict => conflict.Fingerprint, StringComparer.Ordinal)],
    };

    /// <summary>A version 1-3 icon, brought inside the closed set the way the migration brought a stored one.</summary>
    internal static string? LegacyIcon(string? icon) =>
        icon?.Trim().ToLowerInvariant() is { Length: > 0 } key && EntityTypeIcons.IsKnown(key) ? key : null;

    private static BackupEntity NormalizeEntity(BackupEntity entity, int version)
    {
        if (version >= 9)
        {
            return entity with { ArticleRevisions = entity.ArticleRevisions ?? [] };
        }

        // Before version 9 the article lived on the entry. A blank one was never an article: the migration moved only
        // text that was not blank, and made what it moved version 1 of the article's own history, dated as the entry was.
        if (string.IsNullOrWhiteSpace(entity.Content))
        {
            return entity with { Content = null, ArticleUpdatedAt = null, ArticleRevisions = [] };
        }

        return entity with
        {
            ArticleUpdatedAt = entity.UpdatedAt,
            ArticleRevisions =
            [
                new BackupArticleRevision(Guid.NewGuid(), 1, EntityRevisionKind.Created, null, entity.UpdatedAt, entity.Content),
            ],
        };
    }

    private static BackupStory NormalizeStory(BackupStory story, int version)
    {
        var chapters = Renumber(
            story.Chapters ?? [],
            chapter => chapter.DeletedAt is null,
            chapter => chapter.SortOrder,
            (chapter, order) => chapter with { SortOrder = order });

        // Scene order is per container: each chapter, and Unchaptered, numbers its live scenes on its own.
        var scenes = story.Scenes
            .Select(scene => version >= 10 || scene.Manuscript is null
                ? scene
                : scene with
                {
                    Manuscript = scene.Manuscript with
                    {
                        Revisions =
                        [
                            new BackupManuscriptRevision(
                                Guid.NewGuid(),
                                1,
                                SceneManuscriptRevisionKind.Created,
                                null,
                                scene.Manuscript.UpdatedAt,
                                scene.Manuscript.Content),
                        ],
                    },
                })
            .ToList();

        foreach (var container in scenes.Where(scene => scene.DeletedAt is null).Select(scene => scene.ChapterId).Distinct().ToList())
        {
            scenes = [.. Renumber(
                scenes,
                scene => scene.DeletedAt is null && scene.ChapterId == container,
                scene => scene.SortOrder,
                (scene, order) => scene with { SortOrder = order })];
        }

        var arcs = Renumber(
            story.PlotArcs ?? [],
            arc => arc.DeletedAt is null,
            arc => arc.SortOrder,
            (arc, order) => arc with { SortOrder = order });

        return story with
        {
            Chapters = chapters,
            Scenes = scenes,
            PlotArcs =
            [
                .. arcs.Select(arc => arc with
                {
                    Beats = Renumber(
                        arc.Beats,
                        beat => beat.DeletedAt is null,
                        beat => beat.SortOrder,
                        (beat, order) => beat with { SortOrder = order }),
                }),
            ],
        };
    }

    /// <summary>
    /// Numbers the rows <paramref name="counts"/> selects 0, 1, 2… in the order their stored numbers put them,
    /// ties broken by where they sit in the file; every other row is left exactly as it was.
    /// </summary>
    private static IReadOnlyList<T> Renumber<T>(
        IReadOnlyList<T> rows,
        Func<T, bool> counts,
        Func<T, int> order,
        Func<T, int, T> renumbered)
    {
        var places = rows
            .Select((row, index) => (Row: row, Index: index))
            .Where(item => counts(item.Row))
            .OrderBy(item => order(item.Row))
            .ThenBy(item => item.Index)
            .Select((item, place) => (item.Index, Place: place))
            .ToDictionary(item => item.Index, item => item.Place);

        return [.. rows.Select((row, index) => places.TryGetValue(index, out var place) && order(row) != place ? renumbered(row, place) : row)];
    }
}
