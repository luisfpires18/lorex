import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { PortalError, PortalMissing } from '../components/PortalMissing'
import { formatDate } from '../lib/dates'
import {
  authorPath,
  getPublicStory,
  getPublicUniverse,
  worldPath,
  type PublicStory,
  type PublicUniverse,
} from '../portal/api'
import { useWorkspaceLink } from '../portal/useWorkspaceLink'

type LoadState =
  | { key: string; kind: 'ready'; world: PublicUniverse; story: PublicStory }
  | { key: string; kind: 'missing' }
  | { key: string; kind: 'error' }

/**
 * One published story at `/worlds/{world}/stories/{story}` (Task 011): a story's landing page - its title, the summary its
 * author wrote for readers, who wrote it, when, and the world it belongs to. Deliberately not a reader for its prose:
 * publishing prose needs a decision about chapters and scenes that has not been made, so nothing of the story's
 * structure, manuscript, plot, premise or notes is read at all. Private and missing are one page; the owner, signed in,
 * gets "Edit in workspace".
 */
export default function PublicStoryPage() {
  const { slug = '', storySlug = '' } = useParams<{ slug: string; storySlug: string }>()
  const key = `${slug}/${storySlug}`
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getPublicUniverse(slug, controller.signal),
      getPublicStory(slug, storySlug, controller.signal),
    ])
      .then(([world, story]) => setState({ key, kind: 'ready', world, story }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ key, kind: (error as { status?: number }).status === 404 ? 'missing' : 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [slug, storySlug, key, attempt])

  const current = state?.key === key ? state : null

  if (current?.kind === 'missing') {
    return <PortalMissing title="This page is not available." testId="story-missing" />
  }

  if (current?.kind === 'error') {
    return <PortalError onRetry={() => setAttempt((value) => value + 1)} />
  }

  if (!current) {
    return (
      <div className="pread" role="status" aria-label="Opening this story">
        <div className="pread__skeleton" />
      </div>
    )
  }

  return <Story world={current.world} story={current.story} />
}

function Story({ world, story }: { world: PublicUniverse; story: PublicStory }) {
  const owner = useWorkspaceLink(world.slug, { story: story.slug })

  return (
    <article className="pread pstory" data-testid="public-story">
      <nav className="pcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link
              className="pcrumbs__back"
              to={worldPath(world.slug)}
              data-testid="public-story-world"
            >
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
              <bdi>{world.name}</bdi>
            </Link>
          </li>
          <li aria-current="page">Stories</li>
        </ol>
      </nav>

      <header className="pread__head pstory__head">
        <p className="pread__eyebrow">A story</p>
        <h1 className="pread__title pstory__title" dir="auto">
          <bdi>{story.title}</bdi>
        </h1>
        <p className="pstory__byline">
          by{' '}
          <Link
            className="plink"
            to={authorPath(world.authorSlug)}
            data-testid="public-story-author"
          >
            <bdi>{world.authorDisplayName}</bdi>
          </Link>
          <span aria-hidden="true"> · </span>
          <span>Published {formatDate(story.publishedAt)}</span>
        </p>
        <p className="pstory__summary" dir="auto" data-testid="public-story-summary">
          {story.publicSummary}
        </p>
        {owner?.storyId ? (
          <Link
            className="pread__edit"
            to={`/app/universes/${owner.universeId}/stories/${owner.storyId}`}
            data-testid="edit-in-workspace"
          >
            Edit in workspace
            <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.75} />
          </Link>
        ) : null}
      </header>

      <aside className="pstory__world" aria-label="The world of this story">
        <img
          className="pstory__worldart"
          src={world.cardImageUrl}
          alt=""
          width={960}
          height={600}
          loading="lazy"
          decoding="async"
        />
        <div className="pstory__worldtext">
          <p className="pread__eyebrow">Set in</p>
          <p className="pstory__worldname" dir="auto">
            <bdi>{world.name}</bdi>
          </p>
          <p className="pstory__worldsummary" dir="auto">
            {world.publicSummary}
          </p>
          <Link className="portal__pill" to={worldPath(world.slug)}>
            Explore this world
          </Link>
        </div>
      </aside>
    </article>
  )
}
