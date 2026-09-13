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
 * An optional grouping of a story's scenes: structure, not content. Its number - "Chapter 3" - is its
 * position, worked out on screen and never stored, so `title` is only what the author wrote.
 */
export interface Chapter {
  id: string
  storyId: string
  sortOrder: number
  title: string
  summary: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

/**
 * One scene. `chapterId` is its container - null for Unchaptered - and `sortOrder` its place in that
 * container's telling; `chronology` is where it happens in the world. Order and chronology are
 * independent, and the client never orders scenes by chronology.
 */
export interface Scene {
  id: string
  storyId: string
  chapterId: string | null
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

/**
 * One story with its whole structure, resolved in one request: chapters in order, and every scene -
 * Unchaptered first, then chapter by chapter, each container in its own narrative order.
 */
export interface StoryDetail {
  id: string
  title: string
  premise: string | null
  status: StoryStatusValue
  chapters: Chapter[]
  scenes: Scene[]
  createdAt: string
  updatedAt: string
}

export interface StoryInput {
  title: string
  premise: string | null
  status: StoryStatusValue
}

/**
 * Everything a client may set on a scene. The order is not here: a scene is appended to its container,
 * and only the order and position routes move it inside one. `chapterId` null is Unchaptered; a different
 * chapter than the scene is in moves it to the end of that one.
 */
export interface SceneInput {
  title: string
  summary: string | null
  notes: string | null
  povEntityId: string | null
  chronology: ChronologyValue | null
  entityIds: string[]
  chapterId: string | null
}

/** Everything a client may set on a chapter. No number and no order: both are its position. */
export interface ChapterInput {
  title: string
  summary: string | null
  notes: string | null
}
