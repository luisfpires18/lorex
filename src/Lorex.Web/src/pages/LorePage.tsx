import { useEffect, useId, useState } from 'react'
import { Link, useOutletContext, useSearchParams, type To } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ListFilter, Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { EmptyState } from '../components/EmptyState'
import { EntityCard } from '../components/EntityCard'
import { PageHeader } from '../components/PageHeader'
import { TypeSwitcher } from '../components/TypeSwitcher'
import { listEntities, listEntityTypes } from '../lore/api'
import {
  CANON_LABELS,
  CANON_ORDER,
  type CanonStatusValue,
  type EntityPage,
  type EntityType,
} from '../lore/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState = { kind: 'loading' } | { kind: 'ready'; page: EntityPage } | { kind: 'error' }

/** How many card shapes stand in for the first page while it is read. */
const SKELETON_CARDS = 6

function readStatus(value: string | null): CanonStatusValue | null {
  return value === '0' || value === '1' || value === '2'
    ? (Number(value) as CanonStatusValue)
    : null
}

function readPage(value: string | null) {
  const page = Number(value)
  return Number.isInteger(page) && page > 1 ? page : 1
}

/**
 * The Lore browser. Where the author is - which type, which status, what is typed in the filter,
 * which page - is the address and nothing else: `lore?type=<id>&status=<0|1|2>&q=<text>&page=<n>`.
 *
 * Choosing a type or a page is a move, so it is a history entry Back returns through; typing and
 * the status replace the entry they are on, so a word typed is not twenty steps of Back. A type id
 * the universe does not have - deleted, mistyped, or another world's - falls back to All.
 */
