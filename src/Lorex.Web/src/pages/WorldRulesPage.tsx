import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { formatDate } from '../lib/dates'
import { listWorldRules } from '../worldRules/api'
import type { WorldRulePage } from '../worldRules/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: WorldRulePage } | { kind: 'error'; message: string }

/** What a rule's editor says it did before handing back to the list. */
export interface WorldRulesListNotice {
  deleted?: { id: string; title: string }
}

/**
 * A universe's World Rules: explicit statements, in the author's words, about how the world works (ADR 0033).
 *
 * A rule book, not a board. Rules are listed by title, so a rule's place says nothing about how much it matters, and each
 * row is its title and a line of what it says. A rule's words are never read; a row says only whether the author gave the rule
 * a timeline check (ADR 0034), and what that check finds is on the rule itself. The page lives in the address, so Back and a
 * reload keep it.
 */
export default function WorldRulesPage() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const headingId = useId()

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const basePath = `/app/universes/${universe.id}/world-rules`
  const trashPath = `/app/universes/${universe.id}/trash`

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)

  // A deletion reported by the editor that sent the author here.
  const notice = (location.state as WorldRulesListNotice | null)?.deleted ?? null

  useEffect(() => {
    const controller = new AbortController()

    listWorldRules(universe.id, page, controller.signal)
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: 'The rules could not be read.' })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, page, reads])

  function goToPage(next: number) {
    setParams((current) => {
      const updated = new URLSearchParams(current)
      if (next <= 1) updated.delete('page')
      else updated.set('page', String(next))
      return updated
    })
  }

  const result = state.kind === 'ready' ? state.page : null

  return (
    <section className="rules" aria-labelledby={headingId} data-testid="world-rules">
      <header className="chron__head rules__head">
        <div>
          <h2 className="chron__title" id={headingId}>
            World Rules
          </h2>
          <p className="chron__lede">
            Explicit statements about how this universe works, kept exactly as you write them. Lorex
            never reads their words; only a timeline check you give a rule is counted.
          </p>
        </div>
        <Link className="button button--icon" to={`${basePath}/new`} data-testid="new-world-rule">
          <ActionIcon icon={Plus} />
          New rule
        </Link>
      </header>

      {notice ? (
        <div className="notice rules__notice" data-testid="world-rules-deleted-notice">
          <p role="status">
            “{notice.title}” was moved to the Trash.{' '}
            <Link to={trashPath}>Restore it from the Trash</Link> if you need it back.
          </p>
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Gathering rules…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="world-rules-load-error">
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
        <ul className="rulelist" data-testid="world-rule-list">
          {result.items.map((rule) => (
            <li
              className="rulerow"
              key={rule.id}
              data-testid="world-rule-row"
              data-title={rule.title}
            >
              <Link
                className="rulerow__title"
                to={`${basePath}/${rule.id}`}
                data-testid="world-rule-open"
              >
                <bdi>{rule.title}</bdi>
              </Link>
              {rule.excerpt ? (
                <p className="rulerow__excerpt" dir="auto" data-testid="world-rule-excerpt">
                  {rule.excerpt}
                  {rule.isExcerptShortened ? '…' : null}
                </p>
              ) : null}
              <p className="rulerow__meta">
                {rule.hasCheck ? (
                  <span className="rulerow__check" data-testid="world-rule-has-check">
                    Checked against the timeline ·{' '}
                  </span>
                ) : null}
                Updated <time dateTime={rule.updatedAt}>{formatDate(rule.updatedAt)}</time>
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 && result.totalCount === 0 ? (
        <div className="empty" data-testid="world-rules-empty">
          <p className="empty__line">No world rules yet.</p>
          <p className="empty__hint">
            World Rules define explicit constraints for how this universe works: “Teleportation
            cannot cross the Veil.” “A bonded dragon dies if its rider dies.”
          </p>
          <Link
            className="button button--icon empty__action"
            to={`${basePath}/new`}
            data-testid="empty-new-world-rule"
          >
            <ActionIcon icon={Plus} />
            New rule
          </Link>
        </div>
      ) : null}

      {result && result.items.length === 0 && result.totalCount > 0 ? (
        <div className="empty" data-testid="world-rules-page-empty">
          <p className="empty__line">Nothing on this page.</p>
          <p className="empty__hint">
            <button className="button button--quiet" type="button" onClick={() => goToPage(1)}>
              Go to the first page
            </button>
          </p>
        </div>
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--quiet"
            type="button"
            disabled={result.page <= 1}
            onClick={() => goToPage(result.page - 1)}
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
            onClick={() => goToPage(result.page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  )
}
