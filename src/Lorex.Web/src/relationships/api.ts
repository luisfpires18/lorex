import { apiFetch } from '../lib/api'
import type {
  RelationshipDetail,
  RelationshipInput,
  RelationshipType,
  RelationshipTypeInput,
  RelationshipView,
} from './types'

function base(universeId: string) {
  return `/api/universes/${universeId}`
}

// ---------- Relationship types ----------

export function listRelationshipTypes(universeId: string, signal?: AbortSignal) {
  return apiFetch<RelationshipType[]>(`${base(universeId)}/relationship-types`, { signal })
}

export function createRelationshipType(universeId: string, input: RelationshipTypeInput) {
  return apiFetch<RelationshipType>(`${base(universeId)}/relationship-types`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRelationshipType(
  universeId: string,
  typeId: string,
  input: RelationshipTypeInput,
) {
  return apiFetch<RelationshipType>(`${base(universeId)}/relationship-types/${typeId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteRelationshipType(universeId: string, typeId: string) {
  return apiFetch<void>(`${base(universeId)}/relationship-types/${typeId}`, { method: 'DELETE' })
}

// ---------- Relationships ----------

/** Every link touching one entity, already worded from that entity's side. */
export function listEntityRelationships(
  universeId: string,
  entityId: string,
  signal?: AbortSignal,
) {
  return apiFetch<RelationshipView[]>(`${base(universeId)}/entities/${entityId}/relationships`, {
    signal,
  })
}

export function createRelationship(universeId: string, input: RelationshipInput) {
  return apiFetch<RelationshipDetail>(`${base(universeId)}/relationships`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRelationship(
  universeId: string,
  relationshipId: string,
  input: RelationshipInput,
) {
  return apiFetch<RelationshipDetail>(`${base(universeId)}/relationships/${relationshipId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteRelationship(universeId: string, relationshipId: string) {
  return apiFetch<void>(`${base(universeId)}/relationships/${relationshipId}`, {
    method: 'DELETE',
  })
}
