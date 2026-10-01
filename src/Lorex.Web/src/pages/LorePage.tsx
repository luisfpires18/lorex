import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
  type To,
} from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ListChecks,
  ListFilter,
  ListPlus,
  Plus,
  Trash2,
} from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { EmptyState } from '../components/EmptyState'
import { EntityCard } from '../components/EntityCard'
import { PageHeader } from '../components/PageHeader'
import { TypeChooser, TypeTreeList } from '../components/TypeTree'
import { useOpenBranches } from '../lore/useOpenBranches'
import { ApiError } from '../lib/api'
import {
  LORE_PAGE_SIZES,
  bulkTrashEntities,
  listEntities,
  listEntityTypes,
  readLorePageSize,
  saveLorePageSize,
} from '../lore/api'
import {
  CANON_LABELS,
  CANON_ORDER,
  type CanonStatusValue,
  type EntityPage,
  type EntityType,
} from '../lore/types'
import { buildTypeTree } from '../lore/typeTree'
import type { MassCreatedState } from './MassCreatePage'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; page: EntityPage } | { kind: 'error' }

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
 * the status replace the entry they are on, so a word typed is not twenty steps of Back.
 *
 * A type is where browsing starts (ADR 0007 amendment, 2026-10-01). There is no "All": with no type chosen the page lists
 * nothing and reads nothing - a search or status in the address waits for a type - and offers the universe's types to
 * choose from. A chosen type shows its whole branch: its own entries and those of every type nested beneath it, each card
 * still naming its own type. A type id the universe does not have - deleted, mistyped, or another world's - is taken out of
 * the address, which leaves nothing chosen; it never widens to every entry.
 */
