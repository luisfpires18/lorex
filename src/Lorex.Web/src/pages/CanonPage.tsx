import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  dismissCanonConflict,
  evaluateCanonIntegrity,
  listCanonConflicts,
  reopenCanonConflict,
} from '../canon/api'
import {
  CanonConflictStatus,
  CONFLICT_STATUS_LABELS,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../canon/types'
import type {
  CanonConflictPage,
  CanonConflictStatusValue,
  CanonEvaluation,
  CanonSeverityValue,
} from '../canon/types'
import { ConflictEntry } from '../components/ConflictEntry'
import { ApiError } from '../lib/api'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: CanonConflictPage }
  | { kind: 'error'; message: string }

/**
 * The status filters, in the order an author works through them. `null` is deliberately
 * not offered as "Any": the three states mean different things and mixing them puts a
 * closed finding next to a live one with nothing but a chip to tell them apart.
 */
const STATUS_TABS: CanonConflictStatusValue[] = [
  CanonConflictStatus.Pending,
  CanonConflictStatus.Dismissed,
  CanonConflictStatus.Resolved,
]

/**
 * The review screen for one universe.
 *
 * It opens on what is open, because that is the only list with anything to do in it. The
 * rest of the lifecycle is reachable but not in the way: dismissals are the author's own
 * record, and resolutions are evaluation's.
 */
export default function CanonPage() {
  const { universe } = useOutletContext<WorkspaceContext>()

  const [status, setStatus] = useState<CanonConflictStatusValue>(CanonConflictStatus.Pending)
  const [severity, setSeverity] = useState<CanonSeverityValue | null>(null)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reloads, setReloads] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<CanonEvaluation | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    listCanonConflicts(universe.id, { severity, status, page }, controller.signal)
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not read these findings.',
        })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, severity, status, page, reloads])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  const result = state.kind === 'ready' ? state.page : null

  async function evaluate() {
    setMessage(null)
    setIsEvaluating(true)
    try {
      setEvaluation(await evaluateCanonIntegrity(universe.id))
      setPage(1)
      reload()
    } catch (error: unknown) {
      setMessage(
        error instanceof ApiError ? error.message : 'This universe could not be evaluated.',
      )
    } finally {
      setIsEvaluating(false)
    }
  }

  /**
   * A transition answers with the conflict as it now stands, but the list it belongs to is
   * filtered by status, so the row usually has to leave. Reloading is both simpler and
   * more honest than patching it in place under a filter it no longer matches.
   */
  async function transition(conflictId: string, action: 'dismiss' | 'reopen') {
    setMessage(null)
    setBusyId(conflictId)
    try {
      await (action === 'dismiss'
        ? dismissCanonConflict(universe.id, conflictId)
        : reopenCanonConflict(universe.id, conflictId))

      if (result && result.items.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        reload()
      }
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'That finding could not be changed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <article className="integrity">
      <header className="integrity__head">
        <div>
          <h2 className="integrity__title">Canon integrity</h2>
          <p className="integrity__lede">
            What this world says twice, and differently. Findings are derived from your lore and
            change nothing in it.
          </p>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => void evaluate()}
          disabled={isEvaluating}
          data-testid="evaluate-canon"
        >
          {isEvaluating ? 'Evaluating…' : 'Evaluate'}
        </button>
      </header>

      <p className="integrity__law">
        Only a <strong>High</strong> finding refuses a save, and only the save that would create
        one. A world already carrying one stays editable everywhere else. Medium and Low are
        reported and never block.
      </p>

      <div className="controls">
        <div className="controls__filters">
          <div className="segmented" role="group" aria-label="Status">
            {STATUS_TABS.map((option) => (
              <button
                key={option}
                type="button"
                className="segmented__option"
                aria-pressed={status === option}
                onClick={() => {
                  setStatus(option)
                  setPage(1)
                }}
                data-testid={`canon-status-${option}`}
              >
                {CONFLICT_STATUS_LABELS[option]}
              </button>
            ))}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="canon-severity">
              Severity
            </label>
            <select
              id="canon-severity"
              className="field__input field__input--select"
              value={severity ?? ''}
              onChange={(event) => {
                setSeverity(
                  event.target.value === ''
                    ? null
                    : (Number(event.target.value) as CanonSeverityValue),
                )
                setPage(1)
              }}
              data-testid="canon-severity"
            >
              <option value="">Any severity</option>
              {SEVERITY_ORDER.map((option) => (
                <option key={option} value={option}>
                  {SEVERITY_LABELS[option]}
                </option>
              ))}
            </select>
            {severity !== null ? <p className="field__hint">{SEVERITY_HINTS[severity]}</p> : null}
          </div>
        </div>
      </div>

      {evaluation ? (
        <p className="integrity__run" role="status" data-testid="canon-run">
          Evaluated: {evaluation.detected} found, {evaluation.created} new, {evaluation.reopened}{' '}
          reopened, {evaluation.resolved} closed.
        </p>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="canon-error">
          {message}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Reading the findings…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button className="button button--quiet" type="button" onClick={reload}>
            Try again
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="integrity__ledger" data-testid="canon-ledger">
          {result.items.map((conflict) => (
            <ConflictEntry
              key={conflict.id}
              universeId={universe.id}
              conflict={conflict}
              isBusy={busyId === conflict.id}
              onDismiss={() => void transition(conflict.id, 'dismiss')}
              onReopen={() => void transition(conflict.id, 'reopen')}
            />
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <div className="empty" data-testid="canon-empty">
          <p className="empty__line">{emptyLine(status, severity)}</p>
          <p className="empty__hint">
            {severity !== null
              ? 'Another severity may have something. Clear the filter to see them all.'
              : hint(status)}
          </p>
          {severity === null && status === CanonConflictStatus.Pending ? (
            <button
              className="button"
              type="button"
              onClick={() => void evaluate()}
              disabled={isEvaluating}
              data-testid="empty-evaluate-canon"
            >
              {isEvaluating ? 'Evaluating…' : 'Evaluate'}
            </button>
          ) : null}
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

function emptyLine(status: CanonConflictStatusValue, severity: CanonSeverityValue | null) {
  if (severity !== null) {
    return `Nothing ${CONFLICT_STATUS_LABELS[status].toLowerCase()} at ${SEVERITY_LABELS[severity]} severity.`
  }

  if (status === CanonConflictStatus.Dismissed) return 'Nothing set aside.'
  if (status === CanonConflictStatus.Resolved) return 'Nothing closed yet.'
  return 'Nothing here contradicts itself.'
}

function hint(status: CanonConflictStatusValue) {
  if (status === CanonConflictStatus.Dismissed) {
    return 'A finding you choose to live with is kept here, and only while the problem lasts.'
  }

  if (status === CanonConflictStatus.Resolved) {
    return 'A finding closes when evaluation stops seeing it. Nothing has closed yet.'
  }

  return 'Either this world is consistent, or it has not been read since it last changed. Findings are only as fresh as the last evaluation.'
}
