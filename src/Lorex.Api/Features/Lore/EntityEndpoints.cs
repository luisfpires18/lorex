using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// Entity CRUD inside one universe. Ownership is checked once per request against the
/// universe, and every id that arrives from the client (type, field, option, referenced
/// entity, tag) is re-resolved inside that same universe before it is used.
/// </summary>
public static class EntityEndpoints
{
    private const int DefaultPageSize = 12;
    private const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapEntityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entities")
            .WithTags("Entities")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListEntities");
        group.MapPost("/", CreateAsync).WithName("CreateEntity");
        group.MapGet("/{entityId:guid}", GetAsync).WithName("GetEntity");
        group.MapPut("/{entityId:guid}", UpdateAsync).WithName("UpdateEntity");
        group.MapDelete("/{entityId:guid}", DeleteAsync).WithName("DeleteEntity");

        endpoints.MapGet("/api/universes/{universeId:guid}/tags", ListTagsAsync)
            .WithTags("Entities")
            .WithName("ListTags")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? search = null,
        [FromQuery] Guid? entityTypeId = null,
        [FromQuery] CanonStatus? canonStatus = null,
        [FromQuery] string? tag = null,
        [FromQuery] bool includeArchived = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.Entities.AsNoTracking().Where(entity => entity.UniverseId == universeId);

        if (!includeArchived)
        {
            query = query.Where(entity => !entity.IsArchived);
        }

        if (entityTypeId is { } typeId)
        {
            query = query.Where(entity => entity.EntityTypeId == typeId);
        }

        if (canonStatus is { } status)
        {
            query = query.Where(entity => entity.CanonStatus == status);
        }

        if (!string.IsNullOrWhiteSpace(tag))
        {
            var slug = tag.Trim().ToLowerInvariant();
            query = query.Where(entity => entity.EntityTags.Any(link => link.Tag!.Slug == slug));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            // Name, aliases and summary. The rich article is not searched: SQLite would
            // need FTS over the Tiptap document, which is follow-up work, not a LIKE over
            // raw editor JSON.
            var pattern = $"%{LoreValidation.EscapeLike(search.Trim())}%";
            query = query.Where(entity =>
                EF.Functions.Like(entity.Name, pattern, "\\")
                || (entity.Summary != null && EF.Functions.Like(entity.Summary, pattern, "\\"))
                || entity.Aliases.Any(alias => EF.Functions.Like(alias.Value, pattern, "\\")));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var items = await query
            .OrderByDescending(entity => entity.UpdatedAt)
            .ThenBy(entity => entity.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(entity => new EntitySummary(
                entity.Id,
                entity.Name,
                entity.Summary,
                entity.CanonStatus,
                entity.IsArchived,
                entity.EntityTypeId,
                entity.EntityType!.Name,
                entity.EntityType.Icon,
                entity.EntityType.AccentColor,
                entity.Aliases.OrderBy(alias => alias.Value).Select(alias => alias.Value).ToList(),
                entity.EntityTags.Select(link => link.Tag!.Name).OrderBy(name => name).ToList(),
                entity.UpdatedAt))
            .ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new EntityPage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
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

        var detail = await LoadDetailAsync(db, universeId, entityId, cancellationToken);
        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    /// <summary>
    /// Creating an entity can introduce a High finding: a new Canon entity may declare a birth
    /// after its death, or become a Canon participant a moment is already outside the lifespan
    /// of. So the write runs under the promotion gate, which rolls it back if it does.
    /// Ownership is proved first, so an unowned universe never costs a rule sweep.
    /// </summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] EntityRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        return await gate.RunAsync(
            universeId,
            token => CreateCoreAsync(universeId, request, db, token),
            cancellationToken);
    }

    private static async Task<IResult> CreateCoreAsync(
        Guid universeId,
        EntityRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (LoreValidation.ValidateEntity(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        // The type must live in this universe. A type id from elsewhere is treated as
        // absent rather than reported, so it discloses nothing.
        var typeExists = await db.EntityTypes.AnyAsync(
            type => type.Id == request.EntityTypeId && type.UniverseId == universeId,
            cancellationToken);

        if (!typeExists)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["entityTypeId"] = ["Choose a type from this universe."],
            });
        }

        var now = DateTime.UtcNow;
        var entity = new LoreEntity
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            EntityTypeId = request.EntityTypeId,
            Name = request.Name!.Trim(),
            Summary = LoreValidation.Normalize(request.Summary),
            Content = LoreValidation.Normalize(request.Content),
            CanonStatus = request.CanonStatus,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Entities.Add(entity);

        if (await ApplyAliasesTagsAndFieldsAsync(db, universeId, entity, request, cancellationToken)
            is { } problem)
        {
            return problem;
        }

