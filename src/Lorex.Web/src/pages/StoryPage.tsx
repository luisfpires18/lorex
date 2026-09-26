import { useCallback, useEffect, useRef, useState } from 'react'
import { BookPlus, Pencil, Plus, Trash } from 'lucide-react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { ChapterForm } from '../components/ChapterForm'
import { ChapterSection } from '../components/ChapterSection'
import { ManuscriptPanel } from '../components/ManuscriptPanel'
import { PlotPanel } from '../components/PlotPanel'
import { SceneCard, type MoveTarget } from '../components/SceneCard'
import { SceneForm } from '../components/SceneForm'
import { StoryForm } from '../components/StoryForm'
import { ApiError } from '../lib/api'
import {
  deleteChapter,
  deleteScene,
  deleteStory,
  getStory,
  listPlotArcs,
  moveScene,
  reorderChapters,
  reorderScenes,
} from '../stories/api'
import {
  arcCountLabel,
  chapterCountLabel,
  chapterLabel,
  chapterNumber,
  containerLabel,
  sceneCountLabel,
  UNCHAPTERED,
} from '../stories/format'
import { beatsByScene, readingOrder, scenesIn } from '../stories/structure'
import {
  STORY_STATUS_LABELS,
  type Chapter,
  type PlotArc,
  type Scene,
  type StoryDetail,
} from '../stories/types'
import { StatusBadge } from '../components/StatusBadge'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; story: StoryDetail; arcs: PlotArc[] }
  | { kind: 'missing' }
  | { kind: 'error' }

type SceneFormState =
  { mode: 'closed' } | { mode: 'new'; chapterId: string | null } | { mode: 'edit'; scene: Scene }

type ChapterFormState =
  { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; chapter: Chapter; index: number }

/** The control that should hold the focus once a move has redrawn the page, and the one to use if it is disabled. */
type FocusRequest = { key: string; fallback: string | null }

/** How long a scene or beat reached by a link stays marked, so the eye can pick it out from its neighbours. */
const ARRIVAL_MS = 2400

