import type { CanonStatusValue } from '../lore/types'

/** Mirrors the backend enum. Which reading of a link a row is being shown under. */
export const Perspective = {
  /** The entity being viewed is the source, so the type's forward name applies. */
  Forward: 0,
  /** The entity being viewed is the target, so the type's inverse name applies. */
  Inverse: 1,
} as const

export type PerspectiveValue = (typeof Perspective)[keyof typeof Perspective]

export interface RelationshipType {
  id: string
  name: string
  inverseName: string | null
  isSymmetric: boolean
  description: string | null
  displayOrder: number
  relationshipCount: number
}

export interface RelationshipTypeInput {
  name: string
  inverseName: string | null
  isSymmetric: boolean
  description: string | null
  displayOrder: number | null
}

/** The stored link as it is, used when creating, editing and reading one row. */
export interface RelationshipDetail {
  id: string
  relationshipTypeId: string
  relationshipTypeName: string
  relationshipTypeInverseName: string | null
  isSymmetric: boolean
  sourceEntityId: string
  sourceEntityName: string
  targetEntityId: string
  targetEntityName: string
  canonStatus: CanonStatusValue
  startDate: string | null
  endDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

/**
 * One link seen from one entity. `label` is already resolved for that entity, so the
 * client never works out the reverse wording itself.
 */
export interface RelationshipView {
  id: string
  relationshipTypeId: string
  relationshipTypeName: string
  relationshipTypeInverseName: string | null
  isSymmetric: boolean
  perspective: PerspectiveValue
  label: string
  fromEntityId: string
  relatedEntityId: string
  relatedEntityName: string
  relatedEntityTypeId: string
  relatedEntityTypeName: string
  relatedEntityTypeIcon: string | null
  relatedEntityTypeAccentColor: string | null
  relatedEntityCanonStatus: CanonStatusValue
  sourceEntityId: string
  targetEntityId: string
  canonStatus: CanonStatusValue
  startDate: string | null
  endDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface RelationshipInput {
  relationshipTypeId: string
  sourceEntityId: string
  targetEntityId: string
  canonStatus: CanonStatusValue
  startDate: string | null
  endDate: string | null
  notes: string | null
}

/**
 * One choice in the relationship-type picker. A directional type offers both of its
 * readings, so an author can say either "rules" or "ruled by" from wherever they are
 * standing, and neither reading mentions which row is stored first.
 */
export interface LabelChoice {
  key: string
  typeId: string
  /** True when the entity being edited is the target rather than the source. */
  useInverse: boolean
  /** The wording as it reads from the entity being edited. */
  label: string
}

/** Both readings of every type, in the order the types were given. */
export function labelChoices(types: RelationshipType[]): LabelChoice[] {
  const choices: LabelChoice[] = []

  for (const type of types) {
    choices.push({
      key: `${type.id}:forward`,
      typeId: type.id,
      useInverse: false,
      label: type.name,
    })

    if (!type.isSymmetric && type.inverseName) {
      choices.push({
        key: `${type.id}:inverse`,
        typeId: type.id,
        useInverse: true,
        label: type.inverseName,
      })
    }
  }

  return choices
}
