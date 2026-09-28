import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { getPublicUniverse, type PublicUniverse } from '../portal/api'
import { categoryLabel, genreLabel } from '../publishing/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; world: PublicUniverse }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

/**
 * One public universe at `/worlds/{slug}`: its shell and nothing more - title, card artwork, public summary,
 * category, genres and author. Private and missing are the same page, which says neither. The universe's own
 * public page, with what its author publishes inside it, is a later task's.
 */
export default function PublicWorldPage() {
  // A page width of its own: the portal's main is full-bleed, for Explore's hero.
  return (
    <div className="portal__page">
      <PublicWorld />
    </div>
  )
}

function PublicWorld() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    getPublicUniverse(slug, controller.signal)
      .then((world) => setState({ kind: 'ready', world }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState(
          (error as { status?: number }).status === 404
            ? { kind: 'missing' }
            : {
                kind: 'error',
                message: error instanceof Error ? error.message : 'This world could not be loaded.',
              },
        )
      })
    return () => {
      controller.abort()
    }
  }, [slug])

  if (state.kind === 'loading') {
    return (
      <p className="notice" role="status">
        Opening…
      </p>
    )
  }

  if (state.kind === 'missing') {
    return (
      <EmptyState
        testId="world-missing"
        title="This world is not available."
        hint={
          <>
            Its address may be wrong, or it is not public. <Link to="/explore">Explore worlds</Link>
          </>
        }
      />
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert">
        <p>{state.message}</p>
      </div>
    )
  }

  const { world } = state

  return (
    <article className="world" data-testid="public-world">
      <img
        className="world__card"
        src={world.cardImageUrl}
        alt=""
        width={960}
        height={600}
        data-testid="public-world-card"
      />
      <h1 className="world__title">
        <bdi>{world.name}</bdi>
      </h1>
      <p className="world__author">
        by <bdi>{world.authorDisplayName}</bdi>
      </p>
      <p className="world__facts">
        {categoryLabel(world.category)} · {world.genres.map(genreLabel).join(', ')}
      </p>
      <p className="world__summary prose">{world.publicSummary}</p>
    </article>
  )
}
