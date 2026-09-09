import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { CanonBlockNotice } from '../components/CanonBlockNotice'
import { formatDateTime } from '../lib/dates'
import { CANON_LABELS } from '../lore/types'
import { listTrash, restoreFromTrash } from '../trash/api'
import type { TrashPage, TrashedEntity } from '../trash/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: TrashPage } | { kind: 'error'; message: string }

/**
 * What this universe has thrown away, and the one thing to do about it.
 *
 * A list, not a dashboard. Nothing is counted, charted or summarised here: the question the
 * screen answers is "what did I lose, and can I have it back", and every other fact about an
 * entry is readable on its own page the moment it returns.
 *
 * There is no permanent delete, on purpose. Phase 019 deferred it, so the only way out of
 * this screen is back into the world.
 */
export default function UniverseTrash() {
  const { universe } = useOutletContext<WorkspaceContext>()

  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [restoring, setRestoring] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(
    (signal?: AbortSignal) => {
      listTrash(universe.id, page, signal)
        .then((result) => setState({ kind: 'ready', page: result }))
        .catch((error: unknown) => {
          if (signal?.aborted) return
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Could not open the Trash.',
          })
        })
    },
    [universe.id, page],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  async function restore(entry: TrashedEntity) {
    setRestoring(entry.id)
    setBlocked(null)
    setMessage(null)

    try {
      await restoreFromTrash(universe.id, entry.id)
      setMessage(`“${entry.name}” is back in your lore.`)

      // A restore empties the last row of a page as often as not, so step back rather than
      // leave the author looking at an empty page that used to have something on it.
      const remaining = state.kind === 'ready' ? state.page.items.length - 1 : 0
      if (remaining === 0 && page > 1) {
        setPage((current) => current - 1)
      } else {
        load()
      }
    } catch (error: unknown) {
      // The entry is untouched either way: a refused restore is rolled back whole, so it is
      // still in the list below and can be tried again once the objection is dealt with.
      const findings = blockingFindingsOf(error)
      if (findings) {
        setBlocked(findings)
      } else {
        setMessage(
          error instanceof Error ? error.message : `“${entry.name}” could not be restored.`,
        )
      }
      load()
    } finally {
      setRestoring(null)
    }
  }

  const result = state.kind === 'ready' ? state.page : null

  return (
    <article className="trash">
      <header className="trash__head">
        <h2 className="trash__title">Trash</h2>
        <p className="trash__lede">
          Entries you removed. Nothing here has been erased — the article, the fields, the history
          and every connection are still stored, and restoring puts them all back.
        </p>
      </header>

      {blocked ? (
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={false} />
      ) : null}

      {message ? (
        <p className="notice" role="status" data-testid="trash-message">
          {message}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Looking through the Trash…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button className="button button--quiet" type="button" onClick={() => load()}>
            Try again
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="trash__list" data-testid="trash-list">
          {result.items.map((entry) => (
            <li className="trash__row" key={entry.id} data-testid={`trash-row-${entry.name}`}>
              <span
                className="trash__dot"
                aria-hidden="true"
                style={
                  entry.entityTypeAccentColor
                    ? { background: entry.entityTypeAccentColor }
                    : undefined
                }
              />
              <div className="trash__what">
                <p className="trash__name">{entry.name}</p>
                <p className="trash__meta">
                  {entry.entityTypeName} · {CANON_LABELS[entry.canonStatus]} · removed{' '}
                  {formatDateTime(entry.trashedAt)}
                </p>
              </div>
              <button
                className="button button--quiet"
                type="button"
                disabled={restoring !== null}
                onClick={() => void restore(entry)}
                data-testid={`restore-${entry.name}`}
              >
                {restoring === entry.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <div className="empty" data-testid="trash-empty">
          <p className="empty__line">The Trash is empty.</p>
          <p className="empty__hint">Anything you remove from your lore waits here.</p>
        </div>
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--quiet"
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
            className="button button--quiet"
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
