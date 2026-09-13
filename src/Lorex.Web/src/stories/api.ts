import { apiFetch } from '../lib/api'
import type {
  Chapter,
  ChapterInput,
  Scene,
  SceneInput,
  StoryDetail,
  StoryInput,
  StorySummary,
} from './types'

function base(universeId: string) {
  return `/api/universes/${universeId}/stories`
}

function scenes(universeId: string, storyId: string) {
  return `${base(universeId)}/${storyId}/scenes`
}

function chapters(universeId: string, storyId: string) {
  return `${base(universeId)}/${storyId}/chapters`
}

export function listStories(universeId: string, signal?: AbortSignal) {
  return apiFetch<StorySummary[]>(base(universeId), { signal })
}

export function getStory(universeId: string, storyId: string, signal?: AbortSignal) {
  return apiFetch<StoryDetail>(`${base(universeId)}/${storyId}`, { signal })
}

export function createStory(universeId: string, input: StoryInput) {
  return apiFetch<StoryDetail>(base(universeId), { method: 'POST', body: JSON.stringify(input) })
}

export function updateStory(universeId: string, storyId: string, input: StoryInput) {
  return apiFetch<StoryDetail>(`${base(universeId)}/${storyId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** Permanent: the story's chapters and scenes go with it. The lore they referenced stays. */
export function deleteStory(universeId: string, storyId: string) {
  return apiFetch<void>(`${base(universeId)}/${storyId}`, { method: 'DELETE' })
}

/** Appended after every chapter already in the story. */
export function createChapter(universeId: string, storyId: string, input: ChapterInput) {
  return apiFetch<Chapter>(chapters(universeId, storyId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateChapter(
  universeId: string,
  storyId: string,
  chapterId: string,
  input: ChapterInput,
) {
  return apiFetch<Chapter>(`${chapters(universeId, storyId)}/${chapterId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** Removes the chapter only: its scenes move, in order, to the end of Unchaptered. */
export function deleteChapter(universeId: string, storyId: string, chapterId: string) {
  return apiFetch<void>(`${chapters(universeId, storyId)}/${chapterId}`, { method: 'DELETE' })
}

/** The story's whole chapter order: every chapter id, each once, first first. */
export function reorderChapters(universeId: string, storyId: string, chapterIds: string[]) {
  return apiFetch<Chapter[]>(`${chapters(universeId, storyId)}/order`, {
    method: 'PUT',
    body: JSON.stringify({ chapterIds }),
  })
}

/** Appended after every scene already in its chapter, or in Unchaptered. */
export function createScene(universeId: string, storyId: string, input: SceneInput) {
  return apiFetch<Scene>(scenes(universeId, storyId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateScene(
  universeId: string,
  storyId: string,
  sceneId: string,
  input: SceneInput,
) {
  return apiFetch<Scene>(`${scenes(universeId, storyId)}/${sceneId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteScene(universeId: string, storyId: string, sceneId: string) {
  return apiFetch<void>(`${scenes(universeId, storyId)}/${sceneId}`, { method: 'DELETE' })
}

/**
 * One container's whole narrative order - the chapter `chapterId` names, or Unchaptered when it is
 * null: every scene id in it, each once, first told first. Answers with that container's scenes.
 */
export function reorderScenes(
  universeId: string,
  storyId: string,
  chapterId: string | null,
  sceneIds: string[],
) {
  return apiFetch<Scene[]>(`${scenes(universeId, storyId)}/order`, {
    method: 'PUT',
    body: JSON.stringify({ chapterId, sceneIds }),
  })
}

/**
 * Moves one scene into the chapter `chapterId` names, or Unchaptered when it is null - at `position`
 * among the scenes there, or last when it is null. The scene itself is unchanged. Answers with the
 * story's whole structure, because two containers moved.
 */
export function moveScene(
  universeId: string,
  storyId: string,
  sceneId: string,
  chapterId: string | null,
  position: number | null = null,
) {
  return apiFetch<StoryDetail>(`${scenes(universeId, storyId)}/${sceneId}/position`, {
    method: 'PUT',
    body: JSON.stringify({ chapterId, position }),
  })
}
