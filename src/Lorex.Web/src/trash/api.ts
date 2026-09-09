import { apiFetch } from '../lib/api'
import type { EntityDetail } from '../lore/types'
import type { TrashPage } from './types'

/** The same page size the lore browser uses, so the two screens read at the same rhythm. */
export const TRASH_PAGE_SIZE = 12

function base(universeId: string) {
  return `/api/universes/${universeId}/trash`
}

export function listTrash(universeId: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(TRASH_PAGE_SIZE) })
  return apiFetch<TrashPage>(`${base(universeId)}?${params.toString()}`, { signal })
}

/**
 * Brings one entry back. Gated on the API like any other write, so this can fail with the
 * Canon promotion gate's 409 - read it with `blockingFindingsOf`. A refused restore is
 * atomic: the entry is still in the Trash afterwards and nothing was partly recovered.
 */
export function restoreFromTrash(universeId: string, entityId: string) {
  return apiFetch<EntityDetail>(`${base(universeId)}/${entityId}/restore`, { method: 'POST' })
}
