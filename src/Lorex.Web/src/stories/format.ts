import { formatChronologyPoint, isPlaced } from '../chronology/format'
import type { Chronology, ChronologyValue } from '../chronology/types'

/**
 * Where a scene happens in the world, written by the shared chronology formatter - or null when the
 * scene is not placed in time. `placed` is false for a plain year written before the universe named
 * its eras, which is shown apart rather than guessed into one.
 *
 * Display only. Scenes are never sorted by this: a story is read in the order its author set.
 */
export function sceneWhen(chronology: Chronology, value: ChronologyValue | null) {
  if (!value || value.year === null) return null

  return {
    text: formatChronologyPoint(chronology, {
      year: value.year,
      month: value.month,
      day: value.day,
      eraId: value.eraId,
    }),
    placed: isPlaced(chronology, value.eraId),
  }
}

export function sceneCountLabel(count: number) {
  return count === 1 ? '1 scene' : `${count} scenes`
}
