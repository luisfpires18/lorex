using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// Entity types and their field definitions. Every route proves universe ownership before
/// touching anything, and every nested lookup is re-scoped to that universe so an id from
/// another universe cannot be smuggled in through the path or the body.
/// </summary>
public static class EntityTypeEndpoints
{
    public static IEndpointRouteBuilder MapEntityTypeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entity-types")
            .WithTags("Entity types")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListEntityTypes");
        group.MapPost("/", CreateAsync).WithName("CreateEntityType");
        group.MapPut("/{typeId:guid}", UpdateAsync).WithName("UpdateEntityType");
        group.MapDelete("/{typeId:guid}", DeleteAsync).WithName("DeleteEntityType");

        group.MapPost("/{typeId:guid}/fields", AddFieldAsync).WithName("AddEntityField");
        group.MapPut("/{typeId:guid}/fields/{fieldId:guid}", UpdateFieldAsync).WithName("UpdateEntityField");
        group.MapDelete("/{typeId:guid}/fields/{fieldId:guid}", DeleteFieldAsync).WithName("DeleteEntityField");

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

        // A universe created before this feature existed, or one whose defaults were never
        // written, gets them on first read. Seeding only fills in missing names.
        await EntityTypeDefaults.EnsureAsync(db, universeId, cancellationToken);

