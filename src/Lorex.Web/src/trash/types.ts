import type { CanonStatusValue } from '../lore/types'

/** Mirrors the backend enum. What a row in the Trash is. */
export const TrashKind = {
  Entry: 0,
  Story: 1,
  Chapter: 2,
  Scene: 3,
  PlotArc: 4,
  PlotBeat: 5,
  WorldRule: 6,
} as const

export type TrashKindValue = (typeof TrashKind)[keyof typeof TrashKind]

/** How each kind is named on screen. Words, never a colour alone. */
export const TRASH_KIND_LABELS: Record<TrashKindValue, string> = {
  [TrashKind.Entry]: 'Entry',
  [TrashKind.Story]: 'Story',
  [TrashKind.Chapter]: 'Chapter',
  [TrashKind.Scene]: 'Scene',
  [TrashKind.PlotArc]: 'Arc',
  [TrashKind.PlotBeat]: 'Beat',
  [TrashKind.WorldRule]: 'World rule',
}

/** Mirrors the backend enum. Why a row cannot be restored yet, if it cannot. */
export const TrashBlock = {
  None: 0,
  StoryInTrash: 1,
  ArcInTrash: 2,
} as const

export type TrashBlockValue = (typeof TrashBlock)[keyof typeof TrashBlock]

/**
 * One row in the Trash. Deliberately thin: it answers what was thrown away, where it was and when, and everything it
 * held is readable again the moment it comes back.
 *
 * The entry members are set for an entry only. `storyId` is set for everything from a story - a story's own id for a
 * story - and `storyTitle` for what sits inside one; `plotArcId` and `plotArcTitle` for a beat.
 */
export interface TrashItem {
  kind: TrashKindValue
  id: string
  name: string
  trashedAt: string
  entityTypeId: string | null
  entityTypeName: string | null
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  canonStatus: CanonStatusValue | null
  storyId: string | null
  storyTitle: string | null
  plotArcId: string | null
  plotArcTitle: string | null
  blockedBy: TrashBlockValue
}

export interface TrashPage {
  items: TrashItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}
