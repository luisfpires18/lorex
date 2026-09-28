import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { listPublicUniverses, worldPath, type PublicUniversePage } from '../portal/api'
import { categoryLabel, genreLabel } from '../publishing/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: PublicUniversePage }
  | { kind: 'error'; message: string }

/**
 * Explore, as a plain list of the universes their authors have published - real ones only, most recently
 * published first. The route and the data are this task's; the portal's own design is the next one's, which
 * replaces this markup rather than restyling it.
 */
export default function ExplorePage() {
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    listPublicUniverses(page, controller.signal)
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'The public worlds could not be loaded.',
        })
      })
    return () => {
      controller.abort()
    }
  }, [page])

  const result = state.kind === 'ready' ? state.page : null

  return (
    <article className="explore" data-testid="explore">
      <h1 className="explore__title">Explore worlds</h1>
      <p className="explore__lede">Universes their authors have chosen to publish.</p>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Gathering worlds…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
        </div>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState testId="explore-empty" title="No worlds have been published yet." />
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="explore__list" data-testid="explore-list">
          {result.items.map((world) => (
            <li className="explore__item" key={world.slug}>
              <img
                className="explore__card"
                src={world.cardImageUrl}
                alt=""
                width={960}
                height={600}
                loading="lazy"
              />
              <h2 className="explore__name">
                <Link to={worldPath(world.slug)}>
                  <bdi>{world.name}</bdi>
                </Link>
              </h2>
              <p className="explore__facts">
                {categoryLabel(world.category)} · {world.genres.map(genreLabel).join(', ')}
              </p>
              <p className="explore__author">
                by <bdi>{world.authorDisplayName}</bdi>
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span className="pager__position">
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </article>
  )
}
