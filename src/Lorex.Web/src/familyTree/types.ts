import type { CanonStatusValue, EntityImageRef } from '../lore/types'
import type { FamilySemanticValue } from '../relationships/types'

/** One entry in the tree. Enough to recognise it; its article, fields and dates are not here. */
export interface FamilyTreeNode {
  entityId: string
  name: string
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  canonStatus: CanonStatusValue
  image: EntityImageRef | null
}

/**
 * One stored relationship read as a parent link: the kind's family meaning says the source is the parent
 * and the target the child. The link keeps its own Canon status, so a Draft link is never drawn as
 * settled family history.
 */
export interface FamilyTreeLink {
  relationshipId: string
  parentEntityId: string
  childEntityId: string
  semantic: FamilySemanticValue
  canonStatus: CanonStatusValue
  relationshipTypeId: string
  relationshipTypeName: string
}

/**
 * A relative, and every path of parent links that makes it one. A path starts at the link touching the
 * focal entry: a parent's path is its one link, a grandparent's is the parent's link then the
 * grandparent's, a sibling's is the shared parent's link to the focal entry then that parent's link to
 * the sibling, a grandchild's is the child's link then the grandchild's.
 */
export interface FamilyTreeRelative {
  entityId: string
  paths: string[][]
}

/** Parent links the tree read that go round in a circle, and the entries on it. */
export interface FamilyTreeLoop {
  entityIds: string[]
  relationshipIds: string[]
}

export interface FamilyTree {
  focalEntityId: string
  generationsEachWay: number
  nodes: FamilyTreeNode[]
  links: FamilyTreeLink[]
  parents: FamilyTreeRelative[]
  grandparents: FamilyTreeRelative[]
  siblings: FamilyTreeRelative[]
  children: FamilyTreeRelative[]
  grandchildren: FamilyTreeRelative[]
  loops: FamilyTreeLoop[]
}

/** Where a relative sits relative to the focal entry. The order is the order the tree is drawn in. */
export const FAMILY_POSITIONS = [
  'grandparents',
  'parents',
  'siblings',
  'children',
  'grandchildren',
] as const

export type FamilyPosition = (typeof FAMILY_POSITIONS)[number]

/** What each position is called on screen, for one relative and for the group. */
export const POSITION_LABELS: Record<FamilyPosition, { one: string; many: string }> = {
  grandparents: { one: 'Grandparent', many: 'Grandparents' },
  parents: { one: 'Parent', many: 'Parents' },
  siblings: { one: 'Sibling', many: 'Siblings' },
  children: { one: 'Child', many: 'Children' },
  grandchildren: { one: 'Grandchild', many: 'Grandchildren' },
}
