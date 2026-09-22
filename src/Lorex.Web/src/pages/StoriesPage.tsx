import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { StoryForm } from '../components/StoryForm'
import { listStories } from '../stories/api'
import { sceneCountLabel } from '../stories/format'
import { STORY_STATUS_LABELS, type StorySummary } from '../stories/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; stories: StorySummary[] } | { kind: 'error' }

/**
 * The stories told in this universe. A story is narrative an author writes with the lore - it draws
 * on the lore and never changes it - so this list sits beside Lore and Timeline rather than inside
 * either.
 *
 * A list that cannot be read says so in the same words and with the same Try again as a story, a
 * manuscript and the workspace itself, rather than passing on whatever the request failed with.
 */
export default function StoriesPage() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    listStories(universe.id, controller.signal)
      .then((stories) => setState({ kind: 'ready', stories }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error' })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, reads])

  return (
    <article className="stories">
      <header className="chron__head">
        <div>
          <h2 className="chron__title">Stories</h2>
          <p className="chron__lede">Narratives told with this world’s lore, scene by scene.</p>
        </div>
        <button
          className="button button--icon"
          type="button"
          onClick={() => setIsCreating(true)}
          data-testid="new-story"
        >
          <ActionIcon icon={Plus} />
          New story
        </button>
      </header>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Reading the stories…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="stories-load-error">
          <p>The stories could not be read.</p>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((count) => count + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {state.kind === 'ready' && state.stories.length > 0 ? (
        <ul className="storylist" data-testid="story-list">
          {state.stories.map((story) => (
            <li
              className="storyrow"
              key={story.id}
              data-testid="story-row"
              data-title={story.title}
            >
              <Link className="storyrow__title" to={story.id}>
                <bdi>{story.title}</bdi>
              </Link>
              <p className="storyrow__meta">
                <span className="chip">{STORY_STATUS_LABELS[story.status]}</span>
                <span data-testid="story-scene-count">{sceneCountLabel(story.sceneCount)}</span>
              </p>
              {story.premise ? <p className="storyrow__premise">{story.premise}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {state.kind === 'ready' && state.stories.length === 0 ? (
        <div className="empty" data-testid="stories-empty">
          <p className="empty__line">No stories yet.</p>
          <p className="empty__hint">
            A story tells something in this world, scene by scene. It draws on the lore and never
            changes it.
          </p>
          <button
            className="button button--icon empty__action"
            type="button"
            onClick={() => setIsCreating(true)}
            data-testid="empty-new-story"
          >
            <ActionIcon icon={Plus} />
            New story
          </button>
        </div>
      ) : null}

      {isCreating ? (
        <StoryForm
          universeId={universe.id}
          story={null}
          onClose={() => setIsCreating(false)}
          onSaved={(story) => navigate(`/app/universes/${universe.id}/stories/${story.id}`)}
        />
      ) : null}
    </article>
  )
}
