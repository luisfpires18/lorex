using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Relationships;

/// <summary>
/// Relationships between entities. One row per link: the reverse reading is derived at read
/// time from the relationship type, never stored as a second row. Every route proves
/// universe ownership first, then re-resolves every client id inside that universe, so no
/// id crosses a universe boundary and nothing another owner holds is ever disclosed.
/// </summary>
public static class RelationshipEndpoints
{
    public static IEndpointRouteBuilder MapRelationshipEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/relationships")
            .WithTags("Relationships")
            .RequireAuthorization();

        group.MapGet("/{relationshipId:guid}", GetAsync).WithName("GetRelationship");
        group.MapPost("/", CreateAsync).WithName("CreateRelationship");
        group.MapPut("/{relationshipId:guid}", UpdateAsync).WithName("UpdateRelationship");
        group.MapDelete("/{relationshipId:guid}", DeleteAsync).WithName("DeleteRelationship");

        endpoints.MapGet(
                "/api/universes/{universeId:guid}/entities/{entityId:guid}/relationships",
                ListForEntityAsync)
            .WithTags("Relationships")
            .WithName("ListEntityRelationships")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> ListForEntityAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var entityExists = await db.Entities.AnyAsync(
            entity => entity.Id == entityId && entity.UniverseId == universeId,
            cancellationToken);

        if (!entityExists)
        {
            return Results.NotFound();
        }

