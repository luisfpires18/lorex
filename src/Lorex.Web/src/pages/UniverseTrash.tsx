import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArchiveRestore,
  BookOpen,
  CircleDot,
  Feather,
  FileText,
  Scale,
  Spline,
  type LucideIcon,
} from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { CanonBlockNotice } from '../components/CanonBlockNotice'
import { Quoted } from '../components/NameList'
import { formatDateTime } from '../lib/dates'
import { unpublishContent } from '../publishing/api'
import { CANON_LABELS } from '../lore/types'
import { listTrash, restoredPath, restoreFromTrash } from '../trash/api'
import {
  TRASH_KIND_LABELS,
  TrashBlock,
  TrashKind,
  TrashPublication,
  type TrashItem,
  type TrashKindValue,
  type TrashPage,
} from '../trash/types'
import { EmptyState } from '../components/EmptyState'
import { EntityTile } from '../components/EntityTile'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: TrashPage } | { kind: 'error'; message: string }

/** What the last restore did, and the way to what it brought back. */
interface Outcome {
  text: ReactNode
  link: { to: string; label: ReactNode } | null
}

/** Where a row was, in the words the author knows it by. */
function whereItWas(item: TrashItem) {
  switch (item.kind) {
    case TrashKind.Entry:
      return (
        <>
          {item.entityTypeName ? <bdi>{item.entityTypeName}</bdi> : null}
          {item.entityTypeName && item.canonStatus !== null ? ' · ' : null}
          {item.canonStatus === null ? null : CANON_LABELS[item.canonStatus]}
        </>
      )
    case TrashKind.Story:
      return 'A whole story, with everything in it'
    case TrashKind.PlotBeat:
      return (
        <>
          In the arc <Quoted text={item.plotArcTitle ?? ''} /> of{' '}
          <Quoted text={item.storyTitle ?? ''} />
        </>
      )
    case TrashKind.WorldRule:
      return 'In World Rules'
    default:
      return (
        <>
          In <Quoted text={item.storyTitle ?? ''} />
        </>
      )
  }
}

/** Why a row cannot come back yet, if it cannot. */
function blockedText(item: TrashItem) {
  if (item.blockedBy === TrashBlock.StoryInTrash) {
    return (
      <>
        Its story, <Quoted text={item.storyTitle ?? ''} />, is in the Trash too. Restore the story
        first.
      </>
    )
  }
  if (item.blockedBy === TrashBlock.ArcInTrash) {
    return (
      <>
        Its arc, <Quoted text={item.plotArcTitle ?? ''} />, is in the Trash too. Restore the arc
        first.
      </>
    )
  }
  return null
}

