using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;

namespace Lorex.Api.Features.FamilyTrees;

/// <summary>
/// One entry's family, <see cref="GenerationsEachWay"/> generations up and down, derived from explicit parent links and nothing
/// else (ADR 0035).
///
/// Every relative lists the paths that make it one. A path is the ids of the parent links it walks, starting from the link that
/// touches the focal entry: a parent's path is its one link; a grandparent's is the parent's link, then the grandparent's; a
/// sibling's is the shared parent's link to the focal entry, then that parent's link to the sibling; a grandchild's is the
/// child's link, then the grandchild's. Several paths are several recorded ways of being that relative - two shared parents, or
/// one parent through a biological and an adoptive link - and nothing more is claimed from them: a sibling is never called
/// full or half.
///
/// An entry may be several relatives at once. The focal entry is never its own relative: a circle of links is named in
/// <see cref="Loops"/> instead.
/// </summary>
public sealed record FamilyTreeResponse(
    Guid FocalEntityId,
    int GenerationsEachWay,
    IReadOnlyList<FamilyTreeNode> Nodes,
    IReadOnlyList<FamilyTreeLink> Links,
    IReadOnlyList<FamilyTreeRelative> Parents,
    IReadOnlyList<FamilyTreeRelative> Grandparents,
    IReadOnlyList<FamilyTreeRelative> Siblings,
    IReadOnlyList<FamilyTreeRelative> Children,
    IReadOnlyList<FamilyTreeRelative> Grandchildren,
    IReadOnlyList<FamilyTreeLoop> Loops);

/// <summary>An entry in the tree: enough to recognise it, and its thumbnail's identity. Never a URL, an article or a field.</summary>
public sealed record FamilyTreeNode(
    Guid EntityId,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus CanonStatus,
    EntityImageRef? Image);

/// <summary>
/// One stored relationship read as a parent link: its type's family meaning says the source is the parent and the target the
/// child. The relationship's own Canon status travels with it, so a Draft link is never shown as settled family history.
/// </summary>
public sealed record FamilyTreeLink(
    Guid RelationshipId,
    Guid ParentEntityId,
    Guid ChildEntityId,
    RelationshipFamilySemantic Semantic,
    CanonStatus CanonStatus,
    Guid RelationshipTypeId,
    string RelationshipTypeName);

/// <summary>A relative, and every path of parent links that makes it one.</summary>
public sealed record FamilyTreeRelative(Guid EntityId, IReadOnlyList<IReadOnlyList<Guid>> Paths);

/// <summary>Parent links among those this tree read that go round in a circle, and the entries on it.</summary>
public sealed record FamilyTreeLoop(IReadOnlyList<Guid> EntityIds, IReadOnlyList<Guid> RelationshipIds);