/** "a", "a and b", "a, b and c". */
function listed(parts: string[]) {
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * A story's page, one per story. Moving between its three views keeps the page and everything read for it; moving to
 * another story - a search result in another story, say - starts a new page, so nothing on screen for one story (the
 * story itself while the next is read, a message, a pending focus) is ever shown under the other's address, and a link
 * that lands on a scene or a beat lands once the story it is in is on screen.
 */
export default function StoryPage({
  view = 'scenes',
}: {
  view?: 'scenes' | 'plot' | 'manuscript'
}) {
  const { storyId } = useParams<{ storyId: string }>()
  return <StoryView key={storyId} view={view} />
}

/**
 * One story, told in the order its author sets, and planned in the plot its author follows.
 *
 * The page has three views under one header: Scenes, at the story's own address, Plot, at `/plot`, and Manuscript, at
 * `/manuscript/:sceneId`. All three read the same story and the same plot, once, so moving between them costs nothing
 * and the header never changes. Neither read carries prose: the Manuscript view reads one scene's text when that scene
 * is opened.
 *
 * The header is deliberately short, because on a phone every line of it stands between the author and the work: the
 * title, one line of facts, the premise on Scenes alone - the story's home - and one bar holding the three views and the
 * story's own Edit and Delete. Each view then opens with its own tools, or with one empty state holding the one way to
 * begin.
 *
 * Chapters are optional. A story without any is one list of scenes, exactly as before chapters existed.
 * Once it has some, the page reads Unchaptered first - a holding area, shown only while it holds a scene -
 * and then each chapter in order with its own scenes. Move up and Move down stay inside a scene's chapter;
 * Move to… takes it elsewhere. A chapter's number is its position, drawn here and never stored.
 *
 * Neither order is chronology. Each scene may say where it happens in the world, and that is shown on the
 * scene, but nothing on this page sorts, groups or warns by it: a story that opens on the aftermath and
 * flashes back to a childhood is exactly as valid as one told straight through. The plot is a third order of
 * its own - arcs, and the beats in each - which follows neither.
 */
function StoryView({ view }: { view: 'scenes' | 'plot' | 'manuscript' }) {
  const { universe, chronology } = useOutletContext<WorkspaceContext>()
  const { storyId, sceneId } = useParams<{ storyId: string; sceneId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [stale, setStale] = useState(false)
  const [sceneForm, setSceneForm] = useState<SceneFormState>({ mode: 'closed' })
  const [chapterForm, setChapterForm] = useState<ChapterFormState>({ mode: 'closed' })
  const [isEditingStory, setIsEditingStory] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [reloads, setReloads] = useState(0)

  // A refusal is held with the address it was raised on, like the manuscript outline's open state, so one raised on
  // the Scenes view is not still standing when the author comes back to it from the Plot view.
  const [raised, setRaised] = useState<{ at: string; text: string } | null>(null)
  const message = raised?.at === location.pathname ? raised.text : null

  const isMoving = useRef(false)
  const controls = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocus = useRef<FocusRequest | null>(null)

  useEffect(() => {
    if (!storyId) return
    const controller = new AbortController()

    Promise.all([
      getStory(universe.id, storyId, controller.signal),
      listPlotArcs(universe.id, storyId, controller.signal),
    ])
      .then(([story, arcs]) => {
        setState({ kind: 'ready', story, arcs })
        setStale(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'missing' })
          return
        }

        // A story already on screen stays there, marked as possibly out of date, rather than being taken away - and
        // with it any prose being written beside it. Only a first read that fails has nothing to show.
        setState((current) => (current.kind === 'ready' ? current : { kind: 'error' }))
        setStale(true)
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

  // A link to one scene or one beat - a beat's scene, a scene's beat, or the manuscript's way back to its scene - lands
  // on it, whichever view it opens: scrolled to, given the focus so a keyboard and a screen reader arrive there too, and
  // marked for a moment so the eye can tell which of twenty rows it meant. The location's key runs it again when the
  // same link is followed twice.
  const isReady = state.kind === 'ready'
  useEffect(() => {
    if (!isReady || location.hash.length < 2) return
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (!target) return

    target.scrollIntoView({ block: 'center' })
    target.focus({ preventScroll: true })
    target.setAttribute('data-arrived', 'true')
    const timer = window.setTimeout(() => target.removeAttribute('data-arrived'), ARRIVAL_MS)

    return () => {
      window.clearTimeout(timer)
      target.removeAttribute('data-arrived')
    }
  }, [isReady, view, location.hash, location.key])

  const controlRef = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) controls.current.set(key, element)
    else controls.current.delete(key)
  }, [])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setReloads((count) => count + 1)
  }, [])

  function setMessage(text: string | null) {
    setRaised(text === null ? null : { at: location.pathname, text })
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
      <div className="notice notice--error" role="alert" data-testid="story-load-error">
        <p>This story could not be opened.</p>
        <button className="button button--quiet" type="button" onClick={retry}>
          Try again
        </button>
      </div>
    )
  }

  const { story, arcs } = state
  const { chapters, scenes } = story
  const hasChapters = chapters.length > 0
  const isEmpty = !hasChapters && scenes.length === 0
  const unchaptered = scenesIn(scenes, null)
  const sceneBeats = beatsByScene(arcs)
  const storyPath = `/app/universes/${universe.id}/stories/${story.id}`

  const targets: MoveTarget[] = hasChapters
    ? [
        { chapterId: null, chapter: null },
        ...chapters.map((chapter, index) => ({
          chapterId: chapter.id,
          chapter: { index, title: chapter.title },
        })),
      ]
    : []

  function showStory(next: StoryDetail) {
    setState((current) => (current.kind === 'ready' ? { ...current, story: next } : current))
  }

  function showArcs(next: PlotArc[]) {
    setState((current) => (current.kind === 'ready' ? { ...current, arcs: next } : current))
  }

  /** One container's scenes replaced, the rest of the story left as it is. */
  function showContainer(chapterId: string | null, replacement: Scene[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
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
            ...current,
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
    const beats = sceneBeats.get(scene.id)?.length ?? 0
    const stays =
      beats === 0
        ? 'Its manuscript and saved versions go with it. The lore it links stays.'
        : `Its manuscript and saved versions go with it. The lore it links stays, and so ${
            beats === 1 ? 'does the plot beat' : `do the ${beats} plot beats`
          } that point at it.`

    if (
      !window.confirm(
        `Move the scene “${scene.title}” to the Trash? ${stays} You can restore it from the Trash.`,
      )
    ) {
      return
    }

    setMessage(null)
    try {
      await deleteScene(universe.id, story.id, scene.id)
      setAnnouncement(`Moved “${scene.title}” to the Trash.`)
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
        : `Its ${sceneCountLabel(count)} will be moved to Unchaptered. Their manuscripts and plot links go with them. No scene is deleted.`

    if (
      !window.confirm(
        `Delete ${chapterLabel(index, chapter.title)}? The chapter will be removed. ${consequence} The chapter goes to the Trash, and restoring it brings it back without moving any scene.`,
      )
    ) {
      return
    }

    setMessage(null)
    try {
      await deleteChapter(universe.id, story.id, chapter.id)
      setAnnouncement(
        count === 0
          ? `Moved the chapter “${chapter.title}” to the Trash.`
          : `Moved the chapter “${chapter.title}” to the Trash. Its ${sceneCountLabel(count)} ${
              count === 1 ? 'is' : 'are'
            } now in Unchaptered.`,
      )
      reload()
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'That chapter could not be deleted.')
    }
  }

  async function removeStory() {
    const holds = listed([
      ...(hasChapters ? [chapterCountLabel(chapters.length)] : []),
      sceneCountLabel(scenes.length),
      ...(arcs.length > 0 ? [arcCountLabel(arcs.length)] : []),
    ])
    if (
      !window.confirm(
        `Move “${story.title}” and its ${holds}, with every manuscript, to the Trash? You can restore the whole story from the Trash. The lore it draws on stays.`,
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
        beats={sceneBeats.get(scene.id) ?? []}
        onMove={(target, by) => void moveWithin(target, by)}
        onMoveTo={(target, chapterId) => void moveTo(target, chapterId)}
        onEdit={(target) => setSceneForm({ mode: 'edit', scene: target })}
        onDelete={(target) => void removeScene(target)}
        controlRef={controlRef}
      />
    ))
  }

  const newScene = (
    <button
      className="button button--icon"
      type="button"
      onClick={() => setSceneForm({ mode: 'new', chapterId: null })}
      data-testid="new-scene"
    >
      <ActionIcon icon={Plus} />
      New scene
    </button>
  )

  const newChapter = (
    <button
      className="button button--quiet button--icon"
      type="button"
      onClick={() => setChapterForm({ mode: 'new' })}
      data-testid="new-chapter"
    >
      <ActionIcon icon={BookPlus} />
      New chapter
    </button>
  )

  return (
    <article className="story" data-testid="story-page">
      <nav className="entry__crumbs story__crumbs" aria-label="Breadcrumb">
        <Link to={`/app/universes/${universe.id}/stories`}>Stories</Link>
      </nav>

      <header className="story__head">
        <h1 className="story__title" data-testid="story-title">
          <bdi>{story.title}</bdi>
        </h1>
        <p className="story__meta">
          <StatusBadge
            step={story.status}
            label={STORY_STATUS_LABELS[story.status]}
            testId="story-status"
          />
          {hasChapters ? (
            <span data-testid="story-chapter-count">{chapterCountLabel(chapters.length)}</span>
          ) : null}
          <span>{sceneCountLabel(scenes.length)}</span>
        </p>
        {view === 'scenes' && story.premise ? (
          <p className="story__premise prose" data-testid="story-premise">
            {story.premise}
          </p>
        ) : null}
      </header>

      <div className="story__bar">
        <nav className="views" aria-label="Story views" data-testid="story-views">
          <NavLink to={storyPath} end className="views__link" data-testid="story-view-scenes">
            Scenes
          </NavLink>
          <NavLink to={`${storyPath}/plot`} className="views__link" data-testid="story-view-plot">
            Plot
          </NavLink>
          <NavLink
            to={`${storyPath}/manuscript`}
            className="views__link"
            data-testid="story-view-manuscript"
          >
            Manuscript
          </NavLink>
        </nav>

        <div className="storytools story__actions">
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => setIsEditingStory(true)}
            data-testid="edit-story"
          >
            <ActionIcon icon={Pencil} />
            <span className="story__actionlabel">Edit story</span>
          </button>
          <button
            className="button button--quiet button--icon"
            type="button"
            onClick={() => void removeStory()}
            data-testid="delete-story"
          >
            <ActionIcon icon={Trash} />
            <span className="story__actionlabel">Delete story</span>
          </button>
        </div>
      </div>

      {stale ? (
        <div className="notice notice--error story__stale" role="alert" data-testid="story-stale">
          <p>The story could not be read again, so what is shown may be out of date.</p>
          <button className="button button--quiet" type="button" onClick={reload}>
            Try again
          </button>
        </div>
      ) : null}

      {view === 'plot' ? (
        <PlotPanel
          universeId={universe.id}
          story={story}
          arcs={arcs}
          onArcsChange={showArcs}
          onReload={reload}
          announce={setAnnouncement}
        />
      ) : view === 'manuscript' ? (
        <ManuscriptPanel
          universeId={universe.id}
          story={story}
          arcs={arcs}
          chronology={chronology}
          sceneId={sceneId}
          onEditScene={(scene) => setSceneForm({ mode: 'edit', scene })}
        />
      ) : (
        <section className="story__scenes" aria-labelledby="story-scenes-heading">
          <h3 className="visually-hidden" id="story-scenes-heading">
            Scenes
          </h3>

          {isEmpty ? null : (
            <div className="story__toolbar">
              <p className="chron__aside story__aside">
                {hasChapters
                  ? 'Chapters in order, and the scenes in each in the order they are told. When each happens in the world never moves it.'
                  : 'In the order they are told. When each happens in the world never moves it.'}
              </p>
              <div className="story__toolbaractions">
                {newChapter}
                {newScene}
              </div>
            </div>
          )}

          {message ? (
            <p className="form__message" role="alert" data-testid="story-error">
              {message}
            </p>
          ) : null}

          {isEmpty ? (
            <div className="empty" data-testid="scenes-empty">
              <p className="empty__line">No scenes yet.</p>
              <p className="empty__hint">
                Start with a scene: plot beats point at scenes, and the manuscript is written one
                scene at a time. Scenes are told in the order you set, whenever in the world each
                happens, and can be grouped into chapters whenever you like, or never.
              </p>
              <div className="empty__actions">
                {newScene}
                {newChapter}
              </div>
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
                onEdit={(target, at) =>
                  setChapterForm({ mode: 'edit', chapter: target, index: at })
                }
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
      )}

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
