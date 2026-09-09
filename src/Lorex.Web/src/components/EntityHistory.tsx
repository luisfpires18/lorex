import { useCallback, useEffect, useState } from 'react'
import { LoreArticle } from './LoreEditor'
import { CanonBlockNotice } from './CanonBlockNotice'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { ApiError } from '../lib/api'
import { formatDate, formatDateTime } from '../lib/dates'
import { isEmptyDocument } from '../lore/document'
import {
  describeChanges,
  getRevision,
  isNotRestorable,
  listRevisions,
  restoreRevision,
  RevisionKind,
  type EntityRevisionDetail,
  type EntityRevisionSummary,
  type RevisionFieldValue,
} from '../lore/revisions'
import { CANON_LABELS, FieldKind } from '../lore/types'

interface EntityHistoryProps {
  universeId: string
  entityId: string

  /**
   * Bumped by the dossier whenever it saves. History is derived from writes made
   * elsewhere on the page, so it reloads on a signal rather than by holding shared state.
   */
  reloadKey: number

  /** Called after a restore lands, so the dossier can show the lore that is now stored. */
  onRestored: () => void
}

/**
 * What an entry has been, presented as a document history rather than an audit table.
 *
 * Each row says when, and in one sentence what moved - never a per-field diff, and never a
 * prose diff of the article, neither of which this phase claims to produce. A version can
 * be opened in place to read the whole of it, and any version but the current one can be
 * put back.
 *
 * Restoring is an ordinary gated save on the API, so a refusal reads exactly as it does in
 * the edit form: the same notice, and nothing changed.
 */