function backText(item: TrashItem) {
  const name = <Quoted text={item.name} />
  switch (item.kind) {
    case TrashKind.Entry:
      return <>{name} is back in your lore.</>
    case TrashKind.Story:
      return <>{name} is back in your stories.</>
    case TrashKind.Chapter:
      return (
        <>
          The chapter {name} is back in <Quoted text={item.storyTitle ?? ''} />, after its other
          chapters. No scene was moved into it.
        </>
      )
    case TrashKind.Scene:
      return (
        <>
          The scene {name} is back in <Quoted text={item.storyTitle ?? ''} />.
        </>
      )
    case TrashKind.PlotArc:
      return (
        <>
          The arc {name} is back in <Quoted text={item.storyTitle ?? ''} />.
        </>
      )
    case TrashKind.PlotBeat:
      return (
        <>
          The beat {name} is back in <Quoted text={item.plotArcTitle ?? ''} />.
        </>
      )
    case TrashKind.WorldRule:
      return <>The world rule {name} is back in World Rules.</>
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
  // A restore that would publish again asks first (Task 012); the question sits in the row it is about.
  const [confirming, setConfirming] = useState<TrashItem | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const restoreButtons = useRef(new Map<string, HTMLButtonElement>())

  // Cancelling hands the focus back to the row's Restore - once it is enabled again, so after the render.
  const returnFocusTo = useRef<string | null>(null)

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus()
    } else if (returnFocusTo.current) {
      restoreButtons.current.get(returnFocusTo.current)?.focus()
      returnFocusTo.current = null
    }
  }, [confirming])

  function cancelConfirming() {
    returnFocusTo.current = confirming?.id ?? null
    setConfirming(null)
  }

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

  function askToRestore(item: TrashItem) {
    if (item.publication === TrashPublication.None) {
      void restore(item)
      return
    }
    setBlocked(null)
    setOutcome(null)
    setConfirming(item)
  }

  /**
   * `keepPrivate` restores and then takes the selection back at once - the only order the API allows, since an item in
   * the Trash has no publication route. The window between the two is one round trip.
   */
  async function restore(item: TrashItem, keepPrivate = false) {
    setConfirming(null)
    setRestoring(item.id)
    setBlocked(null)
    setOutcome(null)

    try {
      await restoreFromTrash(universe.id, item)
      let privateNote: ReactNode = null
      if (keepPrivate) {
        try {
          await unpublishContent(
            universe.id,
            item.kind === TrashKind.Entry ? 'entry' : 'story',
            item.id,
          )
          privateNote = ' It is private now.'
        } catch {
          privateNote = ' It could not be made private: open it and choose Make private.'
        }
      }
      setOutcome({
        text: (
          <>
            {backText(item)}
            {privateNote}
          </>
        ),
        link: {
          to: restoredPath(universe.id, item),
          label: (
            <>
              Open <Quoted text={item.name} />
            </>
          ),
        },
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
          text:
            error instanceof Error ? (
              error.message
            ) : (
              <>
                <Quoted text={item.name} /> could not be restored.
              </>
            ),
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
      <PageHeader
        title="Trash"
        lede={
          <>
            <p>
              What you removed from your lore, your stories and your world rules. Nothing here has
              been erased: restoring puts each thing back with everything it held.
            </p>
            <p data-testid="trash-ideas-pointer">
              Deleted ideas are not here: they belong to your account, and wait in{' '}
              <Link to={`/app/universes/${universe.id}/ideas?view=deleted`}>
                Ideas, under Recently deleted
              </Link>
              .
            </p>
          </>
        }
      />

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
          <button className="button button--secondary" type="button" onClick={() => load()}>
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
                {/* What it is, at a glance: an entry's type tile, or the icon of the story part or rule. The kind is
                    said in words beside the name, so the tile is decorative. */}
                {item.kind === TrashKind.Entry ? (
                  <EntityTile
                    className="trash__tile"
                    universeId={universe.id}
                    entityId={item.id}
                    image={null}
                    typeIcon={item.entityTypeIcon}
                    typeAccent={item.entityTypeAccentColor}
                  />
                ) : (
                  <KindTile kind={item.kind} />
                )}
                <div className="trash__what">
                  <p className="trash__name">
                    <bdi>{item.name}</bdi>
                  </p>
                  <p className="trash__meta">
                    <span className="trash__kind" data-testid="trash-kind">
                      {kind}
                    </span>{' '}
                    · {whereItWas(item)} · removed {formatDateTime(item.trashedAt)}
                  </p>
                  {waiting ? (
                    <p className="trash__waiting" id={waitingId} data-testid="trash-waiting">
                      {waiting}
                    </p>
                  ) : null}
                </div>
                <button
                  ref={(node) => {
                    if (node) restoreButtons.current.set(item.id, node)
                    else restoreButtons.current.delete(item.id)
                  }}
                  className="button button--secondary"
                  type="button"
                  disabled={restoring !== null || waiting !== null || confirming !== null}
                  aria-label={`Restore ${kind.toLowerCase()} “${item.name}”`}
                  aria-describedby={waiting ? waitingId : undefined}
                  onClick={() => askToRestore(item)}
                  data-testid={`restore-${item.name}`}
                >
                  <ActionIcon icon={ArchiveRestore} />
                  {restoring === item.id ? 'Restoring…' : 'Restore'}
                </button>
                {confirming?.id === item.id && confirming.kind === item.kind ? (
                  <RestorePublicConfirm
                    item={item}
                    panelRef={confirmRef}
                    onRestore={() => void restore(item)}
                    onRestorePrivate={() => void restore(item, true)}
                    onCancel={cancelConfirming}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="trash-empty"
          title="The Trash is empty."
          hint="Anything you remove from your lore, your stories or your world rules waits here."
        />
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

/**
 * The question before a restore that touches the public portal. Trash keeps an entry's or story's public selection, so
 * restoring it brings that back: straight into public view when its universe is public, or silently selected when it
 * is not. The copy says which, and never claims visibility the item will not have.
 */
function RestorePublicConfirm({
  item,
  panelRef,
  onRestore,
  onRestorePrivate,
  onCancel,
}: {
  item: TrashItem
  panelRef: React.RefObject<HTMLDivElement | null>
  onRestore: () => void
  onRestorePrivate: () => void
  onCancel: () => void
}) {
  const noun = item.kind === TrashKind.Entry ? 'entry' : 'story'
  const visible = item.publication === TrashPublication.Visible
  const titleId = `trash-confirm-${item.id}`

  return (
    <div
      className="trash__confirm"
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={panelRef}
      data-testid="trash-publication-confirm"
      data-publication={visible ? 'visible' : 'hidden'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <p className="trash__confirmtitle" id={titleId}>
        {visible ? (
          <>
            Restoring <Quoted text={item.name} /> makes it public again.
          </>
        ) : (
          <>
            <Quoted text={item.name} /> is still selected for publication.
          </>
        )}
      </p>
      <p className="trash__confirmtext" data-testid="trash-publication-text">
        {visible
          ? `This ${noun} was public before it was moved to the Trash. Restoring it will make it visible again in your public universe, to anyone, straight away.`
          : `It was selected for publication before it was moved to the Trash. Readers cannot see it now, and restoring it does not change that: it would appear once ${
              item.kind === TrashKind.Story
                ? 'this universe is public and the story has a public summary'
                : 'this universe is public'
            }.`}
      </p>
      <div className="form__actions">
        <button
          className="button"
          type="button"
          onClick={onRestore}
          data-testid="trash-confirm-restore"
        >
          {visible ? 'Restore and publish' : 'Restore, keep selected'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={onRestorePrivate}
          data-testid="trash-confirm-private"
        >
          Restore as private
        </button>
        <button
          className="button button--text"
          type="button"
          onClick={onCancel}
          data-testid="trash-confirm-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

const KIND_ICONS: Record<TrashKindValue, LucideIcon> = {
  [TrashKind.Entry]: FileText,
  [TrashKind.Story]: Feather,
  [TrashKind.Chapter]: BookOpen,
  [TrashKind.Scene]: FileText,
  [TrashKind.PlotArc]: Spline,
  [TrashKind.PlotBeat]: CircleDot,
  [TrashKind.WorldRule]: Scale,
}

/** A story part's or a rule's square: its kind's icon on the sunken paper, the shape an entry's tile has. */
function KindTile({ kind }: { kind: TrashKindValue }) {
  const Icon = KIND_ICONS[kind]
  return (
    <span className="tile tile--blank trash__tile" aria-hidden="true">
      <Icon className="tile__icon" />
    </span>
  )
}
