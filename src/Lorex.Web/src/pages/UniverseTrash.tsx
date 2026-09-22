import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { CanonBlockNotice } from '../components/CanonBlockNotice'
import { formatDateTime } from '../lib/dates'
import { CANON_LABELS } from '../lore/types'
import { listTrash, restoredPath, restoreFromTrash } from '../trash/api'
import {
  TRASH_KIND_LABELS,
  TrashBlock,
  TrashKind,
  type TrashItem,
  type TrashPage,
} from '../trash/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: TrashPage } | { kind: 'error'; message: string }

/** What the last restore did, and the way to what it brought back. */
interface Outcome {
  text: string
  link: { to: string; label: string } | null
}

/** Where a row was, in the words the author knows it by. */
function whereItWas(item: TrashItem) {
  switch (item.kind) {
    case TrashKind.Entry:
      return [
        item.entityTypeName,
        item.canonStatus === null ? null : CANON_LABELS[item.canonStatus],
      ]
        .filter(Boolean)
        .join(' · ')
    case TrashKind.Story:
      return 'A whole story, with everything in it'
    case TrashKind.PlotBeat:
      return `In the arc “${item.plotArcTitle ?? ''}” of “${item.storyTitle ?? ''}”`
    case TrashKind.WorldRule:
      return 'In World Rules'
    default:
      return `In “${item.storyTitle ?? ''}”`
  }
}

/** Why a row cannot come back yet, if it cannot. */
function blockedText(item: TrashItem) {
  if (item.blockedBy === TrashBlock.StoryInTrash) {
    return `Its story, “${item.storyTitle ?? ''}”, is in the Trash too. Restore the story first.`
  }
  if (item.blockedBy === TrashBlock.ArcInTrash) {
    return `Its arc, “${item.plotArcTitle ?? ''}”, is in the Trash too. Restore the arc first.`
  }
  return null
}

function backText(item: TrashItem) {
  switch (item.kind) {
    case TrashKind.Entry:
      return `“${item.name}” is back in your lore.`
    case TrashKind.Story:
      return `“${item.name}” is back in your stories.`
    case TrashKind.Chapter:
      return `The chapter “${item.name}” is back in “${item.storyTitle ?? ''}”, after its other chapters. No scene was moved into it.`
    case TrashKind.Scene:
      return `The scene “${item.name}” is back in “${item.storyTitle ?? ''}”.`
    case TrashKind.PlotArc:
      return `The arc “${item.name}” is back in “${item.storyTitle ?? ''}”.`
    case TrashKind.PlotBeat:
      return `The beat “${item.name}” is back in “${item.plotArcTitle ?? ''}”.`
    case TrashKind.WorldRule:
      return `The world rule “${item.name}” is back in World Rules.`
  }
}

/**
 * What this universe has thrown away, and the one thing to do about each of it.
 *
 * A list, not a dashboard. Nothing is counted, charted or summarised here: the question the screen answers is "what did I
 * lose, and can I have it back". Each row says what it is in words - an entry, a story, a chapter, a scene, an arc, a beat
 * - and where it was, and every other fact about it is readable in its own place the moment it returns.
 *
 * A row whose story or arc is in the Trash too says so and waits: it is never put somewhere else instead.
 *
 * There is no permanent delete, on purpose (ADR 0015, ADR 0029): the only way out of this screen is back into the world.
 */
export default function UniverseTrash() {
  const { universe } = useOutletContext<WorkspaceContext>()

  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [restoring, setRestoring] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const outcomeRef = useRef<HTMLDivElement>(null)

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

  // The row that was restored leaves the list, taking the focus with it: the focus goes to what happened instead.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus()
  }, [outcome])

  async function restore(item: TrashItem) {
    setRestoring(item.id)
    setBlocked(null)
    setOutcome(null)

    try {
      await restoreFromTrash(universe.id, item)
      setOutcome({
        text: backText(item),
        link: { to: restoredPath(universe.id, item), label: `Open “${item.name}”` },
      })

      // A restore empties the last row of a page as often as not, so step back rather than
      // leave the author looking at an empty page that used to have something on it.
      const remaining = state.kind === 'ready' ? state.page.items.length - 1 : 0
      if (remaining === 0 && page > 1) {
        setPage((current) => current - 1)
      } else {
        load()
      }
    } catch (error: unknown) {
      // Nothing moved either way: a refused restore writes nothing, so the row is still in the list below and can be
      // tried again once the objection is dealt with.
      const findings = blockingFindingsOf(error)
      if (findings) {
        setBlocked(findings)
      } else {
        setOutcome({
          text: error instanceof Error ? error.message : `“${item.name}” could not be restored.`,
          link: null,
        })
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
          What you removed from your lore, your stories and your world rules. Nothing here has been
          erased — restoring puts each thing back with everything it held: an entry&rsquo;s article,
          fields, history and connections; a scene&rsquo;s manuscript and its saved versions; a
          story&rsquo;s chapters, scenes and plot; a rule&rsquo;s words.
        </p>
        <p className="trash__lede" data-testid="trash-ideas-pointer">
          Deleted ideas are not here: they belong to your account, and wait in{' '}
          <Link to={`/app/universes/${universe.id}/ideas?view=deleted`}>
            Ideas, under Recently deleted
          </Link>
          .
        </p>
      </header>

      {blocked ? (
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={false} />
      ) : null}

      {outcome ? (
        <div className="notice trash__outcome" ref={outcomeRef} tabIndex={-1}>
          <p role="status" data-testid="trash-message">
            {outcome.text}
          </p>
          {outcome.link ? (
            <Link to={outcome.link.to} data-testid="trash-open">
              {outcome.link.label}
            </Link>
          ) : null}
        </div>
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
          {result.items.map((item) => {
            const kind = TRASH_KIND_LABELS[item.kind]
            const waiting = blockedText(item)
            const waitingId = `trash-waiting-${item.id}`

            return (
              <li
                className="trash__row"
                key={`${item.kind}:${item.id}`}
                data-testid={`trash-row-${item.name}`}
                data-kind={kind}
              >
                <span
                  className="trash__dot"
                  aria-hidden="true"
                  style={
                    item.entityTypeAccentColor
                      ? { background: item.entityTypeAccentColor }
                      : undefined
                  }
                />
                <div className="trash__what">
                  <p className="trash__name">
                    <span className="trash__kind" data-testid="trash-kind">
                      {kind}
                    </span>
                    <bdi>{item.name}</bdi>
                  </p>
                  <p className="trash__meta">
                    {whereItWas(item)} · removed {formatDateTime(item.trashedAt)}
                  </p>
                  {waiting ? (
                    <p className="trash__waiting" id={waitingId} data-testid="trash-waiting">
                      {waiting}
                    </p>
                  ) : null}
                </div>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={restoring !== null || waiting !== null}
                  aria-label={`Restore ${kind.toLowerCase()} “${item.name}”`}
                  aria-describedby={waiting ? waitingId : undefined}
                  onClick={() => void restore(item)}
                  data-testid={`restore-${item.name}`}
                >
                  {restoring === item.id ? 'Restoring…' : 'Restore'}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <div className="empty" data-testid="trash-empty">
          <p className="empty__line">The Trash is empty.</p>
          <p className="empty__hint">
            Anything you remove from your lore, your stories or your world rules waits here.
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
