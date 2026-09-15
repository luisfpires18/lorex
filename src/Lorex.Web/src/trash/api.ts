import { apiFetch } from '../lib/api'
import { TrashKind, type TrashItem, type TrashPage } from './types'

/** The same page size the lore browser uses, so the two screens read at the same rhythm. */
export const TRASH_PAGE_SIZE = 12

/** The code on the 409 a restore gets when what the row belongs to - its story, or a beat's arc - is in the Trash too. */
export const TRASH_PARENT_IN_TRASH = 'trash_parent_in_trash'

function base(universeId: string) {
  return `/api/universes/${universeId}/trash`
}

export function listTrash(universeId: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(TRASH_PAGE_SIZE) })
  return apiFetch<TrashPage>(`${base(universeId)}?${params.toString()}`, { signal })
}

/** Each kind's own restore route, so what is restored is never a guess at what an id is. */
const ROUTES: Record<Exclude<TrashItem['kind'], typeof TrashKind.Entry>, string> = {
  [TrashKind.Story]: 'stories',
  [TrashKind.Chapter]: 'chapters',
  [TrashKind.Scene]: 'scenes',
  [TrashKind.PlotArc]: 'plot-arcs',
  [TrashKind.PlotBeat]: 'plot-beats',
  [TrashKind.WorldRule]: 'world-rules',
}

/**
 * Brings one row back.
 *
 * An entry's restore is gated on the API like any other lore write, so it can fail with the Canon promotion gate's 409 -
 * read it with `blockingFindingsOf` - and a refused restore is atomic. Story content passes no gate; it can be refused
 * with `TRASH_PARENT_IN_TRASH` while its story, or a beat's arc, is in the Trash too. A world rule waits for nothing.
 */
export function restoreFromTrash(universeId: string, item: TrashItem) {
  const path =
    item.kind === TrashKind.Entry
      ? `${base(universeId)}/${item.id}/restore`
      : `${base(universeId)}/${ROUTES[item.kind]}/${item.id}/restore`
  return apiFetch<unknown>(path, { method: 'POST' })
}

/** Where a restored row lives, so the Trash can offer the way to it. */
export function restoredPath(universeId: string, item: TrashItem) {
  const universe = `/app/universes/${universeId}`
  const story = `${universe}/stories/${item.storyId ?? ''}`

  switch (item.kind) {
    case TrashKind.Entry:
      return `${universe}/lore/${item.id}`
    case TrashKind.Story:
      return story
    case TrashKind.Chapter:
      return `${story}#chapter-${item.id}`
    case TrashKind.Scene:
      return `${story}#scene-${item.id}`
    case TrashKind.PlotArc:
      return `${story}/plot#arc-${item.id}`
    case TrashKind.PlotBeat:
      return `${story}/plot#beat-${item.id}`
    case TrashKind.WorldRule:
      return `${universe}/world-rules/${item.id}`
  }
}
