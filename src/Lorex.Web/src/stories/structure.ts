import type { Chapter, Scene } from './types'

/**
 * One container's scenes in the order they are told: the chapter `chapterId` names, or Unchaptered when
 * it is null. A scene's `sortOrder` is its place inside its container, never across the story.
 */
export function scenesIn(scenes: Scene[], chapterId: string | null) {
  return scenes
    .filter((scene) => scene.chapterId === chapterId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Every scene in the order the story reads: Unchaptered first, then chapter by chapter in the chapters'
 * order, each container in its own narrative order. The order the API sends, restored after a change
 * made on screen before the save lands.
 */
export function readingOrder(chapters: Chapter[], scenes: Scene[]) {
  const rank = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  const place = (scene: Scene) =>
    scene.chapterId === null ? -1 : (rank.get(scene.chapterId) ?? chapters.length)

  return [...scenes].sort((a, b) => place(a) - place(b) || a.sortOrder - b.sortOrder)
}