export function EntityHistory({ universeId, entityId, reloadKey, onRestored }: EntityHistoryProps) {
  const [revisions, setRevisions] = useState<EntityRevisionSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [expanded, setExpanded] = useState<{ id: string; key: number } | null>(null)
  const [opened, setOpened] = useState<EntityRevisionDetail | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    listRevisions(universeId, entityId, controller.signal)
      .then((loaded) => {
        setRevisions(loaded)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })

    return () => {
      controller.abort()
    }
  }, [universeId, entityId, reloadKey])

  // A version stays open only for the history it was opened against. When a write moves
  // the list underneath it, the expansion is stale rather than closed by an effect, so
  // nothing is left showing a snapshot the list no longer explains.
  const openId = expanded?.key === reloadKey ? expanded.id : null

  const open = useCallback(
    async (revisionId: string) => {
      if (openId === revisionId) {
        setExpanded(null)
        setOpened(null)
        return
      }

      setExpanded({ id: revisionId, key: reloadKey })
      setOpened(null)
      setMessage(null)

      try {
        setOpened(await getRevision(universeId, entityId, revisionId))
      } catch {
        setExpanded(null)
        setMessage('That version could not be opened.')
      }
    },
    [openId, reloadKey, universeId, entityId],
  )

  async function restore(revision: EntityRevisionSummary) {
    if (!window.confirm(`Put version ${revision.number} back? It becomes the newest version.`)) {
      return
    }

    setMessage(null)
    setBlocked(null)
    setBusyId(revision.id)

    try {
      await restoreRevision(universeId, entityId, revision.id)
      onRestored()
    } catch (error: unknown) {
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (isNotRestorable(error) || error instanceof ApiError) {
        setMessage((error as ApiError).message)
      } else {
        setMessage('That version could not be put back.')
      }
    } finally {
      setBusyId(null)
    }
  }

  if (status === 'loading') {
    return null
  }

  return (
    <section className="history" aria-labelledby="history-heading">
      <div className="history__head">
        <h3 className="history__title" id="history-heading">
          History
        </h3>
      </div>

      {blocked ? (
        <CanonBlockNotice universeId={universeId} findings={blocked} linkSubjects />
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="history-error">
          {message}
        </p>
      ) : null}

      {status === 'error' ? (
        <p className="history__quiet" role="status">
          This entry&rsquo;s history could not be read.
        </p>
      ) : revisions.length === 0 ? (
        <p className="history__quiet" data-testid="history-empty">
          Nothing recorded yet. The next save starts this entry&rsquo;s history.
        </p>
      ) : (
        <ol className="history__list" data-testid="history-list">
          {revisions.map((revision, index) => (
            <li className="version" key={revision.id} data-version={revision.number}>
              <p className="version__when">
                <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
              </p>

              <div className="version__body">
                <p className="version__what" data-testid="version-what">
                  {describeChanges(revision)}
                  {index === 0 ? <span className="version__now">now showing</span> : null}
                </p>
                <p className="version__meta">
                  <span>Version {revision.number}</span>
                  <span>{revision.name}</span>
                  <span>{CANON_LABELS[revision.canonStatus]}</span>
                  {revision.kind === RevisionKind.Restored ? (
                    <span>
                      restored version{' '}
                      {revisions.find(
                        (candidate) => candidate.id === revision.restoredFromRevisionId,
                      )?.number ?? '—'}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="version__tools">
                <button
                  className="button button--quiet"
                  type="button"
                  aria-expanded={openId === revision.id}
                  onClick={() => void open(revision.id)}
                  data-testid="version-view"
                >
                  {openId === revision.id ? 'Hide' : 'View'}
                </button>
                {index > 0 ? (
                  <button
                    className="button button--quiet"
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void restore(revision)}
                    data-testid="version-restore"
                  >
                    {busyId === revision.id ? 'Restoring' : 'Restore'}
                  </button>
                ) : null}
              </div>

              {openId === revision.id ? (
                <div className="version__snapshot" data-testid="version-snapshot">
                  {opened === null || opened.id !== openId ? (
                    <p className="history__quiet" role="status">
                      Opening&hellip;
                    </p>
                  ) : (
                    <Snapshot revision={opened} />
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** One version read whole, in the same shapes the dossier uses for the live entry. */
function Snapshot({ revision }: { revision: EntityRevisionDetail }) {
  return (
    <>
      <h4 className="snapshot__name">{revision.name}</h4>
      <p className="snapshot__kind">
        {revision.entityTypeName} &middot; {CANON_LABELS[revision.canonStatus]}
      </p>

      {revision.aliases.length > 0 ? (
        <p className="entry__aliases">also known as {revision.aliases.join(', ')}</p>
      ) : null}

      {revision.summary ? <p className="entry__summary">{revision.summary}</p> : null}

      {isEmptyDocument(revision.content) ? (
        <p className="entry__blank">No article in this version.</p>
      ) : (
        <LoreArticle content={revision.content} />
      )}

      {revision.fields.length > 0 ? (
        <dl className="facts">
          {revision.fields.map((value) => (
            <div className="facts__row" key={value.fieldDefinitionId}>
              <dt className="facts__key">{value.name}</dt>
              <dd className="facts__value">{renderRevisionFact(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {revision.tags.length > 0 ? (
        <p className="dossier__tags">
          {revision.tags.map((tag) => (
            <span className="chip" key={tag}>
              {tag}
            </span>
          ))}
        </p>
      ) : null}
    </>
  )
}

/**
 * A stored value as it read then. Names come from the snapshot rather than a live lookup,
 * so a version still reads correctly once the field or the entry it pointed at is gone.
 */
function renderRevisionFact(value: RevisionFieldValue) {
  switch (value.kind) {
    case FieldKind.ShortText:
    case FieldKind.LongText:
      return value.text ?? '—'
    case FieldKind.Number:
      return value.number ?? '—'
    case FieldKind.Boolean:
      return value.boolean ? 'Yes' : 'No'
    case FieldKind.Date:
      return value.date ? formatDate(value.date) : '—'
    case FieldKind.Select:
    case FieldKind.MultiSelect:
      return value.optionValues.length > 0 ? value.optionValues.join(', ') : '—'
    case FieldKind.EntityReference:
      return value.referencedEntityName ?? '—'
    default:
      return '—'
  }
}
