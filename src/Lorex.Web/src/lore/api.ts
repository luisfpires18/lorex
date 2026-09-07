import { apiFetch } from '../lib/api'
import type {
  EntityDetail,
  EntityInput,
  EntityPage,
  EntityQuery,
  EntityType,
  FieldKindValue,
  TagSummary,
} from './types'

export const ENTITY_PAGE_SIZE = 12

function base(universeId: string) {
  return `/api/universes/${universeId}`
}

// ---------- Entity types ----------

export function listEntityTypes(universeId: string, signal?: AbortSignal) {
  return apiFetch<EntityType[]>(`${base(universeId)}/entity-types`, { signal })
}

export interface EntityTypeInput {
  name: string
  description: string | null
  icon: string | null
  accentColor: string | null
  displayOrder: number | null
}

export function createEntityType(universeId: string, input: EntityTypeInput) {
  return apiFetch<EntityType>(`${base(universeId)}/entity-types`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateEntityType(universeId: string, typeId: string, input: EntityTypeInput) {
  return apiFetch<EntityType>(`${base(universeId)}/entity-types/${typeId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteEntityType(universeId: string, typeId: string) {
  return apiFetch<void>(`${base(universeId)}/entity-types/${typeId}`, { method: 'DELETE' })
}

export interface FieldInput {
  name: string
  kind: FieldKindValue
  isRequired: boolean
  displayOrder: number | null
  defaultValue: string | null
  options: string[] | null
}

export function addField(universeId: string, typeId: string, input: FieldInput) {
  return apiFetch<EntityType>(`${base(universeId)}/entity-types/${typeId}/fields`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteField(universeId: string, typeId: string, fieldId: string) {
  return apiFetch<void>(`${base(universeId)}/entity-types/${typeId}/fields/${fieldId}`, {
    method: 'DELETE',
  })
}

// ---------- Entities ----------

export function listEntities(universeId: string, query: EntityQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(ENTITY_PAGE_SIZE),
  })
  if (query.search.trim()) params.set('search', query.search.trim())
  if (query.entityTypeId) params.set('entityTypeId', query.entityTypeId)
  if (query.canonStatus !== null) params.set('canonStatus', String(query.canonStatus))
  if (query.tag) params.set('tag', query.tag)

  return apiFetch<EntityPage>(`${base(universeId)}/entities?${params.toString()}`, { signal })
}

export function getEntity(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<EntityDetail>(`${base(universeId)}/entities/${entityId}`, { signal })
}

export function createEntity(universeId: string, input: EntityInput) {
  return apiFetch<EntityDetail>(`${base(universeId)}/entities`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateEntity(universeId: string, entityId: string, input: EntityInput) {
  return apiFetch<EntityDetail>(`${base(universeId)}/entities/${entityId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteEntity(universeId: string, entityId: string) {
  return apiFetch<void>(`${base(universeId)}/entities/${entityId}`, { method: 'DELETE' })
}

export function listTags(universeId: string, signal?: AbortSignal) {
  return apiFetch<TagSummary[]>(`${base(universeId)}/tags`, { signal })
}
