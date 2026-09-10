import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { EntityCard } from '../components/EntityCard'
import { listEntities, listEntityTypes } from '../lore/api'
import {
  CANON_LABELS,
  CANON_ORDER,
  type CanonStatusValue,
  type EntityPage,
  type EntityType,
} from '../lore/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: EntityPage } | { kind: 'error'; message: string }

export default function LorePage() {
  const { universe } = useOutletContext<WorkspaceContext>()

  const [types, setTypes] = useState<EntityType[]>([])
  const [search, setSearch] = useState('')
  const [entityTypeId, setEntityTypeId] = useState<string | null>(null)
  const [canonStatus, setCanonStatus] = useState<CanonStatusValue | null>(null)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    listEntityTypes(universe.id, controller.signal)
      .then(setTypes)
      .catch(() => {
        /* The browser still works without the type filter. */
      })
    return () => {
      controller.abort()
    }
  }, [universe.id])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      listEntities(
        universe.id,
        { search, entityTypeId, canonStatus, tag: null, page },
        controller.signal,
      )
        .then((result) => setState({ kind: 'ready', page: result }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Could not load this universe.',
          })
        })
    }, 150)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universe.id, search, entityTypeId, canonStatus, page])

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim().length > 0 || entityTypeId !== null || canonStatus !== null

  return (
    <article className="lore">
      <header className="lore__head">
        <h2 className="lore__title">Lore</h2>
        <Link className="button" to="new" data-testid="new-entity">
          New entry
        </Link>
      </header>

      <div className="controls">
        <div className="controls__search">
          <label className="field__label" htmlFor="lore-search">
            Search
          </label>
          <input
            id="lore-search"
            className="field__input"
            type="search"
            placeholder="Name, alias, summary or article"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="controls__filters">
          <div className="field">
            <label className="field__label" htmlFor="lore-type">
              Type
            </label>
            <select
              id="lore-type"
              className="field__input field__input--select"
              value={entityTypeId ?? ''}
              onChange={(event) => {
                setEntityTypeId(event.target.value || null)
                setPage(1)
              }}
            >
              <option value="">Every type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="lore-canon">
              Status
            </label>
            <select
              id="lore-canon"
              className="field__input field__input--select"
              value={canonStatus ?? ''}
              onChange={(event) => {
                setCanonStatus(
                  event.target.value === ''
                    ? null
                    : (Number(event.target.value) as CanonStatusValue),
                )
                setPage(1)
              }}
            >
              <option value="">Any status</option>
              {CANON_ORDER.map((status) => (
                <option key={status} value={status}>
                  {CANON_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Reading the archive…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p className="notice notice--error" role="alert">
          {state.message}
        </p>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="dossiers" data-testid="entity-grid">
          {result.items.map((entity) => (
            <li key={entity.id}>
              <EntityCard universeId={universe.id} entity={entity} />
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <div className="empty" data-testid="entity-empty">
          <p className="empty__line">
            {isFiltered ? 'Nothing matches that.' : 'This world has no entries yet.'}
          </p>
          <p className="empty__hint">
            {isFiltered
              ? 'Loosen the search or the filters.'
              : 'Write the first one, and the rest will have something to point at.'}
          </p>
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
