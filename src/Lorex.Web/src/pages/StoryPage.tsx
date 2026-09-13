import { useCallback, useEffect, useRef, useState } from 'react'
import { BookPlus, Pencil, Plus, Trash } from 'lucide-react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { ChapterForm } from '../components/ChapterForm'
import { ChapterSection } from '../components/ChapterSection'
import { SceneCard, type MoveTarget } from '../components/SceneCard'
import { SceneForm } from '../components/SceneForm'
import { StoryForm } from '../components/StoryForm'
import { ApiError } from '../lib/api'
import {
  deleteChapter,
  deleteScene,
  deleteStory,
  getStory,
  moveScene,
  reorderChapters,
  reorderScenes,
} from '../stories/api'
import {
  chapterCountLabel,
  chapterLabel,
  chapterNumber,
  containerLabel,
  sceneCountLabel,
  UNCHAPTERED,
} from '../stories/format'
import { readingOrder, scenesIn } from '../stories/structure'
import { STORY_STATUS_LABELS, type Chapter, type Scene, type StoryDetail } from '../stories/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; story: StoryDetail }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

type SceneFormState =
  { mode: 'closed' } | { mode: 'new'; chapterId: string | null } | { mode: 'edit'; scene: Scene }

type ChapterFormState =
  { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; chapter: Chapter; index: number }

/** The control that should hold the focus once a move has redrawn the page, and the one to use if it is disabled. */
type FocusRequest = { key: string; fallback: string | null }

/**
 * One story, told in the order its author sets.
 *
 * Chapters are optional. A story without any is one list of scenes, exactly as before chapters existed.
 * Once it has some, the page reads Unchaptered first - a holding area, shown only while it holds a scene -
 * and then each chapter in order with its own scenes. Move up and Move down stay inside a scene's chapter;
 * Move to… takes it elsewhere. A chapter's number is its position, drawn here and never stored.
 *
 * Neither order is chronology. Each scene may say where it happens in the world, and that is shown on the
 * scene, but nothing on this page sorts, groups or warns by it: a story that opens on the aftermath and
 * flashes back to a childhood is exactly as valid as one told straight through.
 */
