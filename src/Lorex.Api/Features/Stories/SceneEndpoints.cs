using System.Linq.Expressions;
using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// The scenes of one story. Every route proves universe ownership, then finds the story inside that
/// universe, then the scene inside that story - so a scene id from another story, or a story id from
/// another universe, answers exactly as a missing one does.
///
/// <b>Narrative order is the author's.</b> A scene is appended when it is created, the gap closes
/// when one is deleted, and only <c>PUT .../scenes/order</c> moves one. Nothing reads a scene's
/// chronology to decide where it sits, and nothing refuses a scene because it happens in the world
/// before the scene told ahead of it: nonlinear stories are valid.
///
/// <b>No Canon.</b> Like the stories around them, scene writes never pass the promotion gate and
/// never reconcile findings. A scene references lore; it asserts nothing about it (ADR 0024).
/// </summary>
public static class SceneEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a narrative order that moved underneath a write.</summary>
    public const string OrderChangedCode = "story_scene_order_changed";

    public static IEndpointRouteBuilder MapSceneEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/scenes")
            .WithTags("Scenes")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListScenes");
        group.MapPost("/", CreateAsync).WithName("CreateScene");
        group.MapPut("/order", ReorderAsync).WithName("ReorderScenes");
        group.MapGet("/{sceneId:guid}", GetAsync).WithName("GetScene");
        group.MapPut("/{sceneId:guid}", UpdateAsync).WithName("UpdateScene");
        group.MapDelete("/{sceneId:guid}", DeleteAsync).WithName("DeleteScene");

        return endpoints;
    }

    /// <summary>Every scene in the story, in the order it is told.</summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await OwnsStoryAsync(db, universeId, storyId, principal, cancellationToken))
        {
            return Results.NotFound();
        }

        return Results.Ok(await LoadScenesAsync(
            db,
            universeId,
            db.Scenes.Where(scene => scene.StoryId == storyId),
            cancellationToken));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await OwnsStoryAsync(db, universeId, storyId, principal, cancellationToken))
        {
            return Results.NotFound();
        }

        var scene = await LoadSceneAsync(db, universeId, storyId, sceneId, cancellationToken);
        return scene is null ? Results.NotFound() : Results.Ok(scene);
    }

    /// <summary>Appended: a new scene is told after every scene already in the story.</summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] SceneRequest request,
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

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        if (StoryValidation.ValidateScene(request, chronology) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var entityIds = Requested(request);

        if (await CheckReferencesAsync(db, universeId, request.PovEntityId, entityIds, null, [], cancellationToken)
            is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var last = await db.Scenes
            .Where(scene => scene.StoryId == storyId)
            .MaxAsync(scene => (int?)scene.SortOrder, cancellationToken);

        var now = DateTime.UtcNow;
        var scene = new Scene
        {
            Id = Guid.NewGuid(),
            StoryId = storyId,
            Title = StoryValidation.Normalize(request.Title)!,
            SortOrder = (last ?? -1) + 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        Apply(scene, request);

        foreach (var id in entityIds)
        {
            scene.EntityLinks.Add(new SceneEntityLink { EntityId = id });
        }

        db.Scenes.Add(scene);
        story.UpdatedAt = now;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Two scenes appended to one story at once both reached for the same place, and the
            // unique order index held. Nothing was written.
            return OrderChanged();
        }

        var created = await LoadSceneAsync(db, universeId, storyId, scene.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/stories/{storyId}/scenes/{scene.Id}", created);
    }

    /// <summary>
    /// Everything but the scene's place in the telling, which only the order route moves. The point
    /// of view and the linked lore arrive whole and replace what is stored.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        [FromBody] SceneRequest request,
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

        var scene = await db.Scenes
            .Include(candidate => candidate.EntityLinks)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == sceneId && candidate.StoryId == storyId,
                cancellationToken);

        if (scene is null)
        {
            return Results.NotFound();
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        if (StoryValidation.ValidateScene(request, chronology) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var entityIds = Requested(request);
        var stored = scene.EntityLinks.Select(link => link.EntityId).ToHashSet();

        if (await CheckReferencesAsync(
                db, universeId, request.PovEntityId, entityIds, scene.PovEntityId, stored, cancellationToken)
            is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var now = DateTime.UtcNow;
        scene.Title = StoryValidation.Normalize(request.Title)!;
        Apply(scene, request);
        scene.UpdatedAt = now;
        story.UpdatedAt = now;

        // The request carries the whole set, so the stored links are made to match it: anything
        // absent is dropped, anything new is added, and a link already there keeps its row.
        var wanted = entityIds.ToHashSet();

        foreach (var link in scene.EntityLinks.Where(link => !wanted.Contains(link.EntityId)).ToList())
        {
            scene.EntityLinks.Remove(link);
        }

        foreach (var id in entityIds.Where(id => !stored.Contains(id)))
        {
            scene.EntityLinks.Add(new SceneEntityLink { SceneId = scene.Id, EntityId = id });
        }

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await LoadSceneAsync(db, universeId, storyId, sceneId, cancellationToken));
    }

    /// <summary>
    /// Permanent, and the scenes told after it each move up one place, so the order stays contiguous
    /// and the next scene appended still lands last. The scene's links go with it; the lore they
    /// pointed at does not.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
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

        var scene = await db.Scenes.FirstOrDefaultAsync(
            candidate => candidate.Id == sceneId && candidate.StoryId == storyId,
            cancellationToken);

        if (scene is null)
        {
            return Results.NotFound();
        }

        try
        {
            db.Scenes.Remove(scene);
            await db.SaveChangesAsync(cancellationToken);

            var remaining = await db.Scenes
                .Where(candidate => candidate.StoryId == storyId)
                .OrderBy(candidate => candidate.SortOrder)
                .ThenBy(candidate => candidate.Id)
                .ToListAsync(cancellationToken);

            await RenumberAsync(db, remaining, cancellationToken);

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
    /// Replaces the story's whole narrative order in one transaction. The request must name every
    /// scene in this story exactly once - a partial list, a repeated id or an id from anywhere else is
    /// refused rather than guessed at, and the refusal says the same thing for a foreign id as for a
    /// missing one. Chronology plays no part.
    /// </summary>
    private static async Task<IResult> ReorderAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] SceneOrderRequest request,
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

        if (request.SceneIds is not { } ids)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["sceneIds"] = ["List the story's scenes in the order they are told."],
            });
        }

        if (ids.Distinct().Count() != ids.Count)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["sceneIds"] = ["List each scene once."],
            });
        }

        var scenes = await db.Scenes
            .Where(scene => scene.StoryId == storyId)
            .ToListAsync(cancellationToken);

        var byId = scenes.ToDictionary(scene => scene.Id);

        if (ids.Count != scenes.Count || ids.Any(id => !byId.ContainsKey(id)))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["sceneIds"] = ["List every scene in this story exactly once."],
            });
        }

        try
        {
            await RenumberAsync(db, [.. ids.Select(id => byId[id])], cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadScenesAsync(
            db,
            universeId,
            db.Scenes.Where(scene => scene.StoryId == storyId),
            cancellationToken));
    }

    // ---------- Writing ----------

    /// <summary>Copies everything but the title and the order across. The title is set by the caller.</summary>
    private static void Apply(Scene scene, SceneRequest request)
    {
        scene.Summary = StoryValidation.Normalize(request.Summary);
        scene.Notes = StoryValidation.Normalize(request.Notes);
        scene.PovEntityId = request.PovEntityId;

        var point = request.Chronology;
        scene.EraId = point?.EraId;
        scene.Year = point?.Year;
        scene.Month = point?.Month;
        scene.Day = point?.Day;
    }

    /// <summary>The linked lore asked for, each entry once. Repeating an id links it once, as it does on a moment.</summary>
    private static List<Guid> Requested(SceneRequest request) =>
        request.EntityIds?.Distinct().ToList() ?? [];

    /// <summary>
    /// Gives <paramref name="ordered"/> the positions 0, 1, 2... in that order.
    ///
    /// Positions are unique per story and SQLite checks that row by row, so moving a scene up one
    /// place would collide with the scene it passes halfway through the statement. Every scene
    /// first steps aside to a negative position, inside the caller's transaction, and then lands on
    /// its final one - the same move the chronology uses to reorder eras.
    /// </summary>
    private static async Task RenumberAsync(
        LorexDbContext db,
        List<Scene> ordered,
        CancellationToken cancellationToken)
    {
        if (ordered.Select((scene, index) => scene.SortOrder == index).All(inPlace => inPlace))
        {
            return;
        }

        var parked = -1;
        foreach (var scene in ordered)
        {
            scene.SortOrder = parked--;
        }

        await db.SaveChangesAsync(cancellationToken);

        for (var index = 0; index < ordered.Count; index++)
        {
            ordered[index].SortOrder = index;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Re-resolves the point of view and every linked entry inside this universe. Returns the
    /// refusal, or null when every reference is usable.
    ///
    /// An id that is not an entry of this universe is refused without saying whether it exists
    /// anywhere else. An entry in the Trash is kept when the scene already holds it - the form sends
    /// the whole scene back on every save, so refusing it would turn an unrelated edit into a failure
    /// - but it cannot be newly chosen, as the point of view or as a link. Trashing an entry never
    /// removes it from a scene (ADR 0015).
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> CheckReferencesAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? povEntityId,
        List<Guid> entityIds,
        Guid? storedPov,
        HashSet<Guid> storedLinks,
        CancellationToken cancellationToken)
    {
        var wanted = povEntityId is { } pov ? [.. entityIds, pov] : entityIds;

        if (wanted.Count == 0)
        {
            return null;
        }

        var found = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && wanted.Contains(entity.Id))
            .Select(entity => new { entity.Id, IsTrashed = entity.DeletedAt != null })
            .ToDictionaryAsync(entity => entity.Id, entity => entity.IsTrashed, cancellationToken);

        var errors = new Dictionary<string, string[]>();

        if (povEntityId is { } chosen)
        {
            if (!found.TryGetValue(chosen, out var trashed))
            {
                errors["povEntityId"] = ["Choose a point of view from this universe."];
            }
            else if (trashed && chosen != storedPov)
            {
                errors["povEntityId"] = ["That entry is in the Trash. Restore it before choosing it."];
            }
        }

        if (entityIds.Any(id => !found.ContainsKey(id)))
        {
            errors["entityIds"] = ["Link entries from this universe."];
        }
        else if (entityIds.Any(id => found[id] && !storedLinks.Contains(id)))
        {
            errors["entityIds"] = ["An entry in the Trash cannot be newly linked. Restore it first."];
        }

        return errors.Count == 0 ? null : errors;
    }

    private static IResult OrderChanged() =>
        Results.Problem(
            title: "Story changed",
            detail: "This story's scenes changed while this was being saved. Reload the story and try again.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = OrderChangedCode });

    private static async Task<bool> OwnsStoryAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken) =>
        await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken)
        && await db.Stories.AnyAsync(
            story => story.Id == storyId && story.UniverseId == universeId,
            cancellationToken);

    // ---------- Reading ----------

    /// <summary>A scene as it is stored, flat, with its links as ids.</summary>
    private sealed record SceneRow(
        Guid Id,
        Guid StoryId,
        int SortOrder,
        string Title,
        string? Summary,
        string? Notes,
        Guid? PovEntityId,
        Guid? EraId,
        int? Year,
        int? Month,
        int? Day,
        List<Guid> EntityIds,
        DateTime CreatedAt,
        DateTime UpdatedAt);

    /// <summary>An entry as a scene shows it: what it is called, what it is, and its picture.</summary>
    private static readonly Expression<Func<LoreEntity, SceneLoreReference>> ToReference =
        entity => new SceneLoreReference(
            entity.Id,
            entity.Name,
            entity.EntityTypeId,
            entity.EntityType!.Name,
            entity.EntityType.Icon,
            entity.EntityType.AccentColor,
            entity.DeletedAt != null,
            entity.Image == null
                ? null
                : new EntityImageRef(
                    entity.Image.AssetId,
                    entity.Image.ThumbnailId,
                    entity.Image.Width,
                    entity.Image.Height,
                    entity.Image.ContentType,
                    entity.Image.FileName,
                    entity.Image.ByteSize,
                    entity.Image.UploadedAt,
                    entity.Image.CropX == null
                        ? null
                        : new EntityImageCrop(
                            entity.Image.CropX.Value,
                            entity.Image.CropY!.Value,
                            entity.Image.CropWidth!.Value,
                            entity.Image.CropHeight!.Value)));

    private static async Task<SceneResponse?> LoadSceneAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        CancellationToken cancellationToken) =>
        (await LoadScenesAsync(
            db,
            universeId,
            db.Scenes.Where(scene => scene.Id == sceneId && scene.StoryId == storyId),
            cancellationToken))
        .FirstOrDefault();

    /// <summary>
    /// The scenes <paramref name="query"/> selects, in narrative order, with every reference resolved.
    ///
    /// Two queries however many scenes there are: the scenes with their link ids, then every entry
    /// any of them names, read once. The entries are read from the lore each time - a scene holds
    /// only their ids - so a renamed character is renamed in every scene at once. Links are listed by
    /// name, then id, with an ordinal comparer, so the same scene always reads the same way.
    /// </summary>
    internal static async Task<List<SceneResponse>> LoadScenesAsync(
        LorexDbContext db,
        Guid universeId,
        IQueryable<Scene> query,
        CancellationToken cancellationToken)
    {
        var rows = await query.AsNoTracking()
            .OrderBy(scene => scene.SortOrder)
            .ThenBy(scene => scene.Id)
            .Select(scene => new SceneRow(
                scene.Id,
                scene.StoryId,
                scene.SortOrder,
                scene.Title,
                scene.Summary,
                scene.Notes,
                scene.PovEntityId,
                scene.EraId,
                scene.Year,
                scene.Month,
                scene.Day,
                scene.EntityLinks.Select(link => link.EntityId).ToList(),
                scene.CreatedAt,
                scene.UpdatedAt))
            .ToListAsync(cancellationToken);

        var referenced = rows
            .SelectMany(row => row.PovEntityId is { } pov ? row.EntityIds.Append(pov) : row.EntityIds)
            .Distinct()
            .ToList();

        var references = referenced.Count == 0
            ? []
            : await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && referenced.Contains(entity.Id))
                .Select(ToReference)
                .ToDictionaryAsync(reference => reference.EntityId, cancellationToken);

        return
        [
            .. rows.Select(row => new SceneResponse(
                row.Id,
                row.StoryId,
                row.SortOrder,
                row.Title,
                row.Summary,
                row.Notes,
                row.PovEntityId is { } pov ? references.GetValueOrDefault(pov) : null,
                row.Year is null ? null : new ChronologyValue(row.EraId, row.Year, row.Month, row.Day),
                [
                    .. row.EntityIds
                        .Select(id => references.GetValueOrDefault(id))
                        .OfType<SceneLoreReference>()
                        .OrderBy(reference => reference.Name, StringComparer.Ordinal)
                        .ThenBy(reference => reference.EntityId),
                ],
                row.CreatedAt,
                row.UpdatedAt)),
        ];
    }
}