        return Results.Ok(await LoadTypesAsync(db, universeId, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] EntityTypeRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        if (LoreValidation.ValidateEntityType(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (await db.EntityTypes.AnyAsync(
                type => type.UniverseId == universeId && type.Name == name,
                cancellationToken))
        {
            return NameTaken();
        }

        var now = DateTime.UtcNow;
        var order = request.DisplayOrder
            ?? await db.EntityTypes.Where(type => type.UniverseId == universeId)
                .Select(type => (int?)type.DisplayOrder).MaxAsync(cancellationToken) + 1
            ?? 1;

        var entityType = new EntityType
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Name = name,
            Description = LoreValidation.Normalize(request.Description),
            Icon = LoreValidation.Normalize(request.Icon),
            AccentColor = LoreValidation.NormalizeAccent(request.AccentColor),
            DisplayOrder = order,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.EntityTypes.Add(entityType);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return NameTaken();
        }

        var created = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Created(
            $"/api/universes/{universeId}/entity-types/{entityType.Id}",
            created.First(type => type.Id == entityType.Id));
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid typeId,
        [FromBody] EntityTypeRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entityType = await FindTypeAsync(db, universeId, typeId, principal, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        if (LoreValidation.ValidateEntityType(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (!string.Equals(entityType.Name, name, StringComparison.Ordinal)
            && await db.EntityTypes.AnyAsync(
                other => other.UniverseId == universeId && other.Name == name && other.Id != typeId,
                cancellationToken))
        {
            return NameTaken();
        }

        entityType.Name = name;
        entityType.Description = LoreValidation.Normalize(request.Description);
        entityType.Icon = LoreValidation.Normalize(request.Icon);
        entityType.AccentColor = LoreValidation.NormalizeAccent(request.AccentColor);
        entityType.DisplayOrder = request.DisplayOrder ?? entityType.DisplayOrder;
        entityType.UpdatedAt = DateTime.UtcNow;

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
        var entityType = await FindTypeAsync(db, universeId, typeId, principal, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        var inUse = await db.Entities.CountAsync(
            entity => entity.EntityTypeId == typeId,
            cancellationToken);

        if (inUse > 0)
        {
            return Results.Problem(
                title: "Type is in use",
                detail: $"{inUse} entities still use this type. Move or delete them first.",
                statusCode: StatusCodes.Status409Conflict);
        }

        db.EntityTypes.Remove(entityType);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> AddFieldAsync(
        Guid universeId,
        Guid typeId,
        [FromBody] FieldDefinitionRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entityType = await FindTypeAsync(db, universeId, typeId, principal, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        if (LoreValidation.ValidateField(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (await db.EntityFieldDefinitions.AnyAsync(
                field => field.EntityTypeId == typeId && field.Name == name,
                cancellationToken))
        {
            return FieldNameTaken();
        }

        var order = request.DisplayOrder
            ?? await db.EntityFieldDefinitions.Where(field => field.EntityTypeId == typeId)
                .Select(field => (int?)field.DisplayOrder).MaxAsync(cancellationToken) + 1
            ?? 1;

        var definition = new EntityFieldDefinition
        {
            Id = Guid.NewGuid(),
            EntityTypeId = typeId,
            Name = name,
            Kind = request.Kind,
            IsRequired = request.IsRequired,
            DisplayOrder = order,
            DefaultValue = LoreValidation.Normalize(request.DefaultValue),
        };

        AddOptions(definition, request.Options);

        db.EntityFieldDefinitions.Add(definition);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return FieldNameTaken();
        }

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Ok(types.First(type => type.Id == typeId));
    }

    private static async Task<IResult> UpdateFieldAsync(
        Guid universeId,
        Guid typeId,
        Guid fieldId,
        [FromBody] FieldDefinitionRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entityType = await FindTypeAsync(db, universeId, typeId, principal, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        var definition = await db.EntityFieldDefinitions
            .Include(field => field.Options)
            .FirstOrDefaultAsync(field => field.Id == fieldId && field.EntityTypeId == typeId, cancellationToken);

        if (definition is null)
        {
            return Results.NotFound();
        }

        if (LoreValidation.ValidateField(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var hasValues = await db.EntityFieldValues.AnyAsync(
            value => value.FieldDefinitionId == fieldId,
            cancellationToken);

        // Changing the kind would reinterpret every stored value, so it is refused while
        // any exist. Renaming and reordering stay safe.
        if (hasValues && definition.Kind != request.Kind)
        {
            return Results.Problem(
                title: "Field is in use",
                detail: "This field already holds values, so its type cannot change. "
                    + "Add a new field instead.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var name = request.Name!.Trim();

        if (!string.Equals(definition.Name, name, StringComparison.Ordinal)
            && await db.EntityFieldDefinitions.AnyAsync(
                other => other.EntityTypeId == typeId && other.Name == name && other.Id != fieldId,
                cancellationToken))
        {
            return FieldNameTaken();
        }

        definition.Name = name;
        definition.Kind = request.Kind;
        definition.IsRequired = request.IsRequired;
        definition.DisplayOrder = request.DisplayOrder ?? definition.DisplayOrder;
        definition.DefaultValue = LoreValidation.Normalize(request.DefaultValue);

        if (request.Options is not null)
        {
            var keep = new HashSet<string>(
                request.Options.Where(option => !string.IsNullOrWhiteSpace(option)).Select(option => option.Trim()),
                StringComparer.OrdinalIgnoreCase);

            // An option still chosen somewhere is kept, so removing it cannot quietly drop
            // an author's answer.
            foreach (var option in definition.Options.ToList())
            {
                if (keep.Contains(option.Value))
                {
                    continue;
                }

                var optionInUse = await db.EntityFieldValues.AnyAsync(
                    value => value.OptionId == option.Id,
                    cancellationToken);

                if (optionInUse)
                {
                    return Results.Problem(
                        title: "Option is in use",
                        detail: $"The option \"{option.Value}\" is chosen on at least one entity. "
                            + "Clear it there before removing the option.",
                        statusCode: StatusCodes.Status409Conflict);
                }

                definition.Options.Remove(option);
            }

            var existing = new HashSet<string>(
                definition.Options.Select(option => option.Value),
                StringComparer.OrdinalIgnoreCase);

            var order = 0;
            foreach (var value in keep)
            {
                order++;
                if (existing.Contains(value))
                {
                    continue;
                }

                definition.Options.Add(new EntityFieldOption
                {
                    Id = Guid.NewGuid(),
                    FieldDefinitionId = fieldId,
                    Value = value,
                    DisplayOrder = order,
                });
            }
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return FieldNameTaken();
        }

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Ok(types.First(type => type.Id == typeId));
    }

    private static async Task<IResult> DeleteFieldAsync(
        Guid universeId,
        Guid typeId,
        Guid fieldId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entityType = await FindTypeAsync(db, universeId, typeId, principal, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        var definition = await db.EntityFieldDefinitions
            .FirstOrDefaultAsync(field => field.Id == fieldId && field.EntityTypeId == typeId, cancellationToken);

        if (definition is null)
        {
            return Results.NotFound();
        }

        var valueCount = await db.EntityFieldValues.CountAsync(
            value => value.FieldDefinitionId == fieldId,
            cancellationToken);

        // Deleting a field that holds values would destroy authored content, so it is
        // refused until the author clears it deliberately.
        if (valueCount > 0)
        {
            return Results.Problem(
                title: "Field is in use",
                detail: $"{valueCount} entities have a value for this field. "
                    + "Clear those values before deleting it.",
                statusCode: StatusCodes.Status409Conflict);
        }

        db.EntityFieldDefinitions.Remove(definition);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    // ---------- Helpers ----------

    private static async Task<EntityType?> FindTypeAsync(
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

        return await db.EntityTypes
            .FirstOrDefaultAsync(type => type.Id == typeId && type.UniverseId == universeId, cancellationToken);
    }

    private static void AddOptions(EntityFieldDefinition definition, IReadOnlyList<string>? options)
    {
        if (options is null)
        {
            return;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var order = 0;

        foreach (var raw in options)
        {
            var value = raw?.Trim();
            if (string.IsNullOrWhiteSpace(value) || !seen.Add(value))
            {
                continue;
            }

            order++;
            definition.Options.Add(new EntityFieldOption
            {
                Id = Guid.NewGuid(),
                FieldDefinitionId = definition.Id,
                Value = value,
                DisplayOrder = order,
            });
        }
    }

    internal static async Task<List<EntityTypeResponse>> LoadTypesAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken) =>
        await db.EntityTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .OrderBy(type => type.DisplayOrder)
            .ThenBy(type => type.Name)
            .Select(type => new EntityTypeResponse(
                type.Id,
                type.Name,
                type.Description,
                type.Icon,
                type.AccentColor,
                type.DisplayOrder,
                db.Entities.Count(entity => entity.EntityTypeId == type.Id),
                type.Fields
                    .OrderBy(field => field.DisplayOrder)
                    .ThenBy(field => field.Name)
                    .Select(field => new FieldDefinitionResponse(
                        field.Id,
                        field.Name,
                        field.Kind,
                        field.IsRequired,
                        field.DisplayOrder,
                        field.DefaultValue,
                        field.Options
                            .OrderBy(option => option.DisplayOrder)
                            .Select(option => new FieldOptionResponse(option.Id, option.Value, option.DisplayOrder))
                            .ToList()))
                    .ToList()))
            .ToListAsync(cancellationToken);

    private static IResult NameTaken() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["This universe already has a type with that name."],
        });

    private static IResult FieldNameTaken() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["This type already has a field with that name."],
        });
}
