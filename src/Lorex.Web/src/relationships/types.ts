import type { CanonStatusValue } from '../lore/types'

/** Mirrors the backend enum. Which reading of a link a row is being shown under. */
export const Perspective = {
  /** The entity being viewed is the source, so the type's forward name applies. */
  Forward: 0,
  /** The entity being viewed is the target, so the type's inverse name applies. */
  Inverse: 1,
} as const

export type PerspectiveValue = (typeof Perspective)[keyof typeof Perspective]

/** Mirrors `RelationshipAgeOrder`. Which end of a link must have been born first. */
export const AgeOrder = {
  None: 0,
  SourceOlder: 1,
  SourceYounger: 2,
} as const

export type AgeOrderValue = (typeof AgeOrder)[keyof typeof AgeOrder]

/**
 * Mirrors `RelationshipFamilySemantic`. What every link of a kind means to a family tree, on the stored
 * direction: the source is the parent, the target is the child. Configured by the author, never inferred
 * from the kind's name.
 */
export const FamilySemantic = {
  None: 0,
  BiologicalParent: 1,
  AdoptiveParent: 2,
} as const

export type FamilySemanticValue = (typeof FamilySemantic)[keyof typeof FamilySemantic]

/** What each meaning is called on screen. No enum name is ever shown. */
export const FAMILY_SEMANTIC_LABELS: Record<FamilySemanticValue, string> = {
  [FamilySemantic.None]: 'Not a family connection',
  [FamilySemantic.BiologicalParent]: 'Source is the biological parent',
  [FamilySemantic.AdoptiveParent]: 'Source is the adoptive parent',
}

/** The one word a family tree uses for a link of each meaning. */
export const FAMILY_SEMANTIC_WORDS: Record<FamilySemanticValue, string> = {
  [FamilySemantic.None]: '',
  [FamilySemantic.BiologicalParent]: 'biological',
  [FamilySemantic.AdoptiveParent]: 'adoptive',
}

/**
 * Rules Canon Integrity checks every Canon link of a type against, on the stored direction:
 * source, then target. Configured by the author and never inferred from the type's name.
 */
export interface RelationshipCanonConstraints {
  ageOrder: AgeOrderValue
  minAgeDifferenceYears: number | null
  maxAgeDifferenceYears: number | null
}

export interface RelationshipType {
  id: string
  name: string
  inverseName: string | null
  isSymmetric: boolean
  description: string | null
  displayOrder: number
  relationshipCount: number
  canonConstraints: RelationshipCanonConstraints
  familySemantic: FamilySemanticValue
}

export interface RelationshipTypeInput {
  name: string
  inverseName: string | null
  isSymmetric: boolean
  description: string | null
  displayOrder: number | null
  /** Null on an update leaves the stored constraints as they are. */
  canonConstraints: RelationshipCanonConstraints | null
  /** Null on an update leaves the stored family meaning as it is; `None` clears it. */
  familySemantic: FamilySemanticValue | null
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
