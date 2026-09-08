import { apiFetch } from '../lib/api'
import type { TimelineEntry, TimelineEntryInput, TimelineEntryPage, TimelineQuery } from './types'

/** Moments are tall, so a page holds fewer of them than the lore grid does. */
export const TIMELINE_PAGE_SIZE = 12

function base(universeId: string) {
  return `/api/universes/${universeId}/timeline`
}

export function listTimelineEntries(
  universeId: string,
  query: TimelineQuery,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(TIMELINE_PAGE_SIZE),
  })

  if (query.canonStatus !== null) params.set('canonStatus', String(query.canonStatus))
  if (query.entityId) params.set('entityId', query.entityId)

  return apiFetch<TimelineEntryPage>(`${base(universeId)}?${params}`, { signal })
}

export function getTimelineEntry(universeId: string, entryId: string, signal?: AbortSignal) {
  return apiFetch<TimelineEntry>(`${base(universeId)}/${entryId}`, { signal })
}

export function createTimelineEntry(universeId: string, input: TimelineEntryInput) {
  return apiFetch<TimelineEntry>(base(universeId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTimelineEntry(
  universeId: string,
  entryId: string,
  input: TimelineEntryInput,
) {
  return apiFetch<TimelineEntry>(`${base(universeId)}/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteTimelineEntry(universeId: string, entryId: string) {
  return apiFetch<void>(`${base(universeId)}/${entryId}`, { method: 'DELETE' })
}
