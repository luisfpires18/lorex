using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// A scene's prose, read and written on its own address and nowhere else. The story read, the scene routes and the plot
/// read never carry it, so a story of a hundred long scenes still draws its outline without downloading a word.
///
/// Every route proves universe ownership, then the story in that universe, then the scene in that story; a scene reached
/// through another story or universe answers exactly as a missing one does.
///
/// <b>Plain text, stored as sent.</b> No trimming, no normalising and no reading for meaning. Like the rest of a story, a
/// manuscript write passes no Canon gate and reconciles nothing: "The king died before sunrise" gives nobody a death year
/// (ADR 0027).
///
/// <b>No silent overwrite.</b> A save names the <c>updatedAt</c> it was written over. When the stored manuscript has moved
/// on since - saved from another tab or device - the save is refused and nothing is written. This is a comparison inside
/// the write's own transaction, not an editing session: Lorex has one author, and the check exists only so that author's
/// two windows cannot quietly lose each other's prose.
/// </summary>
public static class SceneManuscriptEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over a manuscript that has since changed.</summary>
    public const string ChangedCode = "scene_manuscript_changed";

    public static IEndpointRouteBuilder MapSceneManuscriptEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/scenes/{sceneId:guid}/manuscript")
            .WithTags("Scenes")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetSceneManuscript");
        group.MapPut("/", SaveAsync).WithName("SaveSceneManuscript");

        return endpoints;
    }

    /// <summary>The scene's prose, or an empty manuscript when nothing has been written for it yet.</summary>
    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await StoryEndpoints.OwnsStoryAsync(db, universeId, storyId, principal, cancellationToken)
            || !await SceneInStoryAsync(db, storyId, sceneId, cancellationToken))
        {
            return Results.NotFound();
        }

        var stored = await db.SceneManuscripts.AsNoTracking()
            .Where(manuscript => manuscript.SceneId == sceneId)
            .Select(manuscript => new { manuscript.Content, manuscript.UpdatedAt })
            .FirstOrDefaultAsync(cancellationToken);

        return Results.Ok(stored is null
            ? new SceneManuscriptResponse(sceneId, string.Empty, null)
            : new SceneManuscriptResponse(sceneId, stored.Content, Utc(stored.UpdatedAt)));
    }

    /// <summary>
    /// Replaces the scene's prose with exactly the text sent, creating the row on the first save. Updates the story's
    /// <c>UpdatedAt</c> - the author worked on it - and never the scene's, whose planning did not change.
    /// </summary>
    private static async Task<IResult> SaveAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        [FromBody] SceneManuscriptRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        // One transaction for the comparison and the write, so nothing can land between them: SQLite has one writer.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null || !await SceneInStoryAsync(db, storyId, sceneId, cancellationToken))
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidateManuscript(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var manuscript = await db.SceneManuscripts.FirstOrDefaultAsync(
            candidate => candidate.SceneId == sceneId,
            cancellationToken);

        if (!SameMoment(manuscript?.UpdatedAt, request.ExpectedUpdatedAt))
        {
            return Changed(manuscript?.UpdatedAt);
        }

        var now = DateTime.UtcNow;

        if (manuscript is null)
        {
            manuscript = new SceneManuscript { SceneId = sceneId, Content = request.Content!, UpdatedAt = now };
            db.SceneManuscripts.Add(manuscript);
        }
        else
        {
            manuscript.Content = request.Content!;
            manuscript.UpdatedAt = now;
        }

        story.UpdatedAt = now;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new SceneManuscriptResponse(sceneId, manuscript.Content, now));
    }

    private static Task<bool> SceneInStoryAsync(
        LorexDbContext db,
        Guid storyId,
        Guid sceneId,
        CancellationToken cancellationToken) =>
        db.Scenes.AnyAsync(scene => scene.Id == sceneId && scene.StoryId == storyId, cancellationToken);

    /// <summary>
    /// Whether a save names the manuscript as it is stored: both "nothing saved yet", or the same instant. Compared as UTC
    /// ticks, because SQLite hands a stored moment back with no kind and JSON may carry it with or without a zone.
    /// </summary>
    private static bool SameMoment(DateTime? stored, DateTime? expected) =>
        (stored, expected) switch
        {
            (null, null) => true,
            ({ } a, { } b) => Utc(a).Ticks == Utc(b).Ticks,
            _ => false,
        };

    /// <summary>Stored as UTC; written out with its zone, so a client can send back exactly what it was given.</summary>
    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    /// <summary>
    /// The refusal for a stale save. Carries the stored <c>updatedAt</c>, so a client whose author has seen the warning and
    /// still means to keep their own text can name it and save again - a decision made by a person, never by a retry.
    /// </summary>
    private static IResult Changed(DateTime? current) =>
        Results.Problem(
            title: "Manuscript changed",
            detail: "This scene's manuscript was saved somewhere else after it was opened here. Nothing was overwritten.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = ChangedCode,
                ["updatedAt"] = current is { } moment ? Utc(moment) : null,
            });
}
