import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { PageHeader } from './PageHeader'
import { Quoted } from './NameList'
import { listAllUniverses, listIdeas, restoreIdea } from '../ideas/api'
import type { IdeaPage, IdeaSummary } from '../ideas/types'
import { formatDate, formatDateTime } from '../lib/dates'
import type { UniverseSummary } from '../universes/types'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: IdeaPage } | { kind: 'error'; message: string }

/** What the last restore did, and the way to the idea it brought back. */
interface Outcome {
  text: ReactNode
  link: { to: string; label: ReactNode } | null
}

/** What an idea's editor says it did before handing back to the list. */
export interface IdeasListNotice {
  deleted?: { id: string; title: string }
}

/** The value of the Show filter that means ideas in no universe. Never a universe id. */
const UNASSIGNED = 'unassigned'

interface IdeasBrowserProps {
  /** The universe this list is inside, or null for every idea the account has. */
  universe: { id: string; name: string } | null
  /** Where this list lives; an idea opens at `${basePath}/${id}` and a new one at `${basePath}/new`. */
  basePath: string
}

function referenceCountLabel(total: number) {
  return total === 1 ? '1 reference' : `${total} references`
}

/**
 * A list of ideas: every idea the account has, or one universe's. Most recently updated first, so nothing has to be
 * organised. The filter is where the list is kept - in the address - so Back, Forward and a reload keep it.
 *
 * Globally, the Show filter narrows to unassigned ideas or to one universe's, and each row says which in words: "No
 * universe", or the universe's name. Inside a universe the list is that universe's ideas. Either way, Recently deleted
 * lists the ideas deleted from the same place, with Restore.
 */
