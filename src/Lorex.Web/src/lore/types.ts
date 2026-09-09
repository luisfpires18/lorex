/** Mirrors the backend enum. Ordered from least to most committed. */
export const CanonStatus = {
  Idea: 0,
  Draft: 1,
  Canon: 2,
} as const

export type CanonStatusValue = (typeof CanonStatus)[keyof typeof CanonStatus]

export const CANON_LABELS: Record<CanonStatusValue, string> = {
  [CanonStatus.Idea]: 'Idea',
  [CanonStatus.Draft]: 'Draft',
  [CanonStatus.Canon]: 'Canon',
}

export const CANON_ORDER: CanonStatusValue[] = [
  CanonStatus.Idea,
  CanonStatus.Draft,
  CanonStatus.Canon,
]

/** Mirrors the backend enum. */
export const FieldKind = {
  ShortText: 0,
  LongText: 1,
  Number: 2,
  Boolean: 3,
  Date: 4,
  Select: 5,
  MultiSelect: 6,
  EntityReference: 7,
} as const

export type FieldKindValue = (typeof FieldKind)[keyof typeof FieldKind]

export const FIELD_KIND_LABELS: Record<FieldKindValue, string> = {
  [FieldKind.ShortText]: 'Short text',
  [FieldKind.LongText]: 'Long text',
  [FieldKind.Number]: 'Number',
  [FieldKind.Boolean]: 'Yes or no',
  [FieldKind.Date]: 'Date',
  [FieldKind.Select]: 'Choose one',
  [FieldKind.MultiSelect]: 'Choose several',
  [FieldKind.EntityReference]: 'Link to an entity',
}

/**
 * Mirrors the backend enum. What a field *means*, for the few meanings Canon Integrity can
 * reason about. Null is the normal case: an ordinary field means nothing to Lorex, and
 * nothing is ever inferred from a field's name - ADR 0011.
 */
export const FieldSemantic = {
  BirthYear: 1,
  DeathYear: 2,
  Age: 3,
} as const

export type FieldSemanticValue = (typeof FieldSemantic)[keyof typeof FieldSemantic]

export const FIELD_SEMANTIC_LABELS: Record<FieldSemanticValue, string> = {
  [FieldSemantic.BirthYear]: 'Birth year',
  [FieldSemantic.DeathYear]: 'Death year',
  [FieldSemantic.Age]: 'Age',
}

/** The order the meanings are offered in: the two a rule reads today, then the one it does not. */
export const FIELD_SEMANTIC_ORDER: FieldSemanticValue[] = [
  FieldSemantic.BirthYear,
  FieldSemantic.DeathYear,
  FieldSemantic.Age,
]

/**
 * Which kinds may carry each meaning. Mirrors `LoreValidation.IsSemanticCompatible`, and
 * like it this is written per meaning rather than as one rule about Number, because the
 * next meaning added will not be a year. The API validates it again regardless.
 */
const SEMANTIC_KINDS: Record<FieldSemanticValue, FieldKindValue[]> = {
  [FieldSemantic.BirthYear]: [FieldKind.Number],
  [FieldSemantic.DeathYear]: [FieldKind.Number],
  [FieldSemantic.Age]: [FieldKind.Number],
}

/** The meanings a field of this kind may be given. Empty for every kind that may carry none. */
export function semanticsFor(kind: FieldKindValue): FieldSemanticValue[] {
  return FIELD_SEMANTIC_ORDER.filter((semantic) => SEMANTIC_KINDS[semantic].includes(kind))
}

export interface FieldOption {
  id: string
  value: string
  displayOrder: number
}

export interface FieldDefinition {
  id: string
  name: string
  kind: FieldKindValue
  isRequired: boolean
  displayOrder: number
  defaultValue: string | null
  options: FieldOption[]
  semantic: FieldSemanticValue | null
}

export interface EntityType {
  id: string
  name: string
  description: string | null
  icon: string | null
  accentColor: string | null
  displayOrder: number
  entityCount: number
  fields: FieldDefinition[]
}

export interface FieldValue {
  fieldDefinitionId: string
  name: string
  kind: FieldKindValue
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionIds: string[]
  optionValues: string[]
  referencedEntityId: string | null
  referencedEntityName: string | null
}

export interface EntitySummary {
  id: string
  name: string
  summary: string | null
  canonStatus: CanonStatusValue
  isArchived: boolean
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  aliases: string[]
  tags: string[]
  updatedAt: string
}

export interface EntityDetail extends EntitySummary {
  content: string | null
  fields: FieldValue[]
  createdAt: string
}

export interface EntityPage {
  items: EntitySummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface TagSummary {
  id: string
  name: string
  entityCount: number
}

/** What the client sends for one field. Only the member matching the kind is read. */
export interface FieldValueInput {
  fieldDefinitionId: string
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionIds: string[] | null
  referencedEntityId: string | null
}

export interface EntityInput {
  entityTypeId: string
  name: string
  summary: string | null
  content: string | null
  canonStatus: CanonStatusValue
  aliases: string[]
  tags: string[]
  fields: FieldValueInput[]
}

export interface EntityQuery {
  search: string
  entityTypeId: string | null
  canonStatus: CanonStatusValue | null
  tag: string | null
  page: number
}
