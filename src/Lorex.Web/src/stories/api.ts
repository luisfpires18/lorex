import { apiFetch } from '../lib/api'
import type { Scene, SceneInput, StoryDetail, StoryInput, StorySummary } from './types'

function base(universeId: string) {
  return `/api/universes/${universeId}/stories`
}

function scenes(universeId: string, storyId: string) {
  return `${base(universeId)}/${storyId}/scenes`
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

/** Permanent: the story's scenes go with it. The lore they referenced stays. */
export function deleteStory(universeId: string, storyId: string) {
  return apiFetch<void>(`${base(universeId)}/${storyId}`, { method: 'DELETE' })
}

/** Appended after every scene already in the story. */
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

/** The story's whole narrative order: every scene id, each once, first told first. */
export function reorderScenes(universeId: string, storyId: string, sceneIds: string[]) {
  return apiFetch<Scene[]>(`${scenes(universeId, storyId)}/order`, {
    method: 'PUT',
    body: JSON.stringify({ sceneIds }),
  })
}
