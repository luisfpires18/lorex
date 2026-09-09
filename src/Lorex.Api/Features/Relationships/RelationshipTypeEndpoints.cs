using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Relationships;

/// <summary>
/// Relationship types, which are universe-scoped and entirely authored. Every route proves
/// universe ownership first, and the type id from the path is re-resolved inside that
/// universe, so an id from elsewhere reads as absent.
/// </summary>
public static class RelationshipTypeEndpoints
{
    public static IEndpointRouteBuilder MapRelationshipTypeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/relationship-types")
            .WithTags("Relationship types")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListRelationshipTypes");
        group.MapPost("/", CreateAsync).WithName("CreateRelationshipType");
        group.MapPut("/{typeId:guid}", UpdateAsync).WithName("UpdateRelationshipType");
        group.MapDelete("/{typeId:guid}", DeleteAsync).WithName("DeleteRelationshipType");

        return endpoints;
    }

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

        return Results.Ok(await LoadTypesAsync(db, universeId, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] RelationshipTypeRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        if (RelationshipValidation.ValidateType(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (await db.RelationshipTypes.AnyAsync(
                type => type.UniverseId == universeId && type.Name == name,
                cancellationToken))
        {
            return NameTaken();
        }

        var now = DateTime.UtcNow;
        var order = request.DisplayOrder
            ?? await db.RelationshipTypes.Where(type => type.UniverseId == universeId)
                .Select(type => (int?)type.DisplayOrder).MaxAsync(cancellationToken) + 1
            ?? 1;

        var relationshipType = new RelationshipType
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Name = name,
            InverseName = request.IsSymmetric ? null : RelationshipValidation.Normalize(request.InverseName),
            IsSymmetric = request.IsSymmetric,
            Description = RelationshipValidation.Normalize(request.Description),
            DisplayOrder = order,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.RelationshipTypes.Add(relationshipType);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return NameTaken();
        }

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Created(
            $"/api/universes/{universeId}/relationship-types/{relationshipType.Id}",
            types.First(type => type.Id == relationshipType.Id));
    }

    /// <summary>
    /// Reconciled but not gated, and for a reason worth writing down: this route changes no
    /// fact any rule tests, only a word one of them quotes.
    ///
    /// <c>CANON-REL-001</c> reads this type's name into the sentence it stores, while its
    /// fingerprint is the relationship and the offending endpoint - so a rename rewords an
    /// existing conflict in place and cannot open, close or duplicate one. Without reconciling
    /// here, that sentence would name a relation kind the author has already renamed, until
    /// somebody happened to ask for an evaluation. Nothing here can reach High, so there is
    /// nothing to refuse.
    ///
    /// Creating a type is not covered: a type with no relationships on it is quoted by nothing.
    /// Deleting one is refused outright while it is in use, so it cannot change a finding either.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid typeId,
        [FromBody] RelationshipTypeRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        var relationshipType = await FindTypeAsync(db, universeId, typeId, principal, cancellationToken);
        if (relationshipType is null)
        {
            return Results.NotFound();
        }

        return await canon.RecordAsync(
            universeId,
            token => UpdateCoreAsync(universeId, typeId, request, relationshipType, db, token),
            cancellationToken);
    }

    private static async Task<IResult> UpdateCoreAsync(
        Guid universeId,
        Guid typeId,
        RelationshipTypeRequest request,
        RelationshipType relationshipType,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (RelationshipValidation.ValidateType(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (!string.Equals(relationshipType.Name, name, StringComparison.Ordinal)
            && await db.RelationshipTypes.AnyAsync(
                other => other.UniverseId == universeId && other.Name == name && other.Id != typeId,
                cancellationToken))
        {
            return NameTaken();
        }

        relationshipType.Name = name;
        relationshipType.IsSymmetric = request.IsSymmetric;
        relationshipType.InverseName =
            request.IsSymmetric ? null : RelationshipValidation.Normalize(request.InverseName);
        relationshipType.Description = RelationshipValidation.Normalize(request.Description);
        relationshipType.DisplayOrder = request.DisplayOrder ?? relationshipType.DisplayOrder;
        relationshipType.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return NameTaken();
        }

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Ok(types.First(type => type.Id == typeId));
    }

    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid typeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var relationshipType = await FindTypeAsync(db, universeId, typeId, principal, cancellationToken);
        if (relationshipType is null)
        {
            return Results.NotFound();
        }

        // Deleting a type in use would erase the links it describes, so it is refused until
        // the author clears them deliberately.
        var inUse = await db.Relationships.CountAsync(
            relationship => relationship.RelationshipTypeId == typeId,
            cancellationToken);

        if (inUse > 0)
        {
            return Results.Problem(
                title: "Relationship type is in use",
                detail: inUse == 1
                    ? "1 relationship still uses this type. Delete it first."
                    : $"{inUse} relationships still use this type. Delete them first.",
                statusCode: StatusCodes.Status409Conflict);
        }

        db.RelationshipTypes.Remove(relationshipType);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    // ---------- Helpers ----------

    private static async Task<RelationshipType?> FindTypeAsync(
        LorexDbContext db,
        Guid universeId,
        Guid typeId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return null;
        }

        return await db.RelationshipTypes.FirstOrDefaultAsync(
            type => type.Id == typeId && type.UniverseId == universeId,
            cancellationToken);
    }

    private static async Task<List<RelationshipTypeResponse>> LoadTypesAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken) =>
        await db.RelationshipTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .OrderBy(type => type.DisplayOrder)
            .ThenBy(type => type.Name)
            .Select(type => new RelationshipTypeResponse(
                type.Id,
                type.Name,
                type.InverseName,
                type.IsSymmetric,
                type.Description,
                type.DisplayOrder,
                db.Relationships.Count(relationship => relationship.RelationshipTypeId == type.Id)))
            .ToListAsync(cancellationToken);

    private static IResult NameTaken() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["This universe already has a relationship type with that name."],
        });
}
