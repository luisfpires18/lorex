using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Trash;

/// <summary>
/// Deleting something in the Trash for good: the one irreversible action Lorex offers on authored work (ADR 0015, 0029 and
/// 0033, amended 2026-09-30).
///
/// <b>Only from the Trash.</b> Every route finds its row through its own universe <i>and</i> requires the marker, so a live
/// id answers 404 exactly like a missing one or another world's. Moving to the Trash stays the only delete anywhere else;
/// nothing reaches this without having gone there first. Typed routes, as for restore: an id is never guessed at.
///
/// <b>The schema is the ownership graph.</b> Every dependant is a foreign key that already says what it is (see the
/// ADRs): what a row owns cascades with it - an entry's aliases, tags, values, article, both histories, image row,
/// relationships, timeline participation, scene and beat links and idea references; a story's chapters, scenes, arcs and
/// beats with everything they own in turn; a scene's manuscript and its versions; an arc's beats; a rule's check - and a
/// scene's point of view is cleared. So a delete is one statement on the row itself, and the database removes the rest in
/// that statement, including owned rows that sit in the Trash on their own (a beat binned before its arc goes with the
/// arc). The search indexes follow through their own delete triggers. Nothing a chapter in the Trash could own remains:
/// its scenes went to Unchaptered when it was binned, so none goes with it.
///
/// Three things the schema cannot say, and are done here: another entry's reference value pointing at the erased entry
/// is removed rather than left empty (a write never stores an empty reference); a moment's validation details that named
/// only the erased entry as participant are removed, as clearing all three parts of them does on a save; and a recorded
/// Canon finding naming what was erased is forgotten, whatever its status - it can never be true or false again.
///
/// <b>No Canon gate.</b> Nothing erased here contributes facts while it is in the Trash, so erasing it cannot add a
/// finding. An entry's delete still reconciles (<see cref="CanonPromotionGate.RecordAsync"/>) because it rewrites live
/// rows the rules read - other entries' references, moments' participants - and the conflict table must describe the
/// lore that is left, in the same transaction. Story content contributes nothing (ADR 0024); a rule in the Trash is not
/// checked, so erasing it leaves every live finding as it was.
///
/// <b>An image goes after the commit.</b> Its object keys are read first, the database is changed and committed, and only
/// then are the original and thumbnail swept - so nothing ever names a deleted object. A sweep that fails is logged as
/// orphaned media and changes nothing (ADR 0019): the entry is gone either way.
/// </summary>
internal static class TrashPermanentDelete
{
    public static async Task<IResult> DeleteEntryAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        string[] objectKeys = [];

        var result = await canon.RecordAsync(
            universeId,
            async token =>
            {
                if (!await db.Entities.AnyAsync(
                    entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt != null,
                    token))
                {
                    return Results.NotFound();
                }

                objectKeys = await db.EntityImages
                    .Where(image => image.EntityId == entityId)
                    .Select(image => new[] { image.OriginalKey, image.ThumbnailKey })
                    .FirstOrDefaultAsync(token) ?? [];

                var relationshipIds = await db.Relationships
                    .Where(relationship => relationship.SourceEntityId == entityId || relationship.TargetEntityId == entityId)
                    .Select(relationship => relationship.Id)
                    .ToListAsync(token);

                await db.EntityFieldValues
                    .Where(value => value.ReferencedEntityId == entityId)
                    .ExecuteDeleteAsync(token);

                await db.TimelineEntryValidations
                    .Where(details => details.ParticipantEntityId == entityId
                        && details.EventKindTermId == null
                        && details.MethodTermId == null)
                    .ExecuteDeleteAsync(token);

                await ForgetFindingsAsync(db, universeId, CanonSubjectKind.Entity, [entityId], token);
                await ForgetFindingsAsync(db, universeId, CanonSubjectKind.Relationship, relationshipIds, token);

                await db.Entities.Where(entity => entity.Id == entityId).ExecuteDeleteAsync(token);

                return Results.NoContent();
            },
            cancellationToken);

        if (objectKeys.Length > 0 && result is IStatusCodeHttpResult { StatusCode: StatusCodes.Status204NoContent })
        {
            await EntityImageEndpoints.SweepAsync(store, loggerFactory.CreateLogger("Lorex.EntityImages"), objectKeys);
        }

