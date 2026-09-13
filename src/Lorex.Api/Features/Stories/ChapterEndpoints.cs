using System.Linq.Expressions;
using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// The chapters of one story. Every route proves universe ownership, then finds the story inside that
/// universe, then the chapter inside that story - so a chapter id from another story, or a story id from
/// another universe, answers exactly as a missing one does. A chapter id alone is never enough.
///
/// A chapter is optional structure. Its order is the author's and nothing else's: appended on create,
/// closed on delete, moved only by <c>PUT .../chapters/order</c>. No chapter number is stored - the one a
/// reader sees is its position - and no scene's chronology decides where a chapter sits.
///
/// Deleting a chapter never deletes a scene. Its scenes move, in their order, to the end of Unchaptered,
/// and only then does the chapter go, all in one transaction.
///
/// <b>No Canon.</b> Like everything else in a story, nothing here passes the promotion gate or
/// reconciles findings (ADR 0024, ADR 0025).
/// </summary>
public static class ChapterEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a chapter order that moved underneath a write.</summary>
    public const string OrderChangedCode = "story_chapter_order_changed";

    public static IEndpointRouteBuilder MapChapterEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/chapters")
            .WithTags("Chapters")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListChapters");
        group.MapPost("/", CreateAsync).WithName("CreateChapter");
        group.MapPut("/order", ReorderAsync).WithName("ReorderChapters");
        group.MapGet("/{chapterId:guid}", GetAsync).WithName("GetChapter");
        group.MapPut("/{chapterId:guid}", UpdateAsync).WithName("UpdateChapter");
        group.MapDelete("/{chapterId:guid}", DeleteAsync).WithName("DeleteChapter");

        return endpoints;
    }

    /// <summary>Every chapter in the story, first first.</summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await StoryEndpoints.OwnsStoryAsync(db, universeId, storyId, principal, cancellationToken))
        {
            return Results.NotFound();
        }

        return Results.Ok(await LoadChaptersAsync(db, storyId, cancellationToken));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid storyId,
        Guid chapterId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await StoryEndpoints.OwnsStoryAsync(db, universeId, storyId, principal, cancellationToken))
        {
            return Results.NotFound();
        }

        var chapter = await db.Chapters.AsNoTracking()
            .Where(candidate => candidate.Id == chapterId && candidate.StoryId == storyId)
            .Select(ToResponse)
            .FirstOrDefaultAsync(cancellationToken);

        return chapter is null ? Results.NotFound() : Results.Ok(chapter);
    }

    /// <summary>Appended: a new chapter comes after every chapter already in the story, and holds no scene yet.</summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] ChapterRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidateChapter(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var last = await db.Chapters
            .Where(chapter => chapter.StoryId == storyId)
            .MaxAsync(chapter => (int?)chapter.SortOrder, cancellationToken);

        var now = DateTime.UtcNow;
        var chapter = new Chapter
        {
            Id = Guid.NewGuid(),
            StoryId = storyId,
            Title = StoryValidation.Normalize(request.Title)!,
            Summary = StoryValidation.Normalize(request.Summary),
            Notes = StoryValidation.Normalize(request.Notes),
            SortOrder = (last ?? -1) + 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Chapters.Add(chapter);
        story.UpdatedAt = now;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two chapters appended to one story at once both reached for the same place, and the
            // unique order index held. Nothing was written.
            return OrderChanged();
        }

        return Results.Created(
            $"/api/universes/{universeId}/stories/{storyId}/chapters/{chapter.Id}",
            Respond(chapter));
    }

    /// <summary>The title, summary and notes. Never the order, and never the scenes a chapter holds.</summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid storyId,
        Guid chapterId,
        [FromBody] ChapterRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var chapter = await db.Chapters.FirstOrDefaultAsync(
            candidate => candidate.Id == chapterId && candidate.StoryId == storyId,
            cancellationToken);

        if (chapter is null)
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidateChapter(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var now = DateTime.UtcNow;
        chapter.Title = StoryValidation.Normalize(request.Title)!;
        chapter.Summary = StoryValidation.Normalize(request.Summary);
        chapter.Notes = StoryValidation.Normalize(request.Notes);
        chapter.UpdatedAt = now;
        story.UpdatedAt = now;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(Respond(chapter));
    }

    /// <summary>
    /// Removes the chapter and keeps every scene in it. The scenes move to the end of Unchaptered, after
    /// the scenes already there and in the order the chapter told them; Unchaptered is renumbered, the
    /// chapter goes, and the chapters after it each move up one place. One transaction: either all of
    /// that happens or none of it does. A scene keeps its id and everything it holds.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid storyId,
        Guid chapterId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var chapter = await db.Chapters.FirstOrDefaultAsync(
            candidate => candidate.Id == chapterId && candidate.StoryId == storyId,
            cancellationToken);

        if (chapter is null)
        {
            return Results.NotFound();
        }

        try
        {
            var unchaptered = await StoryOrder.LoadContainerAsync(db, storyId, null, cancellationToken);
            var released = await StoryOrder.LoadContainerAsync(db, storyId, chapterId, cancellationToken);

            await StoryOrder.PlaceScenesAsync(
                db, [new SceneContainer(null, [.. unchaptered, .. released])], cancellationToken);

            db.Chapters.Remove(chapter);
            await db.SaveChangesAsync(cancellationToken);

            var remaining = await db.Chapters
                .Where(candidate => candidate.StoryId == storyId)
                .OrderBy(candidate => candidate.SortOrder)
                .ThenBy(candidate => candidate.Id)
                .ToListAsync(cancellationToken);

            await StoryOrder.PlaceChaptersAsync(db, remaining, cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.NoContent();
    }

    /// <summary>
    /// Replaces the story's whole chapter order in one transaction. The request must name every chapter in
    /// this story exactly once; a partial list, a repeated id or an id from anywhere else is refused, and
    /// the refusal says the same thing for a foreign id as for a missing one. Scenes stay in their
    /// chapters, in their order.
    /// </summary>
    private static async Task<IResult> ReorderAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] ChapterOrderRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        if (request.ChapterIds is not { } ids)
        {
            return Refused("List the story's chapters in order.");
        }

        if (ids.Distinct().Count() != ids.Count)
        {
            return Refused("List each chapter once.");
        }

        var chapters = await db.Chapters
            .Where(chapter => chapter.StoryId == storyId)
            .ToListAsync(cancellationToken);

        var byId = chapters.ToDictionary(chapter => chapter.Id);

        if (ids.Count != chapters.Count || ids.Any(id => !byId.ContainsKey(id)))
        {
            return Refused("List every chapter in this story exactly once.");
        }

        try
        {
            await StoryOrder.PlaceChaptersAsync(db, [.. ids.Select(id => byId[id])], cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadChaptersAsync(db, storyId, cancellationToken));

        static IResult Refused(string message) =>
            Results.ValidationProblem(new Dictionary<string, string[]> { ["chapterIds"] = [message] });
    }

    // ---------- Shared ----------

    /// <summary>
    /// Whether <paramref name="chapterId"/> is a chapter of this story. The caller has already proved the
    /// story is the caller's; a chapter id a client sends is never trusted on its own.
    /// </summary>
    internal static Task<bool> BelongsToStoryAsync(
        LorexDbContext db,
        Guid storyId,
        Guid chapterId,
        CancellationToken cancellationToken) =>
        db.Chapters.AnyAsync(
            chapter => chapter.Id == chapterId && chapter.StoryId == storyId,
            cancellationToken);

    /// <summary>The refusal for a chapter id that is not one of this story's, worded the same whoever's it is.</summary>
    internal static Dictionary<string, string[]> ForeignChapter() =>
        new() { ["chapterId"] = ["Choose a chapter from this story."] };

    /// <summary>Every chapter of one story, first first. One query.</summary>
    internal static async Task<List<ChapterResponse>> LoadChaptersAsync(
        LorexDbContext db,
        Guid storyId,
        CancellationToken cancellationToken) =>
        await db.Chapters.AsNoTracking()
            .Where(chapter => chapter.StoryId == storyId)
            .OrderBy(chapter => chapter.SortOrder)
            .ThenBy(chapter => chapter.Id)
            .Select(ToResponse)
            .ToListAsync(cancellationToken);

    private static readonly Expression<Func<Chapter, ChapterResponse>> ToResponse =
        chapter => new ChapterResponse(
            chapter.Id,
            chapter.StoryId,
            chapter.SortOrder,
            chapter.Title,
            chapter.Summary,
            chapter.Notes,
            chapter.CreatedAt,
            chapter.UpdatedAt);

    /// <summary>The same shape for a chapter already in memory, compiled once.</summary>
    private static readonly Func<Chapter, ChapterResponse> Respond = ToResponse.Compile();

    private static IResult OrderChanged() =>
        Results.Problem(
            title: "Story changed",
            detail: "This story's chapters changed while this was being saved. Reload the story and try again.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = OrderChangedCode });
}
