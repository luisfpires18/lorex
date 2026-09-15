import { apiFetch } from '../lib/api'
import type { FamilyTree } from './types'

/**
 * One entry's family, two generations each way, derived by the server from explicit parent links. A
 * bounded view model rather than the universe's relationships: nothing else is downloaded to draw it.
 */
export function getFamilyTree(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<FamilyTree>(`/api/universes/${universeId}/family-tree/${entityId}`, { signal })
}