        await db.SaveChangesAsync(cancellationToken);

        var detail = await LoadDetailAsync(db, universeId, entity.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/entities/{entity.Id}", detail);
    }

    /// <summary>
    /// The structured-field edit path, and the one most likely to break a lifespan: this is
    /// where a birth or death year is written, and where an entity is promoted to Canon. Gated
    /// for both reasons.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid entityId,
        [FromBody] EntityRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        return await gate.RunAsync(
            universeId,
            token => UpdateCoreAsync(universeId, entityId, request, db, token),
            cancellationToken);
    }

    private static async Task<IResult> UpdateCoreAsync(
        Guid universeId,
        Guid entityId,
        EntityRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entity = await db.Entities.FirstOrDefaultAsync(
            candidate => candidate.Id == entityId && candidate.UniverseId == universeId,
            cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        if (LoreValidation.ValidateEntity(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var typeExists = await db.EntityTypes.AnyAsync(
            type => type.Id == request.EntityTypeId && type.UniverseId == universeId,
            cancellationToken);

        if (!typeExists)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["entityTypeId"] = ["Choose a type from this universe."],
            });
        }

        entity.EntityTypeId = request.EntityTypeId;
        entity.Name = request.Name!.Trim();
        entity.Summary = LoreValidation.Normalize(request.Summary);
        entity.Content = LoreValidation.Normalize(request.Content);
        entity.CanonStatus = request.CanonStatus;
        entity.UpdatedAt = DateTime.UtcNow;

        // The client always sends the complete set it wants stored, so the children are
        // replaced wholesale. The old rows are deleted straight against the database
        // first: EF Core does not promise to order deletes ahead of inserts within one
        // SaveChanges, and re-saving an unchanged alias or tag would then collide with the
        // row still in the table. The transaction keeps the two steps atomic - and joins the
        // promotion gate's rather than nesting inside it.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        await db.EntityAliases.Where(alias => alias.EntityId == entityId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.EntityTags.Where(link => link.EntityId == entityId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.EntityFieldValues.Where(value => value.EntityId == entityId)
            .ExecuteDeleteAsync(cancellationToken);

        if (await ApplyAliasesTagsAndFieldsAsync(db, universeId, entity, request, cancellationToken)
            is { } problem)
        {
            return problem;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var detail = await LoadDetailAsync(db, universeId, entity.Id, cancellationToken);
        return Results.Ok(detail);
    }

    /// <summary>
    /// Reconciled but not gated. Every rule reads facts an entity contributes - its declared
    /// years, its Canon participation in a moment, the relationships and references that rest
    /// on it - so deleting one can only take findings away, and there is nothing to refuse.
    /// Those findings still have to stop being reported: a conflict about lore that no longer
    /// exists is worse than no conflict at all.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        return await canon.RecordAsync(
            universeId,
            token => DeleteCoreAsync(universeId, entityId, db, token),
            cancellationToken);
    }

    private static async Task<IResult> DeleteCoreAsync(
        Guid universeId,
        Guid entityId,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entity = await db.Entities.FirstOrDefaultAsync(
            candidate => candidate.Id == entityId && candidate.UniverseId == universeId,
            cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        db.Entities.Remove(entity);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> ListTagsAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await LoreAccess.OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        var tags = await db.Tags.AsNoTracking()
            .Where(tag => tag.UniverseId == universeId)
            .OrderBy(tag => tag.Name)
            .Select(tag => new TagResponse(tag.Id, tag.Name, tag.EntityTags.Count))
            .ToListAsync(cancellationToken);

        return Results.Ok(tags);
    }

    // ---------- Writing the child collections ----------

    /// <summary>Returns a problem result when something in the request is not usable, else null.</summary>
    private static async Task<IResult?> ApplyAliasesTagsAndFieldsAsync(
        LorexDbContext db,
        Guid universeId,
        LoreEntity entity,
        EntityRequest request,
        CancellationToken cancellationToken)
    {
        AddAliases(db, entity, request.Aliases);

        if (await AddTagsAsync(db, universeId, entity, request.Tags, cancellationToken) is { } tagProblem)
        {
            return tagProblem;
        }

        return await AddFieldValuesAsync(db, universeId, entity, request, cancellationToken);
    }

    private static void AddAliases(LorexDbContext db, LoreEntity entity, IReadOnlyList<string>? aliases)
    {
        if (aliases is null)
        {
            return;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var raw in aliases)
        {
            var value = raw?.Trim();
            if (string.IsNullOrWhiteSpace(value) || !seen.Add(value))
            {
                continue;
            }

            db.EntityAliases.Add(new EntityAlias
            {
                Id = Guid.NewGuid(),
                EntityId = entity.Id,
                Value = value,
            });
        }
    }

    private static async Task<IResult?> AddTagsAsync(
        LorexDbContext db,
        Guid universeId,
        LoreEntity entity,
        IReadOnlyList<string>? tags,
        CancellationToken cancellationToken)
    {
        if (tags is null)
        {
            return null;
        }

        var wanted = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var raw in tags)
        {
            var name = raw?.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            wanted.TryAdd(name.ToLowerInvariant(), name);
        }

        if (wanted.Count == 0)
        {
            return null;
        }

        var slugs = wanted.Keys.ToList();

        // Tags live in the universe, so an existing one is reused and a new one is created
        // here. A tag id is never accepted from the client.
        var existing = await db.Tags
            .Where(tag => tag.UniverseId == universeId && slugs.Contains(tag.Slug))
            .ToListAsync(cancellationToken);

        var bySlug = existing.ToDictionary(tag => tag.Slug, StringComparer.Ordinal);

        foreach (var (slug, name) in wanted)
        {
            if (!bySlug.TryGetValue(slug, out var tag))
            {
                tag = new Tag
                {
                    Id = Guid.NewGuid(),
                    UniverseId = universeId,
                    Name = name,
                    Slug = slug,
                };
                db.Tags.Add(tag);
                bySlug[slug] = tag;
            }

            db.EntityTags.Add(new EntityTag { EntityId = entity.Id, TagId = tag.Id });
        }

        return null;
    }

    private static async Task<IResult?> AddFieldValuesAsync(
        LorexDbContext db,
        Guid universeId,
        LoreEntity entity,
        EntityRequest request,
        CancellationToken cancellationToken)
    {
        // Only fields belonging to the chosen type, in this universe, are addressable.
        var definitions = await db.EntityFieldDefinitions.AsNoTracking()
            .Include(field => field.Options)
            .Where(field => field.EntityTypeId == request.EntityTypeId
                && field.EntityType!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var byId = definitions.ToDictionary(field => field.Id);
        var supplied = new Dictionary<Guid, FieldValueInput>();

        foreach (var input in request.Fields ?? [])
        {
            // A field id that is not on this type is ignored rather than reported, so the
            // response cannot confirm that some other field exists.
            if (byId.ContainsKey(input.FieldDefinitionId))
            {
                supplied[input.FieldDefinitionId] = input;
            }
        }

        var errors = new Dictionary<string, string[]>();

        foreach (var definition in definitions)
        {
            supplied.TryGetValue(definition.Id, out var input);

            var rows = await BuildRowsAsync(db, universeId, entity, definition, input, errors, cancellationToken);

            if (definition.IsRequired && rows.Count == 0)
            {
                errors[definition.Id.ToString()] = [$"{definition.Name} is required."];
            }

            db.EntityFieldValues.AddRange(rows);
        }

        return errors.Count == 0 ? null : Results.ValidationProblem(errors);
    }

    private static async Task<List<EntityFieldValue>> BuildRowsAsync(
        LorexDbContext db,
        Guid universeId,
        LoreEntity entity,
        EntityFieldDefinition definition,
        FieldValueInput? input,
        Dictionary<string, string[]> errors,
        CancellationToken cancellationToken)
    {
        var rows = new List<EntityFieldValue>();

        if (input is null)
        {
            return rows;
        }

        EntityFieldValue New() => new()
        {
            Id = Guid.NewGuid(),
            EntityId = entity.Id,
            FieldDefinitionId = definition.Id,
        };

        switch (definition.Kind)
        {
            case EntityFieldKind.ShortText:
            case EntityFieldKind.LongText:
            {
                var text = LoreValidation.Normalize(input.Text);
                if (text is null)
                {
                    break;
                }

                if (text.Length > LoreLimits.TextValueMaxLength)
                {
                    errors[definition.Id.ToString()] = [$"{definition.Name} is too long."];
                    break;
                }

                var row = New();
                row.TextValue = text;
                rows.Add(row);
                break;
            }

            case EntityFieldKind.Number:
            {
                if (input.Number is not { } number)
                {
                    break;
                }

                if (double.IsNaN(number) || double.IsInfinity(number))
                {
                    errors[definition.Id.ToString()] = [$"{definition.Name} must be a number."];
                    break;
                }

                var row = New();
                row.NumberValue = number;
                rows.Add(row);
                break;
            }

            case EntityFieldKind.Boolean:
            {
                if (input.Boolean is not { } flag)
                {
                    break;
                }

                var row = New();
                row.BooleanValue = flag;
                rows.Add(row);
                break;
            }

            case EntityFieldKind.Date:
            {
                if (input.Date is not { } date)
                {
                    break;
                }

                var row = New();
                row.DateValue = date;
                rows.Add(row);
                break;
            }

            case EntityFieldKind.Select:
            case EntityFieldKind.MultiSelect:
            {
                var allowed = definition.Options.Select(option => option.Id).ToHashSet();
                var chosen = (input.OptionIds ?? []).Where(allowed.Contains).Distinct().ToList();

                if (definition.Kind == EntityFieldKind.Select && chosen.Count > 1)
                {
                    chosen = [chosen[0]];
                }

                foreach (var optionId in chosen)
                {
                    var row = New();
                    row.OptionId = optionId;
                    rows.Add(row);
                }

                break;
            }

            case EntityFieldKind.EntityReference:
            {
                if (input.ReferencedEntityId is not { } referenceId)
                {
                    break;
                }

                // The target must be in the same universe, so a reference cannot be used
                // to probe for entities elsewhere.
                var referenceExists = await db.Entities.AnyAsync(
                    candidate => candidate.Id == referenceId && candidate.UniverseId == universeId,
                    cancellationToken);

                if (!referenceExists)
                {
                    errors[definition.Id.ToString()] =
                        [$"{definition.Name} must point at an entity in this universe."];
                    break;
                }

                var row = New();
                row.ReferencedEntityId = referenceId;
                rows.Add(row);
                break;
            }

            default:
                break;
        }

        return rows;
    }

    // ---------- Reading ----------

    private static async Task<EntityDetail?> LoadDetailAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        var entity = await db.Entities.AsNoTracking()
            .Where(candidate => candidate.Id == entityId && candidate.UniverseId == universeId)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Name,
                candidate.Summary,
                candidate.Content,
                candidate.CanonStatus,
                candidate.IsArchived,
                candidate.EntityTypeId,
                TypeName = candidate.EntityType!.Name,
                TypeIcon = candidate.EntityType.Icon,
                TypeAccent = candidate.EntityType.AccentColor,
                Aliases = candidate.Aliases.OrderBy(alias => alias.Value)
                    .Select(alias => alias.Value).ToList(),
                Tags = candidate.EntityTags.Select(link => link.Tag!.Name)
                    .OrderBy(name => name).ToList(),
                Values = candidate.FieldValues.Select(value => new
                {
                    value.FieldDefinitionId,
                    FieldName = value.FieldDefinition!.Name,
                    value.FieldDefinition.Kind,
                    value.FieldDefinition.DisplayOrder,
                    value.TextValue,
                    value.NumberValue,
                    value.BooleanValue,
                    value.DateValue,
                    value.OptionId,
                    OptionValue = value.Option != null ? value.Option.Value : null,
                    value.ReferencedEntityId,
                    ReferencedName = value.ReferencedEntity != null ? value.ReferencedEntity.Name : null,
                }).ToList(),
                candidate.CreatedAt,
                candidate.UpdatedAt,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (entity is null)
        {
            return null;
        }

        // Multi-select stores one row per option, so rows are folded back into one value
        // per field for the client.
        var fields = entity.Values
            .GroupBy(value => new { value.FieldDefinitionId, value.FieldName, value.Kind, value.DisplayOrder })
            .OrderBy(group => group.Key.DisplayOrder)
            .ThenBy(group => group.Key.FieldName)
            .Select(group => new FieldValueResponse(
                group.Key.FieldDefinitionId,
                group.Key.FieldName,
                group.Key.Kind,
                group.Select(value => value.TextValue).FirstOrDefault(text => text != null),
                group.Select(value => value.NumberValue).FirstOrDefault(number => number != null),
                group.Select(value => value.BooleanValue).FirstOrDefault(flag => flag != null),
                group.Select(value => value.DateValue).FirstOrDefault(date => date != null),
                group.Where(value => value.OptionId != null).Select(value => value.OptionId!.Value).ToList(),
                group.Where(value => value.OptionValue != null).Select(value => value.OptionValue!).ToList(),
                group.Select(value => value.ReferencedEntityId).FirstOrDefault(id => id != null),
                group.Select(value => value.ReferencedName).FirstOrDefault(name => name != null)))
            .ToList();

        return new EntityDetail(
            entity.Id,
            entity.Name,
            entity.Summary,
            entity.Content,
            entity.CanonStatus,
            entity.IsArchived,
            entity.EntityTypeId,
            entity.TypeName,
            entity.TypeIcon,
            entity.TypeAccent,
            entity.Aliases,
            entity.Tags,
            fields,
            entity.CreatedAt,
            entity.UpdatedAt);
    }
}
