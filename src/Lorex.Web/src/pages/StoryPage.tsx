import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash } from 'lucide-react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { SceneCard } from '../components/SceneCard'
import { SceneForm } from '../components/SceneForm'
import { StoryForm } from '../components/StoryForm'
import { ApiError } from '../lib/api'
import { deleteScene, deleteStory, getStory, reorderScenes } from '../stories/api'
import { sceneCountLabel } from '../stories/format'
import { STORY_STATUS_LABELS, type Scene, type StoryDetail } from '../stories/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; story: StoryDetail }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

type SceneFormState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; scene: Scene }

/**
 * One story and its scenes, in the order the author tells them.
 *
 * That order is the only order here. Each scene may say where it happens in the world, and that is
 * shown on the scene, but nothing on this page sorts, groups or warns by it: a story that opens on
 * the aftermath and flashes back to a childhood is exactly as valid as one told straight through.
 */
export default function StoryPage() {
  const { universe, chronology } = useOutletContext<WorkspaceContext>()
  const { storyId } = useParams<{ storyId: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [sceneForm, setSceneForm] = useState<SceneFormState>({ mode: 'closed' })
  const [isEditingStory, setIsEditingStory] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [reloads, setReloads] = useState(0)

  const isMoving = useRef(false)
  const moveButtons = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocus = useRef<{ sceneId: string; direction: 'up' | 'down' } | null>(null)

  useEffect(() => {
    if (!storyId) return
    const controller = new AbortController()

    getStory(universe.id, storyId, controller.signal)
      .then((story) => setState({ kind: 'ready', story }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : {
                kind: 'error',
                message: error instanceof Error ? error.message : 'Could not open this story.',
              },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, storyId, reloads])

  // A scene that has just moved keeps the focus on its move control, wherever the list put it. When
  // it reached an end the control that moved it is disabled, so the focus goes to the other one.
  useEffect(() => {
    const request = pendingFocus.current
    if (!request || state.kind !== 'ready') return
    pendingFocus.current = null

    const same = moveButtons.current.get(`${request.sceneId}:${request.direction}`)
    const other = moveButtons.current.get(
      `${request.sceneId}:${request.direction === 'up' ? 'down' : 'up'}`,
    )
    ;(same && !same.disabled ? same : other)?.focus()
  }, [state])

  const moveButtonRef = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) moveButtons.current.set(key, element)
    else moveButtons.current.delete(key)
  }, [])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  function setScenes(scenes: Scene[]) {
    setState((current) =>
      current.kind === 'ready' ? { kind: 'ready', story: { ...current.story, scenes } } : current,
    )
  }

  if (state.kind === 'loading') {
    return (
      <p className="notice" role="status">
        Opening the story…
      </p>
    )
  }

  if (state.kind === 'missing') {
    return (
      <div className="empty" data-testid="story-missing">
        <p className="empty__line">That story is not here.</p>
        <p className="empty__hint">
          It may have been deleted.{' '}
          <Link to={`/app/universes/${universe.id}/stories`}>Back to the stories</Link>
        </p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <p className="notice notice--error" role="alert">
        {state.message}
      </p>
    )
  }

  const { story } = state
  const scenes = story.scenes

  /** Moves one scene one place, at once on screen, and puts it back if the save is refused. */
  async function move(scene: Scene, by: -1 | 1) {
    if (isMoving.current) return

    const from = scenes.findIndex((candidate) => candidate.id === scene.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= scenes.length) return

    const next = [...scenes]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = { sceneId: scene.id, direction: by < 0 ? 'up' : 'down' }
    setScenes(next.map((candidate, index) => ({ ...candidate, sortOrder: index })))

    try {
      setScenes(
        await reorderScenes(
          universe.id,
          story.id,
          next.map((candidate) => candidate.id),
        ),
      )
      setAnnouncement(`“${scene.title}” is now scene ${to + 1} of ${next.length}.`)
    } catch (error: unknown) {
      setScenes(scenes)
      setMessage(error instanceof ApiError ? error.message : 'The new order could not be saved.')
    } finally {
      isMoving.current = false
    }
  }

  async function removeScene(scene: Scene) {
    if (!window.confirm(`Delete the scene “${scene.title}”? The lore it links stays.`)) return

    setMessage(null)
    try {
      await deleteScene(universe.id, story.id, scene.id)
      setAnnouncement(`Deleted “${scene.title}”.`)
      reload()
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'That scene could not be deleted.')
    }
  }

  async function removeStory() {
    const count = sceneCountLabel(scenes.length)
    if (
      !window.confirm(
        `Delete “${story.title}” and its ${count}? This cannot be undone. The lore it draws on stays.`,
      )
    ) {
      return
    }

    setMessage(null)
    try {
      await deleteStory(universe.id, story.id)
      navigate(`/app/universes/${universe.id}/stories`)
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'That story could not be deleted.')
    }
  }

  return (
    <article className="story" data-testid="story-page">
      <nav className="entry__crumbs" aria-label="Breadcrumb">
        <Link to={`/app/universes/${universe.id}/stories`}>Stories</Link>
      </nav>

      <header className="story__head">
        <div className="story__heading">
          <h2 className="chron__title story__title" data-testid="story-title">
            {story.title}
          </h2>
          <p className="story__meta">
            <span className="chip" data-testid="story-status">
              {STORY_STATUS_LABELS[story.status]}
            </span>
            <span>{sceneCountLabel(scenes.length)}</span>
          </p>
          {story.premise ? (
            <p className="story__premise" data-testid="story-premise">
              {story.premise}
            </p>
          ) : null}
        </div>

        <div className="story__actions">
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => setIsEditingStory(true)}
            data-testid="edit-story"
          >
            <ActionIcon icon={Pencil} />
            Edit story
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => void removeStory()}
            data-testid="delete-story"
          >
            <ActionIcon icon={Trash} />
            Delete story
          </button>
        </div>
      </header>

      <section className="story__scenes" aria-labelledby="story-scenes-heading">
        <div className="story__sceneshead">
          <h3 className="story__subtitle" id="story-scenes-heading">
            Scenes
          </h3>
          <button
            className="button button--icon"
            type="button"
            onClick={() => setSceneForm({ mode: 'new' })}
            data-testid="new-scene"
          >
            <ActionIcon icon={Plus} />
            New scene
          </button>
        </div>

        {scenes.length > 0 ? (
          <p className="chron__aside">
            In the order they are told. When each happens in the world never moves it.
          </p>
        ) : null}

        {message ? (
          <p className="form__message" role="alert" data-testid="story-error">
            {message}
          </p>
        ) : null}

        {scenes.length > 0 ? (
          <ol className="scenes" data-testid="scene-list">
            {scenes.map((scene, index) => (
              <SceneCard
                key={scene.id}
                universeId={universe.id}
                chronology={chronology}
                scene={scene}
                index={index}
                count={scenes.length}
                onMove={(target, by) => void move(target, by)}
                onEdit={(target) => setSceneForm({ mode: 'edit', scene: target })}
                onDelete={(target) => void removeScene(target)}
                moveButtonRef={moveButtonRef}
              />
            ))}
          </ol>
        ) : (
          <div className="empty" data-testid="scenes-empty">
            <p className="empty__line">No scenes yet.</p>
            <p className="empty__hint">
              Scenes are told in the order you set, whenever in the world each one happens.
            </p>
            <button
              className="button button--icon empty__action"
              type="button"
              onClick={() => setSceneForm({ mode: 'new' })}
              data-testid="empty-new-scene"
            >
              <ActionIcon icon={Plus} />
              New scene
            </button>
          </div>
        )}
      </section>

      <p className="visually-hidden" role="status" aria-live="polite" data-testid="story-announcer">
        {announcement}
      </p>

      {sceneForm.mode !== 'closed' ? (
        <SceneForm
          universeId={universe.id}
          storyId={story.id}
          scene={sceneForm.mode === 'edit' ? sceneForm.scene : null}
          chronology={chronology}
          onClose={() => setSceneForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setSceneForm({ mode: 'closed' })
            setAnnouncement(`Saved “${saved.title}”.`)
            reload()
          }}
        />
      ) : null}

      {isEditingStory ? (
        <StoryForm
          universeId={universe.id}
          story={story}
          onClose={() => setIsEditingStory(false)}
          onSaved={(saved) => {
            setIsEditingStory(false)
            setState({ kind: 'ready', story: saved })
          }}
        />
      ) : null}
    </article>
  )
}