export default function LorePage() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const [params, setParams] = useSearchParams()
  const filtersId = useId()
  const location = useLocation()
  const navigate = useNavigate()

  // "Created 40 entries." after a mass create: said where the author landed and gone once they move on, then taken out of
  // the history entry, so a reload or a return through Back does not say it again.
  const [arrival] = useState(() => ({
    count: (location.state as Partial<MassCreatedState> | null)?.massCreated ?? null,
    search: location.search,
  }))
  const massCreated = arrival.search === location.search ? arrival.count : null
  useEffect(() => {
    if ((location.state as Partial<MassCreatedState> | null)?.massCreated === undefined) return
    void navigate({ search: location.search }, { replace: true, state: null })
  }, [location.state, location.search, navigate])

  const typeParam = params.get('type')
  const canonStatus = readStatus(params.get('status'))
  const search = params.get('q') ?? ''
  const page = readPage(params.get('page'))

  // Selecting, to move entries to the Trash together. A mode the author turns on, so ordinary browsing carries no
  // checkboxes. What is selected belongs to the page on screen: another page, filter, type or size is another list, so
  // the selection is not carried into it - nothing is ever selected out of sight.
  const [isSelecting, setIsSelecting] = useState(false)
  const [selection, setSelection] = useState<{ scope: string; ids: ReadonlySet<string> }>({
    scope: '',
    ids: new Set(),
  })
  const [isTrashing, setIsTrashing] = useState(false)
  const trashing = useRef(false)
  const [trashFailure, setTrashFailure] = useState<string | null>(null)
  const [trashed, setTrashed] = useState<{ text: string; list: string } | null>(null)

  const [types, setTypes] = useState<EntityType[] | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Entries per page: the author's own preference in this browser, never in the address - a link someone shares opens at
  // their reader's size, not the sender's.
  const [pageSize, setPageSize] = useState(readLorePageSize)

  useEffect(() => {
    const controller = new AbortController()
    listEntityTypes(universe.id, controller.signal)
      .then(setTypes)
      .catch(() => {
        // Without its types Lore has nothing to choose from; the page says so rather than reading every entry.
        if (!controller.signal.aborted) setTypes([])
      })
    return () => {
      controller.abort()
    }
  }, [universe.id])

  const tree = useMemo(() => buildTypeTree(types ?? []), [types])
  const selectedNode = (typeParam && tree.byId.get(typeParam)) || null
  const selectedType = selectedNode?.type ?? null
  const isUnknownType = typeParam !== null && types !== null && selectedType === null
  const inline = useOpenBranches(tree, null)

  // A type this universe does not have is taken out of the address in place, which leaves nothing chosen.
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

  // Only a type of this universe is ever asked for, and only once the types are known.
  const entityTypeId = selectedType?.id ?? null

  useEffect(() => {
    if (entityTypeId === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      listEntities(
        universe.id,
        { search, entityTypeId, includeDescendants: true, canonStatus, tag: null, page, pageSize },
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
  }, [universe.id, search, entityTypeId, canonStatus, page, pageSize, reads])

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

  const typeHref = (typeId: string) => hrefFor(typeId)

  // Nothing chosen is nothing read: whatever the last type's read left behind is not shown.
  const view: LoadState = entityTypeId === null ? { kind: 'idle' } : state
  const result = view.kind === 'ready' ? view.page : null

  const scope = [location.search, pageSize].join('|')
  const listKey = (() => {
    const next = new URLSearchParams(location.search)
    next.delete('page')
    return next.toString()
  })()
  // Another page, filter, type or size drops the selection for good - coming back does not bring it back either. Set while
  // rendering, the way React adjusts state to a changed input, so no frame ever shows the old selection on the new list.
  if (selection.scope !== scope) setSelection({ scope, ids: new Set() })
  const selectedIds = selection.scope === scope ? selection.ids : new Set<string>()
  const pageItems = result?.items ?? []
  const selected = pageItems.filter((item) => selectedIds.has(item.id))

  function toggle(entityId: string) {
    setTrashFailure(null)
    setSelection(() => {
      const next = new Set(selectedIds)
      if (next.has(entityId)) next.delete(entityId)
      else next.add(entityId)
      return { scope, ids: next }
    })
  }

  function selectPage() {
    setTrashFailure(null)
    setSelection({ scope, ids: new Set(pageItems.map((item) => item.id)) })
  }

  function clearSelection() {
    setTrashFailure(null)
    setSelection({ scope, ids: new Set() })
  }

  function stopSelecting() {
    clearSelection()
    setIsSelecting(false)
  }

  /**
   * Moves what is selected to the Trash, all together or not at all, after one question that says what it means: out of
   * Lore, not erased, restorable. A failure leaves every entry where it was, still selected.
   */
  async function trashSelected() {
    const count = selected.length
    if (trashing.current || count === 0) return

    const noun = count === 1 ? 'entry' : 'entries'
    const names = count <= 5 ? `\n\n${selected.map((item) => `“${item.name}”`).join('\n')}` : ''
    if (
      !window.confirm(
        `Move ${count} ${noun} to the Trash?${names}\n\n` +
          `${count === 1 ? 'It leaves' : 'They leave'} Lore, search and pickers, but nothing is erased: ` +
          'articles, fields, history and connections are kept, and each one can be restored from the Trash.',
      )
    ) {
      return
    }

    trashing.current = true
    setIsTrashing(true)
    setTrashFailure(null)
    try {
      await bulkTrashEntities(
        universe.id,
        selected.map((item) => item.id),
      )
      setTrashed({ text: `${count} ${noun} moved to the Trash.`, list: listKey })
      stopSelecting()
      setReads((reads) => reads + 1)
    } catch (error: unknown) {
      setTrashFailure(
        `Nothing was moved. ${error instanceof ApiError ? error.message : 'Try again.'}`,
      )
    } finally {
      trashing.current = false
      setIsTrashing(false)
    }
  }

  // Said on the list it happened in, and still said when an emptied page falls back to the last one there is.
  const trashedNotice = trashed?.list === listKey ? trashed.text : null

  // A page past the last one - a hand-edited address, or entries gone since - lands on the last page there is, in place.
  const pastTheEnd = result !== null && result.totalPages > 0 && page > result.totalPages
  const lastPage = result?.totalPages ?? 1
  useEffect(() => {
    if (!pastTheEnd) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (lastPage > 1) next.set('page', String(lastPage))
        else next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [pastTheEnd, lastPage, setParams])

  /** A new size is a new way of cutting the list: back to its first page, as a filter change is. */
  function changePageSize(next: number) {
    saveLorePageSize(next)
    setPageSize(next)
    update({}, true)
  }

  // Offered once there is more than the smallest page to cut, or once the author has chosen a size.
  const offerPageSize =
    (result?.totalCount ?? 0) > LORE_PAGE_SIZES[0] || pageSize !== LORE_PAGE_SIZES[0]
  const isFiltered = search.trim().length > 0 || canonStatus !== null
  const activeFilters = (search.trim() ? 1 : 0) + (canonStatus !== null ? 1 : 0)
  const createTo = selectedType ? `new?type=${selectedType.id}` : 'new'
  const massCreateTo = selectedType ? `mass-create?type=${selectedType.id}` : 'mass-create'

  return (
    <article className="lore" data-selecting={isSelecting ? 'true' : undefined}>
      <PageHeader
        crumb={
          selectedNode ? (
            <span className="lore__path" data-testid="lore-path">
              <Link to={hrefFor(null)} data-testid="lore-all">
                Lore
              </Link>
              {selectedNode.path.slice(0, -1).map((ancestor) => (
                <Fragment key={ancestor.id}>
                  <span className="lore__pathsep" aria-hidden="true">
                    ›
                  </span>
                  <Link to={hrefFor(ancestor.id)} data-testid="lore-path-type">
                    <bdi>{ancestor.name}</bdi>
                  </Link>
                </Fragment>
              ))}
            </span>
          ) : null
        }
        title={selectedType ? <bdi>{selectedType.name}</bdi> : 'Lore'}
        actions={
          <>
            {/* Many names at once: beside New, never above it - the everyday way in stays the primary one. */}
            <Link
              className="button button--secondary lore__masscreate"
              to={massCreateTo}
              title="Mass create"
              data-testid="mass-create"
            >
              <ActionIcon icon={ListPlus} />
              <span className="lore__masscreatelabel">Mass create</span>
            </Link>
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
          </>
        }
      >
        <div className="lore__nav">
          <TypeChooser tree={tree} selected={selectedNode} hrefFor={typeHref} />
          {selectedType && (pageItems.length > 0 || isSelecting) ? (
            <button
              className="button button--secondary lore__select"
              type="button"
              aria-pressed={isSelecting}
              onClick={() => (isSelecting ? stopSelecting() : setIsSelecting(true))}
              data-testid="lore-select"
            >
              <ActionIcon icon={ListChecks} />
              Select
            </button>
          ) : null}
          {selectedType ? (
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
              {activeFilters > 0 ? (
                <span className="lore__filtercount">{activeFilters}</span>
              ) : null}
            </button>
          ) : null}
        </div>
      </PageHeader>

      {/* Filters narrow a type's entries, so they wait for one: nothing typed here can widen to the whole universe. */}
      <div
        hidden={!selectedType}
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

        {offerPageSize ? (
          <div className="lore__pagesize">
            <label className="lore__pagesizelabel" htmlFor="lore-page-size">
              Items per page
            </label>
            <select
              id="lore-page-size"
              className="field__input lore__pagesizeselect"
              value={pageSize}
              onChange={(event) => changePageSize(Number(event.target.value))}
              data-testid="lore-page-size"
            >
              {LORE_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {trashedNotice ? (
        <p className="lore__created" role="status" data-testid="lore-trashed">
          <ActionIcon icon={Check} />
          {trashedNotice} <Link to={`/app/universes/${universe.id}/trash`}>Open the Trash</Link>
        </p>
      ) : null}

      {massCreated !== null ? (
        <p className="lore__created" role="status" data-testid="lore-mass-created">
          <ActionIcon icon={Check} />
          Created {massCreated} {massCreated === 1 ? 'entry' : 'entries'}.
        </p>
      ) : null}

      {types !== null && !selectedType && !isUnknownType ? (
        <section
          className="lore__choose"
          aria-labelledby="lore-choose-title"
          data-testid="lore-choose"
        >
          <h2 className="lore__choosetitle" id="lore-choose-title">
            {types.length > 0
              ? 'Choose a type to browse your lore.'
              : 'This universe has no types yet.'}
          </h2>
          {types.length > 0 ? (
            <>
              <p className="lore__choosehint">
                A type shows its own entries and those of every type nested inside it.
              </p>
              <nav className="typetree lore__typetree" aria-label="Lore types">
                <TypeTreeList
                  nodes={tree.roots}
                  selectedId={null}
                  ancestorIds={new Set()}
                  hrefFor={typeHref}
                  open={inline.open}
                  onToggle={inline.toggle}
                />
              </nav>
            </>
          ) : (
            <p className="lore__choosehint">
              Every entry has a type.{' '}
              <Link to={`/app/universes/${universe.id}/types`}>Add one on Types</Link>.
            </p>
          )}
        </section>
      ) : null}

      {view.kind === 'loading' ? (
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

      {view.kind === 'error' ? (
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

      {selectedType && result && result.items.length > 0 ? (
        <ul className="cardgrid lore__grid" data-testid="entity-grid">
          {result.items.map((entity) => (
            <li key={entity.id}>
              <EntityCard
                universeId={universe.id}
                entity={entity}
                selection={
                  isSelecting
                    ? { checked: selectedIds.has(entity.id), onToggle: () => toggle(entity.id) }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : null}

      {selectedType && result && result.items.length === 0 && isFiltered ? (
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

      {selectedType && result && result.items.length === 0 && !isFiltered ? (
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

      {selectedType && result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
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
            disabled={page >= result.totalPages}
            onClick={() => goToPage(page + 1)}
          >
            Next
            <ActionIcon icon={ArrowRight} />
          </button>
        </nav>
      ) : null}

      {isSelecting ? (
        <footer className="actionbar lore__selectbar" data-testid="lore-selectbar">
          <p className="actionbar__status" role="status" data-testid="lore-selected-count">
            {selected.length === 0
              ? 'Select entries on this page to move them to the Trash.'
              : `${selected.length} selected`}
          </p>
          <div className="actionbar__actions">
            <button
              className="button"
              type="button"
              onClick={() => void trashSelected()}
              disabled={selected.length === 0 || isTrashing}
              aria-busy={isTrashing || undefined}
              data-testid="lore-trash-selected"
            >
              <ActionIcon icon={Trash2} />
              {isTrashing
                ? 'Moving…'
                : selected.length > 0
                  ? `Move ${selected.length} to Trash`
                  : 'Move to Trash'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={selectPage}
              disabled={pageItems.length === 0 || selected.length === pageItems.length}
              data-testid="lore-select-page"
            >
              Select page
            </button>
            <button
              className="button button--text"
              type="button"
              onClick={clearSelection}
              disabled={selected.length === 0}
              data-testid="lore-clear-selection"
            >
              Clear selection
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={stopSelecting}
              data-testid="lore-select-done"
            >
              Done
            </button>
          </div>
          {trashFailure ? (
            <p className="lore__trashfailure" role="alert" data-testid="lore-trash-failure">
              {trashFailure}
            </p>
          ) : null}
        </footer>
      ) : null}
    </article>
  )
}
