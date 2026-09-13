import type { ChronologyValue } from '../chronology/types'
import type { EntityImageRef } from '../lore/types'

/** Mirrors the backend enum. How far along the telling is - never whether any of it is true. */
export const StoryStatus = {
  Planning: 0,
  Drafting: 1,
  Complete: 2,
} as const

export type StoryStatusValue = (typeof StoryStatus)[keyof typeof StoryStatus]

export const STORY_STATUS_LABELS: Record<StoryStatusValue, string> = {
  [StoryStatus.Planning]: 'Planning',
  [StoryStatus.Drafting]: 'Drafting',
  [StoryStatus.Complete]: 'Complete',
}

export const STORY_STATUS_ORDER: StoryStatusValue[] = [
  StoryStatus.Planning,
  StoryStatus.Drafting,
  StoryStatus.Complete,
]

export interface StorySummary {
  id: string
  title: string
  premise: string | null
  status: StoryStatusValue
  sceneCount: number
  createdAt: string
  updatedAt: string
}

/**
 * A lore entry as a scene shows it, read from the entry on every request. The scene stores only the
 * id, so nothing here is a copy that could fall out of step with the lore.
 */
export interface SceneLoreReference {
  entityId: string
  name: string
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null

  /**
   * The entry is in the Trash. Still reported, because the form sends the scene's references back
   * whole on every save and dropping one here would delete it. Shown as unavailable and not linked.
   */
  isTrashed: boolean
  image: EntityImageRef | null
}

/**
 * One scene. `sortOrder` is its place in the telling; `chronology` is where it happens in the world.
 * The two are independent, and the client never orders scenes by chronology.
 */
export interface Scene {
  id: string
  storyId: string
  sortOrder: number
  title: string
  summary: string | null
  notes: string | null
  pov: SceneLoreReference | null
  chronology: ChronologyValue | null
  entities: SceneLoreReference[]
  createdAt: string
  updatedAt: string
}

/** One story with every scene in narrative order, resolved in one request. */
export interface StoryDetail {
  id: string
  title: string
  premise: string | null
  status: StoryStatusValue
  scenes: Scene[]
  createdAt: string
  updatedAt: string
}

export interface StoryInput {
  title: string
  premise: string | null
  status: StoryStatusValue
}

/** Everything a client may set on a scene. The order is not here: only the order route moves a scene. */
export interface SceneInput {
  title: string
  summary: string | null
  notes: string | null
  povEntityId: string | null
  chronology: ChronologyValue | null
  entityIds: string[]
}