export default function StoryPage() {
  const { universe, chronology } = useOutletContext<WorkspaceContext>()
  const { storyId } = useParams<{ storyId: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [sceneForm, setSceneForm] = useState<SceneFormState>({ mode: 'closed' })
  const [chapterForm, setChapterForm] = useState<ChapterFormState>({ mode: 'closed' })
  const [isEditingStory, setIsEditingStory] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [reloads, setReloads] = useState(0)

  const isMoving = useRef(false)
  const controls = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocus = useRef<FocusRequest | null>(null)

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

  // Whatever has just moved keeps the focus on its own control, wherever the page put it. When a move
  // reached an end the control that made it is disabled, so the focus goes to the other one.
  useEffect(() => {
    const request = pendingFocus.current
    if (!request || state.kind !== 'ready') return
    pendingFocus.current = null

    const first = controls.current.get(request.key)
    const second = request.fallback ? controls.current.get(request.fallback) : undefined
    ;(first && !first.disabled ? first : second)?.focus()
  }, [state])

  const controlRef = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) controls.current.set(key, element)
    else controls.current.delete(key)
  }, [])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

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
  const { chapters, scenes } = story
  const hasChapters = chapters.length > 0
  const unchaptered = scenesIn(scenes, null)

  const targets: MoveTarget[] = hasChapters
    ? [
        { chapterId: null, label: UNCHAPTERED },
        ...chapters.map((chapter, index) => ({
          chapterId: chapter.id,
          label: chapterLabel(index, chapter.title),
        })),
      ]
    : []

  function showStory(next: StoryDetail) {
    setState({ kind: 'ready', story: next })
  }

  /** One container's scenes replaced, the rest of the story left as it is. */
  function showContainer(chapterId: string | null, replacement: Scene[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            story: {
              ...current.story,
              scenes: readingOrder(current.story.chapters, [
                ...current.story.scenes.filter((scene) => scene.chapterId !== chapterId),
                ...replacement,
              ]),
            },
          }
        : current,
    )
  }

  function showChapters(nextChapters: Chapter[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            story: {
              ...current.story,
              chapters: nextChapters,
              scenes: readingOrder(nextChapters, current.story.scenes),
            },
          }
        : current,
    )
  }

  /** Moves one scene one place inside its container, at once on screen, and puts it back if refused. */
  async function moveWithin(scene: Scene, by: -1 | 1) {
    if (isMoving.current) return

    const container = scenesIn(scenes, scene.chapterId)
    const from = container.findIndex((candidate) => candidate.id === scene.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= container.length) return

    const next = [...container]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    const direction = by < 0 ? 'up' : 'down'
    isMoving.current = true
    setMessage(null)
    pendingFocus.current = {
      key: `${scene.id}:${direction}`,
      fallback: `${scene.id}:${by < 0 ? 'down' : 'up'}`,
    }
    showContainer(
      scene.chapterId,
      next.map((candidate, index) => ({ ...candidate, sortOrder: index })),
    )

    try {
      showContainer(
        scene.chapterId,
        await reorderScenes(
          universe.id,
          story.id,
          scene.chapterId,
          next.map((candidate) => candidate.id),
        ),
      )
      const where = hasChapters ? ` in ${containerLabel(chapters, scene.chapterId)}` : ''
      setAnnouncement(`“${scene.title}” is now scene ${to + 1} of ${next.length}${where}.`)
    } catch (error: unknown) {
      showStory(story)
      setMessage(error instanceof ApiError ? error.message : 'The new order could not be saved.')
    } finally {
      isMoving.current = false
    }
  }

  /** Moves one scene to the end of another chapter, or of Unchaptered. */
  async function moveTo(scene: Scene, chapterId: string | null) {
    if (isMoving.current) return

    isMoving.current = true
    setMessage(null)

    try {
      const saved = await moveScene(universe.id, story.id, scene.id, chapterId)
      pendingFocus.current = { key: `${scene.id}:to`, fallback: `${scene.id}:up` }
      showStory(saved)

      const count = scenesIn(saved.scenes, chapterId).length
      setAnnouncement(
        `“${scene.title}” moved to ${containerLabel(saved.chapters, chapterId)}, scene ${count} of ${count}.`,
      )
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'That scene could not be moved.')
      controls.current.get(`${scene.id}:to`)?.focus()
    } finally {
      isMoving.current = false
    }
  }

  /** Moves one chapter one place, at once on screen, and puts it back if refused. */
  async function moveChapter(chapter: Chapter, by: -1 | 1) {
    if (isMoving.current) return

    const from = chapters.findIndex((candidate) => candidate.id === chapter.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= chapters.length) return

    const next = [...chapters]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = {
      key: `chapter:${chapter.id}:${by < 0 ? 'up' : 'down'}`,
      fallback: `chapter:${chapter.id}:${by < 0 ? 'down' : 'up'}`,
    }
    showChapters(next.map((candidate, index) => ({ ...candidate, sortOrder: index })))

    try {
      showChapters(
        await reorderChapters(
          universe.id,
          story.id,
          next.map((candidate) => candidate.id),
        ),
      )
      setAnnouncement(`“${chapter.title}” is now chapter ${to + 1} of ${next.length}.`)
    } catch (error: unknown) {
      showStory(story)
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

  /** Removes the chapter only. Its scenes move, in order, to the end of Unchaptered. */
  async function removeChapter(chapter: Chapter, index: number) {
    const count = scenesIn(scenes, chapter.id).length
    const consequence =
      count === 0
        ? 'It holds no scenes.'
        : `Its ${sceneCountLabel(count)} will be moved to Unchaptered. No scene is deleted.`

    if (
      !window.confirm(
        `Delete ${chapterLabel(index, chapter.title)}? The chapter will be removed. ${consequence}`,
      )
    ) {
      return
    }

    setMessage(null)
    try {
      await deleteChapter(universe.id, story.id, chapter.id)
      setAnnouncement(
        count === 0
          ? `Deleted the chapter “${chapter.title}”.`
          : `Deleted the chapter “${chapter.title}”. Its ${sceneCountLabel(count)} ${
              count === 1 ? 'is' : 'are'
            } now in Unchaptered.`,
      )
      reload()
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'That chapter could not be deleted.')
    }
  }

  async function removeStory() {
    const holds = hasChapters
      ? `its ${chapterCountLabel(chapters.length)} and ${sceneCountLabel(scenes.length)}`
      : `its ${sceneCountLabel(scenes.length)}`
    if (
      !window.confirm(
        `Delete “${story.title}” and ${holds}? This cannot be undone. The lore it draws on stays.`,
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

  function sceneCards(container: Scene[], titleLevel: 4 | 5) {
    return container.map((scene, index) => (
      <SceneCard
        key={scene.id}
        universeId={universe.id}
        chronology={chronology}
        scene={scene}
        index={index}
        count={container.length}
        titleLevel={titleLevel}
        moveTargets={targets.filter((target) => target.chapterId !== scene.chapterId)}
        onMove={(target, by) => void moveWithin(target, by)}
        onMoveTo={(target, chapterId) => void moveTo(target, chapterId)}
        onEdit={(target) => setSceneForm({ mode: 'edit', scene: target })}
        onDelete={(target) => void removeScene(target)}
        controlRef={controlRef}
      />
    ))
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
            {hasChapters ? (
              <span data-testid="story-chapter-count">{chapterCountLabel(chapters.length)}</span>
            ) : null}
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
          <div className="story__sceneactions">
            <button
              className="button button--quiet button--icon"
              type="button"
              onClick={() => setChapterForm({ mode: 'new' })}
              data-testid="new-chapter"
            >
              <ActionIcon icon={BookPlus} />
              New chapter
            </button>
            <button
              className="button button--icon"
              type="button"
              onClick={() => setSceneForm({ mode: 'new', chapterId: null })}
              data-testid="new-scene"
            >
              <ActionIcon icon={Plus} />
              New scene
            </button>
          </div>
        </div>

        {scenes.length > 0 || hasChapters ? (
          <p className="chron__aside">
            {hasChapters
              ? 'Chapters in order, and the scenes in each in the order they are told. When each happens in the world never moves it.'
              : 'In the order they are told. When each happens in the world never moves it.'}
          </p>
        ) : null}

        {message ? (
          <p className="form__message" role="alert" data-testid="story-error">
            {message}
          </p>
        ) : null}

        {!hasChapters && scenes.length === 0 ? (
          <div className="empty" data-testid="scenes-empty">
            <p className="empty__line">No scenes yet.</p>
            <p className="empty__hint">
              Scenes are told in the order you set, whenever in the world each one happens. Group
              them into chapters whenever you like, or never.
            </p>
            <button
              className="button button--icon empty__action"
              type="button"
              onClick={() => setSceneForm({ mode: 'new', chapterId: null })}
              data-testid="empty-new-scene"
            >
              <ActionIcon icon={Plus} />
              New scene
            </button>
          </div>
        ) : null}

        {!hasChapters && scenes.length > 0 ? (
          <ol className="scenes" data-testid="scene-list">
            {sceneCards(scenes, 4)}
          </ol>
        ) : null}

        {hasChapters && unchaptered.length > 0 ? (
          <section
            className="storygroup"
            aria-labelledby="unchaptered-heading"
            data-testid="unchaptered"
          >
            <header className="storygroup__head">
              <h4 className="storygroup__title" id="unchaptered-heading">
                {UNCHAPTERED}
              </h4>
              <p className="storygroup__hint">
                {sceneCountLabel(unchaptered.length)} not in a chapter yet.
              </p>
            </header>
            <ol className="scenes" data-testid="unchaptered-scenes">
              {sceneCards(unchaptered, 5)}
            </ol>
          </section>
        ) : null}

        {chapters.map((chapter, index) => {
          const inside = scenesIn(scenes, chapter.id)
          return (
            <ChapterSection
              key={chapter.id}
              chapter={chapter}
              index={index}
              count={chapters.length}
              sceneCount={inside.length}
              onMove={(target, by) => void moveChapter(target, by)}
              onAddScene={(target) => setSceneForm({ mode: 'new', chapterId: target.id })}
              onEdit={(target, at) => setChapterForm({ mode: 'edit', chapter: target, index: at })}
              onDelete={(target, at) => void removeChapter(target, at)}
              controlRef={controlRef}
            >
              <ol className="scenes" data-testid="chapter-scenes">
                {sceneCards(inside, 5)}
              </ol>
            </ChapterSection>
          )
        })}
      </section>

      <p className="visually-hidden" role="status" aria-live="polite" data-testid="story-announcer">
        {announcement}
      </p>

      {sceneForm.mode !== 'closed' ? (
        <SceneForm
          universeId={universe.id}
          storyId={story.id}
          scene={sceneForm.mode === 'edit' ? sceneForm.scene : null}
          chapters={chapters}
          chapterId={sceneForm.mode === 'new' ? sceneForm.chapterId : sceneForm.scene.chapterId}
          chronology={chronology}
          onClose={() => setSceneForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setSceneForm({ mode: 'closed' })
            setAnnouncement(`Saved “${saved.title}”.`)
            reload()
          }}
        />
      ) : null}

      {chapterForm.mode !== 'closed' ? (
        <ChapterForm
          universeId={universe.id}
          storyId={story.id}
          chapter={chapterForm.mode === 'edit' ? chapterForm.chapter : null}
          number={chapterForm.mode === 'edit' ? chapterNumber(chapterForm.index) : null}
          onClose={() => setChapterForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setChapterForm({ mode: 'closed' })
            setAnnouncement(`Saved the chapter “${saved.title}”.`)
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
            showStory(saved)
          }}
        />
      ) : null}
    </article>
  )
}
