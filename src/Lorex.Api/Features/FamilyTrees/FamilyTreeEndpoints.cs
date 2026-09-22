using System.Linq.Expressions;
using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.FamilyTrees;

/// <summary>
/// <c>GET /api/universes/{universeId}/family-tree/{entityId}</c>: one entry's family, read-only (ADR 0035).
///
/// Ownership first, then the focal entry must be live in this universe. Another account's universe, another universe's entry,
/// a guessed id and an entry in the Trash are all the same 404, and nothing about them is read.
///
/// Bounded around the focal entry: at most five queries, whatever the family's size - the universe, the focal entry, the links
/// touching it, the links one step further out from its parents and children, and every entry named, with its type and
/// thumbnail. Only relationships whose type has a family meaning are read, only with both ends live, and never an article,
/// field, alias or date. Nothing is written: no relationship, finding, moment, revision or search row.
/// </summary>
public static class FamilyTreeEndpoints
{
    /// <summary>How far the tree reaches from the focal entry, up and down. Fixed: there is no depth parameter.</summary>
    public const int GenerationsEachWay = 2;

    public static IEndpointRouteBuilder MapFamilyTreeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/universes/{universeId:guid}/family-tree/{entityId:guid}", GetAsync)
            .WithTags("Family tree")
            .WithName("GetFamilyTree")
            .RequireAuthorization();

        return endpoints;
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

        if (!await db.Entities.AnyAsync(
                entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null,
                cancellationToken))
        {
            return Results.NotFound();
        }

        var near = await LiveLinks(db, universeId)
            .Where(relationship => relationship.SourceEntityId == entityId || relationship.TargetEntityId == entityId)
            .Select(ToRow)
            .ToListAsync(cancellationToken);

        var parents = near.Where(row => row.ChildEntityId == entityId).Select(row => row.ParentEntityId).Distinct().ToList();
        var children = near.Where(row => row.ParentEntityId == entityId).Select(row => row.ChildEntityId).Distinct().ToList();

        // One step further out, in one query: a parent's parents (grandparents), a parent's children (siblings) and a child's
        // children (grandchildren).
        List<LinkRow> far = parents.Count == 0 && children.Count == 0
            ? []
            : await LiveLinks(db, universeId)
                .Where(relationship => parents.Contains(relationship.TargetEntityId)
                    || parents.Contains(relationship.SourceEntityId)
                    || children.Contains(relationship.SourceEntityId))
                .Select(ToRow)
                .ToListAsync(cancellationToken);

        var rows = near.Concat(far).DistinctBy(row => row.RelationshipId).ToList();
        var links = rows
            .Select(row => new FamilyLink(
                row.RelationshipId, row.RelationshipTypeId, row.ParentEntityId, row.ChildEntityId, row.Semantic))
            .ToList();
        var family = FamilyTreeDerivation.Relatives(entityId, links);

        // Only links a relative's path walks are drawn or checked for a circle, so the tree says nothing about a link it does
        // not show.
        var used = new[] { family.Parents, family.Grandparents, family.Siblings, family.Children, family.Grandchildren }
            .SelectMany(relatives => relatives.SelectMany(relative => relative.Paths.SelectMany(path => path)))
            .ToHashSet();
        var shown = rows.Where(row => used.Contains(row.RelationshipId)).ToList();
        var loops = FamilyTreeDerivation.Loops(links.Where(link => used.Contains(link.RelationshipId)));

        var nodeIds = shown
            .SelectMany(row => new[] { row.ParentEntityId, row.ChildEntityId })
            .Append(entityId)
            .Distinct()
            .ToList();

        var nodes = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null && nodeIds.Contains(entity.Id))
            .Select(ToNode)
            .ToListAsync(cancellationToken);

        var names = nodes.ToDictionary(node => node.EntityId, node => node.Name);
        string NameOf(Guid id) => names.GetValueOrDefault(id, string.Empty);

        IReadOnlyList<FamilyTreeRelative> Named(IReadOnlyList<DerivedRelative> relatives) =>
        [
            .. relatives
                .OrderBy(relative => NameOf(relative.EntityId), StringComparer.Ordinal)
                .ThenBy(relative => relative.EntityId)
                .Select(relative => new FamilyTreeRelative(relative.EntityId, relative.Paths)),
        ];

        return Results.Ok(new FamilyTreeResponse(
            entityId,
            GenerationsEachWay,
            [.. nodes.OrderBy(node => node.Name, StringComparer.Ordinal).ThenBy(node => node.EntityId)],
            [
                .. shown
                    .OrderBy(row => NameOf(row.ParentEntityId), StringComparer.Ordinal)
                    .ThenBy(row => NameOf(row.ChildEntityId), StringComparer.Ordinal)
                    .ThenBy(row => row.RelationshipId)
                    .Select(row => new FamilyTreeLink(
                        row.RelationshipId,
                        row.ParentEntityId,
                        row.ChildEntityId,
                        row.Semantic,
                        row.CanonStatus,
                        row.RelationshipTypeId,
                        row.RelationshipTypeName)),
            ],
            Named(family.Parents),
            Named(family.Grandparents),
            Named(family.Siblings),
            Named(family.Children),
            Named(family.Grandchildren),
            [
                .. loops.Select(loop => new FamilyTreeLoop(
                    [.. loop.EntityIds.OrderBy(NameOf, StringComparer.Ordinal).ThenBy(id => id)],
                    loop.RelationshipIds)),
            ]));
    }

    /// <summary>
    /// Every live parent link of this universe: a relationship whose type has a family meaning, with both ends live. The type and
    /// both ends are held to the universe as well as the row, so nothing another universe holds can be walked into.
    /// </summary>
    private static IQueryable<LoreRelationship> LiveLinks(LorexDbContext db, Guid universeId) =>
        db.Relationships.AsNoTracking()
            .Where(relationship => relationship.UniverseId == universeId
                && relationship.RelationshipType!.UniverseId == universeId
                && relationship.RelationshipType.FamilySemantic != RelationshipFamilySemantic.None
                && relationship.SourceEntity!.UniverseId == universeId
                && relationship.SourceEntity.DeletedAt == null
                && relationship.TargetEntity!.UniverseId == universeId
                && relationship.TargetEntity.DeletedAt == null);

    /// <summary>The stored direction, read as the family meaning says: source parent, target child.</summary>
    private static readonly Expression<Func<LoreRelationship, LinkRow>> ToRow = relationship => new LinkRow(
        relationship.Id,
        relationship.SourceEntityId,
        relationship.TargetEntityId,
        relationship.RelationshipType!.FamilySemantic,
        relationship.CanonStatus,
        relationship.RelationshipTypeId,
        relationship.RelationshipType.Name);

    private static readonly Expression<Func<LoreEntity, FamilyTreeNode>> ToNode = entity => new FamilyTreeNode(
        entity.Id,
        entity.Name,
        entity.EntityTypeId,
        entity.EntityType!.Name,
        entity.EntityType.Icon,
        entity.EntityType.AccentColor,
        entity.CanonStatus,
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

    private sealed record LinkRow(
        Guid RelationshipId,
        Guid ParentEntityId,
        Guid ChildEntityId,
        RelationshipFamilySemantic Semantic,
        CanonStatus CanonStatus,
        Guid RelationshipTypeId,
        string RelationshipTypeName);
}
