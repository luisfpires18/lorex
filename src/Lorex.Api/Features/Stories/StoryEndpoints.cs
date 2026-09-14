using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// The stories told inside one universe. Every route proves universe ownership first and then finds
/// the story by its id and that universe together, so a story id from another world answers exactly
/// as a missing one does.
///
/// Nothing here passes the Canon promotion gate or reconciles Canon Integrity, and that is the
/// point rather than an omission: a story contributes no facts. Its scenes reference lore and never
/// restate it, so no write to a story can make the world contradict itself or stop doing so
/// (ADR 0024).
///
/// A story in the Trash answers every route here, and every route beneath it, as a missing one does.
/// Restoring it is the Trash's work (ADR 0029).
/// </summary>
public static class StoryEndpoints
{
    public static IEndpointRouteBuilder MapStoryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/stories")
            .WithTags("Stories")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListStories");
        group.MapPost("/", CreateAsync).WithName("CreateStory");
        group.MapGet("/{storyId:guid}", GetAsync).WithName("GetStory");
        group.MapPut("/{storyId:guid}", UpdateAsync).WithName("UpdateStory");
        group.MapDelete("/{storyId:guid}", DeleteAsync).WithName("DeleteStory");

        return endpoints;
    }

    /// <summary>
    /// Every story in the universe, by title. Unpaged: a universe holds a handful of stories, not
    /// thousands, and paging is the obvious first change if that ever stops being true.
    /// </summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && story.DeletedAt == null)
            .OrderBy(story => story.Title)
            .ThenBy(story => story.Id)
            .Select(story => new StorySummary(
                story.Id,
                story.Title,
                story.Premise,
                story.Status,
                story.Scenes.Count(scene => scene.DeletedAt == null),
                story.CreatedAt,
                story.UpdatedAt))
            .ToListAsync(cancellationToken);

        return Results.Ok(stories);
    }

    private static async Task<IResult> GetAsync(
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

        var story = await LoadDetailAsync(db, universeId, storyId, cancellationToken);
        return story is null ? Results.NotFound() : Results.Ok(story);
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] StoryRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidateStory(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var now = DateTime.UtcNow;
        var story = new Story
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Title = StoryValidation.Normalize(request.Title)!,
            Premise = StoryValidation.Normalize(request.Premise),
            Status = request.Status,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Stories.Add(story);
        await db.SaveChangesAsync(cancellationToken);

        var created = await LoadDetailAsync(db, universeId, story.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/stories/{story.Id}", created);
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] StoryRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var story = await FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidateStory(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        story.Title = StoryValidation.Normalize(request.Title)!;
        story.Premise = StoryValidation.Normalize(request.Premise);
        story.Status = request.Status;
        story.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await LoadDetailAsync(db, universeId, storyId, cancellationToken));
    }

    /// <summary>
    /// Moves the story to the Trash. Only the story is marked: its chapters, scenes, prose, saved versions
    /// and plot stay exactly as they are - out of reach while it is there, and back with it on restore - and
    /// the lore they reference is untouched. A story already in the Trash answers as missing, so the moment
    /// it was thrown away cannot be moved by a second click. Its <c>UpdatedAt</c> is left alone: nothing in it
    /// was written (ADR 0029).
    /// </summary>
    private static async Task<IResult> DeleteAsync(
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

        var story = await FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        story.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// The story, tracked, only if it belongs to this universe and is not in the Trash. The caller has
    /// already proved the universe is the caller's; the story id alone is never trusted.
    /// </summary>
    internal static Task<Story?> FindAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        CancellationToken cancellationToken) =>
        db.Stories.FirstOrDefaultAsync(
            story => story.Id == storyId && story.UniverseId == universeId && story.DeletedAt == null,
            cancellationToken);

    /// <summary>
    /// Whether the caller owns the universe and the story is live in it. For reads; a write finds the story
    /// tracked instead, with <see cref="FindAsync"/>.
    /// </summary>
    internal static async Task<bool> OwnsStoryAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken) =>
        await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken)
        && await db.Stories.AnyAsync(
            story => story.Id == storyId && story.UniverseId == universeId && story.DeletedAt == null,
            cancellationToken);

    /// <summary>
    /// The story, its live chapters and every live scene in it. A fixed number of queries whatever the story
    /// holds: the story, its chapters, its scenes with their link ids, and one read of every entry any scene
    /// references - four for a story of ten chapters and a hundred scenes, as for an empty one. Nothing in the
    /// Trash is read.
    /// </summary>
    internal static async Task<StoryDetail?> LoadDetailAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        CancellationToken cancellationToken)
    {
        var story = await db.Stories.AsNoTracking()
            .Where(candidate => candidate.Id == storyId && candidate.UniverseId == universeId && candidate.DeletedAt == null)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Title,
                candidate.Premise,
                candidate.Status,
                candidate.CreatedAt,
                candidate.UpdatedAt,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (story is null)
        {
            return null;
        }

        var chapters = await ChapterEndpoints.LoadChaptersAsync(db, storyId, cancellationToken);

        var scenes = await SceneEndpoints.LoadScenesAsync(
            db,
            universeId,
            db.Scenes.Where(scene => scene.StoryId == storyId && scene.DeletedAt == null),
            cancellationToken);

        return new StoryDetail(
            story.Id,
            story.Title,
            story.Premise,
            story.Status,
            chapters,
            scenes,
            story.CreatedAt,
            story.UpdatedAt);
    }
}