export default function LorePage() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const [params, setParams] = useSearchParams()
  const filtersId = useId()

  const typeParam = params.get('type')
  const canonStatus = readStatus(params.get('status'))
  const search = params.get('q') ?? ''
  const page = readPage(params.get('page'))

  const [types, setTypes] = useState<EntityType[] | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listEntityTypes(universe.id, controller.signal)
      .then(setTypes)
      .catch(() => {
        // Browsing still works without the type navigation: every entry, under All.
        if (!controller.signal.aborted) setTypes([])
      })
    return () => {
      controller.abort()
    }
  }, [universe.id])

  const selectedType = types?.find((type) => type.id === typeParam) ?? null
  const isUnknownType = typeParam !== null && types !== null && selectedType === null

  // A type this universe does not have is read as All, and the address is corrected in place.
  useEffect(() => {
    if (!isUnknownType) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('type')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [isUnknownType, setParams])

  const entityTypeId = isUnknownType ? null : typeParam

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      listEntities(
        universe.id,
        { search, entityTypeId, canonStatus, tag: null, page },
        controller.signal,
      )
        .then((result) => setState({ kind: 'ready', page: result }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ kind: 'error' })
        })
    }, 150)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universe.id, search, entityTypeId, canonStatus, page, reads])

  /** The address with these changes, always back on the first page unless a page is given. */
  function changed(from: URLSearchParams, changes: Record<string, string | null>) {
    const next = new URLSearchParams(from)
    next.delete('page')
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    return next
  }

  const withParams = (changes: Record<string, string | null>) => changed(params, changes)

  /** Written against the address as it is when the change lands, not as it was when drawn. */
  const update = (changes: Record<string, string | null>, replace: boolean) =>
    setParams((current) => changed(current, changes), { replace })

  /** A page is a move: Back returns to the page before. */
  function goToPage(next: number) {
    update({ page: next > 1 ? String(next) : null }, false)
    window.scrollTo({ top: 0 })
  }

  const hrefFor = (typeId: string | null): To => {
    const next = withParams({ type: typeId }).toString()
    return { search: next ? `?${next}` : '' }
  }

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim().length > 0 || canonStatus !== null
  const activeFilters = (search.trim() ? 1 : 0) + (canonStatus !== null ? 1 : 0)
  const createTo = selectedType ? `new?type=${selectedType.id}` : 'new'

  return (
    <article className="lore">
      <PageHeader
        crumb={
          selectedType ? (
            <Link to={hrefFor(null)} data-testid="lore-all">
              Lore
            </Link>
          ) : null
        }
        title={selectedType ? <bdi>{selectedType.name}</bdi> : 'Lore'}
        actions={
          <Link
            className="button lore__create"
            to={createTo}
            aria-label={selectedType ? `New ${selectedType.name}` : 'New entry'}
            data-testid="new-entity"
          >
            <ActionIcon icon={Plus} />
            <span className="lore__createlabel">
              New {selectedType ? <bdi>{selectedType.name}</bdi> : 'entry'}
            </span>
          </Link>
        }
      >
        <div className="lore__nav">
          <TypeSwitcher types={types ?? []} selected={selectedType} hrefFor={hrefFor} />
          <button
            className="button button--secondary lore__filtertoggle"
            type="button"
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => setFiltersOpen((open) => !open)}
            data-testid="lore-filters-toggle"
          >
            <ActionIcon icon={ListFilter} />
            Filters
            {activeFilters > 0 ? <span className="lore__filtercount">{activeFilters}</span> : null}
          </button>
        </div>
      </PageHeader>

      <div
        className="lore__filters"
        id={filtersId}
        data-open={filtersOpen ? 'true' : 'false'}
        data-testid="lore-filters"
      >
        <div className="lore__search">
          <label className="visually-hidden" htmlFor="lore-search">
            Filter entries
          </label>
          <ListFilter className="lore__searchicon" aria-hidden="true" focusable="false" />
          <input
            id="lore-search"
            className="field__input lore__searchinput"
            type="search"
            placeholder="Filter by name, alias, summary or article"
            value={search}
            onChange={(event) => update({ q: event.target.value }, true)}
          />
        </div>

        <div className="segmented" role="group" aria-label="Status">
          <button
            className="segmented__option"
            type="button"
            aria-pressed={canonStatus === null}
            onClick={() => update({ status: null }, true)}
          >
            Any status
          </button>
          {CANON_ORDER.map((status) => (
            <button
              key={status}
              className="segmented__option"
              type="button"
              aria-pressed={canonStatus === status}
              onClick={() => update({ status: String(status) }, true)}
            >
              {CANON_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      {state.kind === 'loading' ? (
        <div className="lore__loading">
          <p className="visually-hidden" role="status">
            Reading the archive…
          </p>
          <ul className="cardgrid lore__skeleton" aria-hidden="true">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <li className="skeletoncard" key={index}>
                <span className="skeleton skeletoncard__tile" />
                <span className="skeletoncard__lines">
                  <span className="skeleton skeletoncard__line" />
                  <span className="skeleton skeletoncard__line skeletoncard__line--short" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="lore-load-error">
          <p>The lore could not be read.</p>
          <button
            className="button button--secondary"
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

      {result && result.items.length > 0 ? (
        <ul className="cardgrid lore__grid" data-testid="entity-grid">
          {result.items.map((entity) => (
            <li key={entity.id}>
              <EntityCard universeId={universe.id} entity={entity} />
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 && isFiltered ? (
        <EmptyState
          testId="entity-empty"
          title="Nothing matches that."
          hint={
            selectedType ? (
              <>
                No <bdi>{selectedType.name}</bdi> entry matches the filter and status chosen.
              </>
            ) : (
              'No entry matches the filter and status chosen.'
            )
          }
          action={
            <Link
              className="button button--secondary"
              to={{
                search: (() => {
                  const next = withParams({ q: null, status: null }).toString()
                  return next ? `?${next}` : ''
                })(),
              }}
              replace
              data-testid="lore-clear-filters"
            >
              Clear filters
            </Link>
          }
        />
      ) : null}

      {result && result.items.length === 0 && !isFiltered ? (
        <EmptyState
          testId="entity-empty"
          title={
            selectedType ? (
              <>
                Nothing filed under <bdi>{selectedType.name}</bdi> yet.
              </>
            ) : (
              'This world has no entries yet.'
            )
          }
          hint="Write the first one, and the rest will have something to point at."
          action={
            <Link className="button" to={createTo} data-testid="empty-new-entity">
              <ActionIcon icon={Plus} />
              New {selectedType ? <bdi>{selectedType.name}</bdi> : 'entry'}
            </Link>
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => goToPage(result.page - 1)}
          >
            <ActionIcon icon={ArrowLeft} />
            Previous
          </button>
          <span className="pager__position">
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => goToPage(result.page + 1)}
          >
            Next
            <ActionIcon icon={ArrowRight} />
          </button>
        </nav>
      ) : null}
    </article>
  )
}