export function IdeasBrowser({ universe, basePath }: IdeasBrowserProps) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const headingId = useId()
  const searchId = useId()
  const showId = useId()

  const view = params.get('view') === 'deleted' ? 'deleted' : 'live'
  const show = universe ? universe.id : (params.get('show') ?? '')
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const [typed, setTyped] = useState(search)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const outcomeRef = useRef<HTMLDivElement>(null)

  // A deletion reported by the editor that sent the author here.
  const notice = (location.state as IdeasListNotice | null)?.deleted ?? null

  /** Writes filters into the address, dropping empty ones, and starts from the first page unless told otherwise. */
  const update = useCallback(
    (change: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(change)) {
            if (value === null || value === '') next.delete(key)
            else next.set(key, value)
          }
          if (!('page' in change)) next.delete('page')
          return next
        },
        // Typing is one filter being written, not a history entry per pause.
        { replace: 'q' in change },
      )
    },
    [setParams],
  )

  // The box follows the address when the address moves on its own - Back, Forward, a link - and never overwrites what is
  // being typed with the filter it just wrote.
  const written = useRef(search)
  useEffect(() => {
    if (search !== written.current) setTyped(search)
    written.current = search
  }, [search])

  // Typing settles before the address - and so the request - changes.
  useEffect(() => {
    if (typed === search) return
    const timer = setTimeout(() => {
      const next = typed.trim() === '' ? '' : typed
      written.current = next
      update({ q: next })
    }, 200)
    return () => {
      clearTimeout(timer)
    }
  }, [typed, search, update])

  useEffect(() => {
    if (universe) return
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => {
      controller.abort()
    }
  }, [universe])

  useEffect(() => {
    const controller = new AbortController()

    listIdeas(
      {
        universeId: show !== '' && show !== UNASSIGNED ? show : null,
        unassigned: show === UNASSIGNED,
        deleted: view === 'deleted',
        search,
        page,
      },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: 'The ideas could not be read.' })
      })

    return () => {
      controller.abort()
    }
  }, [show, view, search, page, reads])

  useEffect(() => {
    if (outcome) outcomeRef.current?.focus()
  }, [outcome])

  async function restore(idea: IdeaSummary) {
    setRestoring(idea.id)
    setOutcome(null)
    try {
      const restored = await restoreIdea(idea.id)
      setOutcome({
        text: restored.universe ? (
          <>
            <Quoted text={restored.title} /> is back in your ideas, in{' '}
            <Quoted text={restored.universe.name} />.
          </>
        ) : (
          <>
            <Quoted text={restored.title} /> is back in your ideas.
          </>
        ),
        link: {
          to: `${basePath}/${restored.id}`,
          label: (
            <>
              Open <Quoted text={restored.title} />
            </>
          ),
        },
      })
    } catch {
      setOutcome({
        text: (
          <>
            <Quoted text={idea.title} /> could not be restored. Try again.
          </>
        ),
        link: null,
      })
    } finally {
      setRestoring(null)
      setReads((current) => current + 1)
    }
  }

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim() !== '' || (!universe && show !== '')
  const deleted = view === 'deleted'

  return (
    <section className="ideas" aria-labelledby={headingId} data-testid="ideas">
      <PageHeader
        title="Ideas"
        titleId={headingId}
        lede={
          <>
            <p className="ideas__lede">
              {universe ? (
                <>
                  Possibilities for <Quoted text={universe.name} />. An idea is never lore: nothing
                  here changes the world.
                </>
              ) : (
                'Possibilities, kept apart from your lore. An idea can belong to a universe, or to none.'
              )}
            </p>
            {universe ? (
              <p className="ideas__all">
                <Link to="/app/ideas" data-testid="ideas-all">
                  All your ideas
                </Link>
              </p>
            ) : null}
          </>
        }
        actions={
          <Link className="button" to={`${basePath}/new`} data-testid="new-idea">
            <ActionIcon icon={Plus} />
            New idea
          </Link>
        }
      />

      {notice && !deleted ? (
        <div className="notice ideas__notice" data-testid="ideas-deleted-notice">
          <p role="status">
            <Quoted text={notice.title} /> was deleted. It is in Recently deleted, where you can
            restore it.
          </p>
        </div>
      ) : null}

      <div className="controls ideas__controls">
        <div className="controls__search">
          <label className="field__label" htmlFor={searchId}>
            Filter
          </label>
          <input
            id={searchId}
            className="field__input"
            type="search"
            placeholder="Words in a title or body"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="ideas-search"
          />
        </div>

        {universe ? null : (
          <div className="ideas__show">
            <label className="field__label" htmlFor={showId}>
              Show
            </label>
            <select
              id={showId}
              className="field__input field__input--select"
              value={show}
              onChange={(event) => update({ show: event.target.value })}
              data-testid="ideas-show"
            >
              <option value="">All ideas</option>
              <option value={UNASSIGNED}>No universe</option>
              {show !== '' && show !== UNASSIGNED && !universes?.some((one) => one.id === show) ? (
                <option value={show}>A universe</option>
              ) : null}
              {(universes ?? []).map((one) => (
                <option key={one.id} value={one.id}>
                  {one.isArchived ? `${one.name} (archived)` : one.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="segmented" role="group" aria-label="Which ideas">
          <button
            type="button"
            className="segmented__option"
            aria-pressed={!deleted}
            onClick={() => update({ view: null })}
            data-testid="ideas-view-live"
          >
            Ideas
          </button>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={deleted}
            onClick={() => update({ view: 'deleted' })}
            data-testid="ideas-view-deleted"
          >
            Recently deleted
          </button>
        </div>
      </div>

      {outcome ? (
        <div className="notice ideas__outcome" ref={outcomeRef} tabIndex={-1}>
          <p role="status" data-testid="ideas-message">
            {outcome.text}
          </p>
          {outcome.link ? (
            <Link to={outcome.link.to} data-testid="ideas-open-restored">
              {outcome.link.label}
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Gathering ideas…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="ideas-load-error">
          <p>{state.message}</p>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((current) => current + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="idealist" data-testid="idea-list">
          {result.items.map((idea) => (
            <li
              className="idearow"
              key={idea.id}
              data-testid="idea-row"
              data-title={idea.title}
              data-universe={idea.universe?.name ?? ''}
            >
              <div className="idearow__main">
                {deleted ? (
                  <p className="idearow__title">
                    <bdi>{idea.title}</bdi>
                  </p>
                ) : (
                  <Link
                    className="idearow__title"
                    to={`${basePath}/${idea.id}`}
                    data-testid="idea-open"
                  >
                    <bdi>{idea.title}</bdi>
                  </Link>
                )}
                {idea.excerpt ? (
                  <p className="idearow__excerpt prose" data-testid="idea-excerpt">
                    {idea.excerpt}
                    {idea.isExcerptShortened ? '…' : null}
                  </p>
                ) : null}
                <p className="idearow__meta">
                  {universe ? null : idea.universe ? (
                    <span className="idearow__universe" data-testid="idea-universe-label">
                      <span
                        className="idearow__seal"
                        aria-hidden="true"
                        style={
                          idea.universe.accentColor
                            ? { background: idea.universe.accentColor }
                            : undefined
                        }
                      />
                      {idea.universe.name}
                    </span>
                  ) : (
                    <span
                      className="idearow__universe idearow__universe--none"
                      data-testid="idea-universe-label"
                    >
                      No universe
                    </span>
                  )}
                  {deleted && idea.deletedAt ? (
                    <span>
                      Deleted{' '}
                      <time dateTime={idea.deletedAt}>{formatDateTime(idea.deletedAt)}</time>
                    </span>
                  ) : (
                    <span>
                      Updated <time dateTime={idea.updatedAt}>{formatDate(idea.updatedAt)}</time>
                    </span>
                  )}
                  {idea.referenceCount > 0 ? (
                    <span>{referenceCountLabel(idea.referenceCount)}</span>
                  ) : null}
                </p>
              </div>
              {deleted ? (
                <button
                  className="button button--quiet idearow__restore"
                  type="button"
                  disabled={restoring !== null}
                  onClick={() => void restore(idea)}
                  aria-label={`Restore idea “${idea.title}”`}
                  data-testid="idea-restore"
                >
                  {restoring === idea.id ? 'Restoring…' : 'Restore'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <div className="empty" data-testid="ideas-empty">
          {deleted ? (
            <>
              <p className="empty__line">Nothing recently deleted.</p>
              <p className="empty__hint">A deleted idea waits here, whole, until you restore it.</p>
            </>
          ) : isFiltered ? (
            <>
              <p className="empty__line">No ideas match.</p>
              <p className="empty__hint">Try other words, or show all ideas.</p>
            </>
          ) : (
            <>
              <p className="empty__line">No ideas yet.</p>
              <p className="empty__hint">
                “Maybe this city floats.” “What if Mira betrays Arlen?” Keep possibilities here,
                apart from what is true in your world.
              </p>
              <Link
                className="button button--icon empty__action"
                to={`${basePath}/new`}
                data-testid="empty-new-idea"
              >
                <ActionIcon icon={Plus} />
                New idea
              </Link>
            </>
          )}
        </div>
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--quiet"
            type="button"
            disabled={result.page <= 1}
            onClick={() => update({ page: String(result.page - 1) })}
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
            onClick={() => update({ page: String(result.page + 1) })}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  )
}
