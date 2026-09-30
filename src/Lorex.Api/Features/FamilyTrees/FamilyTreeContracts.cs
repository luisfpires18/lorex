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
///
/// <see cref="Connections"/> are the focal entry's authored non-structural family links - "uncle of", "married to" - read
/// from its side. They are listed, never walked: nothing in the positions above comes from one (ADR 0040).
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
    IReadOnlyList<FamilyTreeLoop> Loops,
    IReadOnlyList<FamilyTreeConnection> Connections);

/// <summary>
/// An entry in the tree: enough to recognise it, and its thumbnail's identity. Never a URL, an article or a field.
/// <paramref name="EntityTypeFamilyTreeEligible"/> is its type's capability, so the page can say when an entry recorded
/// in a family is of a type not enabled for it.
/// </summary>
public sealed record FamilyTreeNode(
    Guid EntityId,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus CanonStatus,
    EntityImageRef? Image,
    bool EntityTypeFamilyTreeEligible);

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

/// <summary>
/// One authored non-structural family link touching the focal entry, read from the focal entry's side the way a relation is
/// everywhere else: <paramref name="Label"/> is the kind's name when the focal entry is the source, its inverse when it is the
/// target, and the one name either way for a symmetric kind.
/// </summary>
public sealed record FamilyTreeConnection(
    Guid RelationshipId,
    Guid RelatedEntityId,
    RelationshipPerspective Perspective,
    string Label,
    CanonStatus CanonStatus,
    Guid RelationshipTypeId);