        return Results.Ok(await LoadForEntityAsync(db, universeId, entityId, cancellationToken));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid relationshipId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var detail = await LoadDetailAsync(db, universeId, relationshipId, cancellationToken);

        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] RelationshipRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        if (RelationshipValidation.ValidateRelationship(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ResolveReferencesAsync(db, universeId, request, cancellationToken) is { } unresolved)
        {
            return Results.ValidationProblem(unresolved);
        }

        var now = DateTime.UtcNow;
        var relationship = new LoreRelationship
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            RelationshipTypeId = request.RelationshipTypeId,
            SourceEntityId = request.SourceEntityId,
            TargetEntityId = request.TargetEntityId,
            CanonStatus = request.CanonStatus,
            StartDate = RelationshipValidation.Utc(request.StartDate),
            EndDate = RelationshipValidation.Utc(request.EndDate),
            Notes = RelationshipValidation.Normalize(request.Notes),
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Relationships.Add(relationship);
        await db.SaveChangesAsync(cancellationToken);

        var detail = await LoadDetailAsync(db, universeId, relationship.Id, cancellationToken);
        return Results.Created(
            $"/api/universes/{universeId}/relationships/{relationship.Id}",
            detail);
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid relationshipId,
        [FromBody] RelationshipRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var relationship = await db.Relationships.FirstOrDefaultAsync(
            candidate => candidate.Id == relationshipId && candidate.UniverseId == universeId,
            cancellationToken);

        if (relationship is null)
        {
            return Results.NotFound();
        }

        if (RelationshipValidation.ValidateRelationship(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ResolveReferencesAsync(db, universeId, request, cancellationToken) is { } unresolved)
        {
            return Results.ValidationProblem(unresolved);
        }

        relationship.RelationshipTypeId = request.RelationshipTypeId;
        relationship.SourceEntityId = request.SourceEntityId;
        relationship.TargetEntityId = request.TargetEntityId;
        relationship.CanonStatus = request.CanonStatus;
        relationship.StartDate = RelationshipValidation.Utc(request.StartDate);
        relationship.EndDate = RelationshipValidation.Utc(request.EndDate);
        relationship.Notes = RelationshipValidation.Normalize(request.Notes);
        relationship.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        var detail = await LoadDetailAsync(db, universeId, relationship.Id, cancellationToken);
        return Results.Ok(detail);
    }

    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid relationshipId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var relationship = await db.Relationships.FirstOrDefaultAsync(
            candidate => candidate.Id == relationshipId && candidate.UniverseId == universeId,
            cancellationToken);

        if (relationship is null)
        {
            return Results.NotFound();
        }

        // One row holds both readings, so removing it clears the link from either end.
        db.Relationships.Remove(relationship);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    // ---------- Ownership ----------

    /// <summary>
    /// Re-resolves the type and both entities inside this universe. An id that belongs to
    /// another universe is reported as an unusable choice rather than as someone else's
    /// row, so the response discloses nothing about it.
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> ResolveReferencesAsync(
        LorexDbContext db,
        Guid universeId,
        RelationshipRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        var typeExists = await db.RelationshipTypes.AnyAsync(
            type => type.Id == request.RelationshipTypeId && type.UniverseId == universeId,
            cancellationToken);

        if (!typeExists)
        {
            errors["relationshipTypeId"] = ["Choose a relationship type from this universe."];
        }

        var resolvedEntities = await db.Entities
            .Where(entity => entity.UniverseId == universeId
                && (entity.Id == request.SourceEntityId || entity.Id == request.TargetEntityId))
            .Select(entity => entity.Id)
            .ToListAsync(cancellationToken);

        if (!resolvedEntities.Contains(request.SourceEntityId))
        {
            errors["sourceEntityId"] = ["Choose an entry from this universe."];
        }

        if (!resolvedEntities.Contains(request.TargetEntityId))
        {
            errors["targetEntityId"] = ["Choose an entry from this universe."];
        }

        return errors.Count == 0 ? null : errors;
    }

    // ---------- Reading ----------

    private static async Task<RelationshipDetail?> LoadDetailAsync(
        LorexDbContext db,
        Guid universeId,
        Guid relationshipId,
        CancellationToken cancellationToken) =>
        await db.Relationships.AsNoTracking()
            .Where(relationship => relationship.Id == relationshipId && relationship.UniverseId == universeId)
            .Select(relationship => new RelationshipDetail(
                relationship.Id,
                relationship.RelationshipTypeId,
                relationship.RelationshipType!.Name,
                relationship.RelationshipType.InverseName,
                relationship.RelationshipType.IsSymmetric,
                relationship.SourceEntityId,
                relationship.SourceEntity!.Name,
                relationship.TargetEntityId,
                relationship.TargetEntity!.Name,
                relationship.CanonStatus,
                relationship.StartDate,
                relationship.EndDate,
                relationship.Notes,
                relationship.CreatedAt,
                relationship.UpdatedAt))
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// Every link touching one entity, already turned around for that entity. A row where
    /// the entity is the target comes back under the inverse wording, so a client never has
    /// to work out the reverse reading itself.
    /// </summary>
    private static async Task<List<RelationshipView>> LoadForEntityAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        var rows = await db.Relationships.AsNoTracking()
            .Where(relationship => relationship.UniverseId == universeId
                && (relationship.SourceEntityId == entityId || relationship.TargetEntityId == entityId))
            .Select(relationship => new
            {
                relationship.Id,
                relationship.RelationshipTypeId,
                TypeName = relationship.RelationshipType!.Name,
                TypeInverseName = relationship.RelationshipType.InverseName,
                relationship.RelationshipType.IsSymmetric,
                TypeDisplayOrder = relationship.RelationshipType.DisplayOrder,
                relationship.SourceEntityId,
                relationship.TargetEntityId,

                // The other end, chosen in the query so only one entity is ever loaded.
                RelatedId = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntityId
                    : relationship.SourceEntityId,
                RelatedName = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.Name
                    : relationship.SourceEntity!.Name,
                RelatedTypeId = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.EntityTypeId
                    : relationship.SourceEntity!.EntityTypeId,
                RelatedTypeName = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.EntityType!.Name
                    : relationship.SourceEntity!.EntityType!.Name,
                RelatedTypeIcon = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.EntityType!.Icon
                    : relationship.SourceEntity!.EntityType!.Icon,
                RelatedTypeAccent = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.EntityType!.AccentColor
                    : relationship.SourceEntity!.EntityType!.AccentColor,
                RelatedCanonStatus = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.CanonStatus
                    : relationship.SourceEntity!.CanonStatus,
                relationship.CanonStatus,
                relationship.StartDate,
                relationship.EndDate,
                relationship.Notes,
                relationship.CreatedAt,
                relationship.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(row =>
            {
                // Which way the row is being read decides the wording and which end is
                // "the other one". Nothing else about the stored row changes.
                var perspective = row.SourceEntityId == entityId
                    ? RelationshipPerspective.Forward
                    : RelationshipPerspective.Inverse;

                return (row.TypeDisplayOrder, View: new RelationshipView(
                    row.Id,
                    row.RelationshipTypeId,
                    row.TypeName,
                    row.TypeInverseName,
                    row.IsSymmetric,
                    perspective,
                    RelationshipValidation.LabelFor(
                        row.TypeName, row.TypeInverseName, row.IsSymmetric, perspective),
                    entityId,
                    row.RelatedId,
                    row.RelatedName,
                    row.RelatedTypeId,
                    row.RelatedTypeName,
                    row.RelatedTypeIcon,
                    row.RelatedTypeAccent,
                    row.RelatedCanonStatus,
                    row.SourceEntityId,
                    row.TargetEntityId,
                    row.CanonStatus,
                    row.StartDate,
                    row.EndDate,
                    row.Notes,
                    row.CreatedAt,
                    row.UpdatedAt));
            })
            .OrderBy(entry => entry.TypeDisplayOrder)
            .ThenBy(entry => entry.View.Label, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.View.RelatedEntityName, StringComparer.OrdinalIgnoreCase)
            .Select(entry => entry.View)
            .ToList();
    }
}
