import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { EntityPicker, type EntityChoice } from '../components/EntityPicker'
import { TimelineEntryForm } from '../components/TimelineEntryForm'
import { ApiError } from '../lib/api'
import { CANON_LABELS, CANON_ORDER, type CanonStatusValue } from '../lore/types'
import { deleteTimelineEntry, listTimelineEntries } from '../timeline/api'
import { formatTimelineDate, formatYear, groupTimeline } from '../timeline/format'
import { DATE_KIND_LABELS, type TimelineEntry, type TimelineEntryPage } from '../timeline/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: TimelineEntryPage }
  | { kind: 'error'; message: string }

type FormState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; entry: TimelineEntry }

export default function TimelinePage() {
  const { universe } = useOutletContext<WorkspaceContext>()

  const [canonStatus, setCanonStatus] = useState<CanonStatusValue | null>(null)
  const [participant, setParticipant] = useState<EntityChoice | null>(null)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [form, setForm] = useState<FormState>({ mode: 'closed' })
  const [message, setMessage] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listTimelineEntries(
      universe.id,
      { canonStatus, entityId: participant?.id ?? null, page },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not read this chronology.',
        })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, canonStatus, participant, page, reloads])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = canonStatus !== null || participant !== null

  async function remove(entry: TimelineEntry) {
    if (!window.confirm(`Delete “${entry.title}”? The moment goes, the entries it names stay.`)) {
      return
    }

    setMessage(null)
    try {
      await deleteTimelineEntry(universe.id, entry.id)

      // Stepping back off a page that just emptied, rather than showing nothing at all.
      if (result && result.items.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        reload()
      }
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'That moment could not be deleted.')
    }
  }

  const { groups, unplaced, mixedEras } = groupTimeline(result?.items ?? [])

  /**
   * `heading` is the year already standing in the margin. A moment known only to that
   * year would repeat it word for word, so its own stamp is dropped and the kind carries
   * the line; anything finer, approximate or spanning still says what it claims.
   */
  function moment(entry: TimelineEntry, heading?: string) {
    const stamp = formatTimelineDate(entry.date)
    const restates = stamp === heading

    return (
      <li className="moment" key={entry.id} data-kind={entry.date.kind} data-title={entry.title}>
        <span className="moment__mark" aria-hidden="true" />

        <p className="moment__stamp">
          {stamp && !restates ? <span className="moment__when">{stamp}</span> : null}
          <span className="moment__kind">{DATE_KIND_LABELS[entry.date.kind]}</span>
          <span className="chip" data-canon={entry.canonStatus}>
            {CANON_LABELS[entry.canonStatus]}
          </span>
        </p>

        <h4 className="moment__title">{entry.title}</h4>

        {entry.description ? <p className="moment__account">{entry.description}</p> : null}

        {entry.entities.length > 0 ? (
          <ul className="moment__cast">
            {entry.entities.map((link) => {
              const dot = (
                <span
                  className="moment__dot"
                  aria-hidden="true"
                  style={
                    link.entityTypeAccentColor
                      ? { background: link.entityTypeAccentColor }
                      : undefined
                  }
                />
              )

              // A participant in the Trash is still stored on this moment and comes back
              // with it, so it is named rather than dropped - but it has no page to open
              // while it is in the Trash, so it is not a link.
              return (
                <li key={link.entityId}>
                  {link.isTrashed ? (
                    <span className="moment__player moment__player--trashed">
                      {dot}
                      {link.name} (in Trash)
                    </span>
                  ) : (
                    <Link
                      className="moment__player"
                      to={`/app/universes/${universe.id}/lore/${link.entityId}`}
                      title={link.entityTypeName}
                    >
                      {dot}
                      {link.name}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="moment__tools">
          <button
            className="button button--quiet"
            type="button"
            onClick={() => setForm({ mode: 'edit', entry })}
            data-testid={`edit-moment-${entry.title}`}
          >
            Edit
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => void remove(entry)}
            data-testid={`delete-moment-${entry.title}`}
          >
            Delete
          </button>
        </div>
      </li>
    )
  }

  return (
    <article className="chron">
      <header className="chron__head">
        <div>
          <h2 className="chron__title">Timeline</h2>
          <p className="chron__lede">
            Everything that has happened here, in the order it happened.
          </p>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => setForm({ mode: 'new' })}
          data-testid="new-moment"
        >
          Add timeline entry
        </button>
      </header>

      <div className="controls">
        <div className="controls__filters">
          <div className="field">
            <label className="field__label" htmlFor="chron-canon">
              Status
            </label>
            <select
              id="chron-canon"
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
              data-testid="chron-canon"
            >
              <option value="">Any status</option>
              {CANON_ORDER.map((status) => (
                <option key={status} value={status}>
                  {CANON_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <EntityPicker
            label="Taking part"
            universeId={universe.id}
            value={participant}
            onChange={(choice) => {
              setParticipant(choice)
              setPage(1)
            }}
            placeholder="Anyone or anything"
          />
        </div>
      </div>

      {mixedEras ? (
        <p className="chron__caution" data-testid="chron-eras">
          More than one reckoning is on this page. Lorex orders by the year number alone, so a
          moment under a different era may not sit where its story puts it.
        </p>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="chron-error">
          {message}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Reading the chronology…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p className="notice notice--error" role="alert">
          {state.message}
        </p>
      ) : null}

      {result && result.items.length > 0 ? (
        <div className="chron__stream" data-testid="chron-stream">
          {groups.map((group) => (
            <section className="chron__group" key={group.key}>
              <h3 className="chron__year">
                <span className="chron__yearnum">{formatYear(group.year)}</span>
                {group.eraLabel ? <span className="chron__era">{group.eraLabel}</span> : null}
              </h3>
              <ul className="chron__moments">
                {group.entries.map((entry) => moment(entry, formatYear(group.year)))}
              </ul>
            </section>
          ))}

          {unplaced.length > 0 ? (
            <section className="chron__group chron__group--unplaced">
              <h3 className="chron__year">
                <span className="chron__yearnum chron__yearnum--none">?</span>
                <span className="chron__era">Unplaced</span>
              </h3>
              <div>
                <p className="chron__aside">
                  In the story, not yet in time. These sit apart rather than pretending to a year.
                </p>
                <ul className="chron__moments chron__moments--unplaced">
                  {unplaced.map((entry) => moment(entry))}
                </ul>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {result && result.items.length === 0 ? (
        <div className="empty" data-testid="chron-empty">
          <p className="empty__line">
            {isFiltered ? 'No moment matches that.' : 'Nothing has happened here yet.'}
          </p>
          <p className="empty__hint">
            {isFiltered
              ? 'Clear the status or the entry you are following.'
              : 'A timeline holds the moments of this world in order — a founding, a betrayal, the year someone was born. Give a date you are sure of, one you only half remember, or none at all.'}
          </p>
          {!isFiltered ? (
            <button
              className="button"
              type="button"
              onClick={() => setForm({ mode: 'new' })}
              data-testid="empty-new-moment"
            >
              Add timeline entry
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

      {form.mode !== 'closed' ? (
        <TimelineEntryForm
          universeId={universe.id}
          entry={form.mode === 'edit' ? form.entry : null}
          onClose={() => setForm({ mode: 'closed' })}
          onSaved={() => {
            setForm({ mode: 'closed' })
            reload()
          }}
        />
      ) : null}
    </article>
  )
}
