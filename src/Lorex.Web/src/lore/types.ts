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
