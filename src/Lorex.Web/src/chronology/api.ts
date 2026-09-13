import { apiFetch } from '../lib/api'
import type { Chronology, ChronologyInput } from './types'

function base(universeId: string) {
  return `/api/universes/${universeId}/chronology`
}

export function getChronology(universeId: string, signal?: AbortSignal) {
  return apiFetch<Chronology>(base(universeId), { signal })
}

/** Replaces the reckoning whole. Gated: a change that contradicts settled canon is refused. */
export function saveChronology(universeId: string, input: ChronologyInput) {
  return apiFetch<Chronology>(base(universeId), { method: 'PUT', body: JSON.stringify(input) })
}