        return result;
    }

    /// <summary>
    /// Erases a story and everything in it, and answers 200 with <see cref="TrashErasedStory"/>: the ids of every scene that
    /// went with it, live or in the Trash on its own, read in the same transaction as the delete. A client holds recovery
    /// copies of unsaved manuscripts by scene id (ADR 0029), and a story's scenes are the one thing erased here it could not
    /// otherwise name, so it lets exactly those go - and nothing else - once this has answered.
    /// </summary>
    public static async Task<IResult> DeleteStoryAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var story = db.Stories.Where(candidate => candidate.Id == storyId
            && candidate.UniverseId == universeId
            && candidate.DeletedAt != null);

        if (!await story.AnyAsync(cancellationToken))
        {
            return Results.NotFound();
        }

        var sceneIds = await db.Scenes
            .Where(scene => scene.StoryId == storyId)
            .OrderBy(scene => scene.Id)
            .Select(scene => scene.Id)
            .ToListAsync(cancellationToken);

        await story.ExecuteDeleteAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new TrashErasedStory(storyId, sceneIds));
    }

    public static async Task<IResult> DeleteChapterAsync(
        Guid universeId,
        Guid chapterId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken) =>
        await EraseAsync(
            db,
            universeId,
            principal,
            db.Chapters.Where(chapter => chapter.Id == chapterId
                && chapter.Story!.UniverseId == universeId
                && chapter.DeletedAt != null),
            cancellationToken);

    public static async Task<IResult> DeleteSceneAsync(
        Guid universeId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken) =>
        await EraseAsync(
            db,
            universeId,
            principal,
            db.Scenes.Where(scene => scene.Id == sceneId && scene.Story!.UniverseId == universeId && scene.DeletedAt != null),
            cancellationToken);

    public static async Task<IResult> DeletePlotArcAsync(
        Guid universeId,
        Guid plotArcId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken) =>
        await EraseAsync(
            db,
            universeId,
            principal,
            db.PlotArcs.Where(arc => arc.Id == plotArcId && arc.Story!.UniverseId == universeId && arc.DeletedAt != null),
            cancellationToken);

    public static async Task<IResult> DeletePlotBeatAsync(
        Guid universeId,
        Guid plotBeatId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken) =>
        await EraseAsync(
            db,
            universeId,
            principal,
            db.PlotBeats.Where(beat => beat.Id == plotBeatId
                && beat.PlotArc!.Story!.UniverseId == universeId
                && beat.DeletedAt != null),
            cancellationToken);

    public static async Task<IResult> DeleteWorldRuleAsync(
        Guid universeId,
        Guid worldRuleId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var deleted = await db.WorldRules
            .Where(rule => rule.Id == worldRuleId && rule.UniverseId == universeId && rule.DeletedAt != null)
            .ExecuteDeleteAsync(cancellationToken);

        if (deleted == 0)
        {
            return Results.NotFound();
        }

        await ForgetFindingsAsync(db, universeId, CanonSubjectKind.WorldRule, [worldRuleId], cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// One statement on the row, which is atomic on its own; the cascades run inside it. Nothing matched - missing, live,
    /// or another universe's - is a 404, and nothing was written.
    /// </summary>
    private static async Task<IResult> EraseAsync<T>(
        LorexDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        IQueryable<T> row,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        return await row.ExecuteDeleteAsync(cancellationToken) == 0 ? Results.NotFound() : Results.NoContent();
    }

    /// <summary>
    /// Forgets every recorded finding naming one of <paramref name="ids"/>, whatever its status. Its subjects go with it.
    /// </summary>
    private static Task ForgetFindingsAsync(
        LorexDbContext db,
        Guid universeId,
        CanonSubjectKind kind,
        List<Guid> ids,
        CancellationToken cancellationToken) =>
        ids.Count == 0
            ? Task.CompletedTask
            : db.CanonConflicts
                .Where(conflict => conflict.UniverseId == universeId
                    && conflict.Subjects.Any(subject => subject.SubjectKind == kind && ids.Contains(subject.SubjectId)))
                .ExecuteDeleteAsync(cancellationToken);
}
