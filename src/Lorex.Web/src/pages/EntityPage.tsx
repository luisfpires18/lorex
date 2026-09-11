import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { EntityHistory } from '../components/EntityHistory'
import { EntityImageField, type PendingImage } from '../components/EntityImageField'
import { FieldInput } from '../components/FieldInputs'
import { LoreArticle, LoreEditor } from '../components/LoreEditor'
import { RelationshipSection } from '../components/RelationshipSection'
import { emptyValue, isEmptyDocument } from '../lore/document'
import { entityImageUrl, setEntityImage } from '../lore/images'
import { TokenInput } from '../components/TokenInput'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { CanonBlockNotice } from '../components/CanonBlockNotice'
import { ApiError } from '../lib/api'
import { formatDate } from '../lib/dates'
import {
  createEntity,
  deleteEntity,
  getEntity,
  listEntities,
  listEntityTypes,
  updateEntity,
} from '../lore/api'
import {
  CANON_LABELS,
  CANON_ORDER,
  CanonStatus,
  FieldKind,
  type CanonStatusValue,
  type EntityDetail,
  type EntitySummary,
  type EntityType,
  type FieldValueInput,
} from '../lore/types'
import type { WorkspaceContext } from './UniverseWorkspace'

interface Draft {
  entityTypeId: string
  name: string
  summary: string
  content: string | null
  canonStatus: CanonStatusValue
  aliases: string[]
  tags: string[]
  fields: Record<string, FieldValueInput>
}

function draftFromDetail(detail: EntityDetail): Draft {
  const fields: Record<string, FieldValueInput> = {}
  for (const value of detail.fields) {
    fields[value.fieldDefinitionId] = {
      fieldDefinitionId: value.fieldDefinitionId,
      text: value.text,
      number: value.number,
      boolean: value.boolean,
      date: value.date,
      optionIds: value.optionIds,
      referencedEntityId: value.referencedEntityId,
    }
  }

  return {
    entityTypeId: detail.entityTypeId,
    name: detail.name,
    summary: detail.summary ?? '',
    content: detail.content,
    canonStatus: detail.canonStatus,
    aliases: detail.aliases,
    tags: detail.tags,
    fields,
  }
}

export default function EntityPage() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()

  const isNew = entityId === undefined
  const [types, setTypes] = useState<EntityType[]>([])
  const [candidates, setCandidates] = useState<EntitySummary[]>([])
  const [detail, setDetail] = useState<EntityDetail | null>(null)
  const [editedDraft, setDraft] = useState<Draft | null>(null)
  const [isEditing, setIsEditing] = useState(isNew)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    isNew ? 'ready' : 'loading',
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // A new entry's picture, and the square its author framed, wait here until the entry exists.
  // Object keys are built from the entry's id, so there is nowhere to put it before the create
  // call comes back - and inventing a temporary path would mean writing objects nobody would ever
  // come back to clean up.
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)

  // Bumped after every accepted write, so the history reloads without either component
  // holding the other's state.
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      listEntityTypes(universe.id, controller.signal),
      listEntities(
        universe.id,
        { search: '', entityTypeId: null, canonStatus: null, tag: null, page: 1 },
        controller.signal,
      ),
    ])
      .then(([loadedTypes, page]) => {
        setTypes(loadedTypes)
        setCandidates(page.items.filter((item) => item.id !== entityId))
      })
      .catch(() => {
        /* The page still works without the reference picker. */
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId])

  useEffect(() => {
    if (isNew) return

    const controller = new AbortController()
    getEntity(universe.id, entityId, controller.signal)
      .then((loaded) => {
        setDetail(loaded)
        setDraft(draftFromDetail(loaded))
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setStatus((error as { status?: number }).status === 404 ? 'missing' : 'error')
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId, isNew])

  // A new entry's blank draft is derived from the first available type rather than
  // written back into state, so nothing has to re-render to produce it.
  const draft = useMemo(() => {
    if (editedDraft) return editedDraft
    if (!isNew || types.length === 0) return null
    return {
      entityTypeId: types[0].id,
      name: '',
      summary: '',
      content: null,
      canonStatus: CanonStatus.Idea,
      aliases: [],
      tags: [],
      fields: {},
    } satisfies Draft
  }, [editedDraft, isNew, types])

  const selectedType = useMemo(
    () => types.find((type) => type.id === draft?.entityTypeId) ?? null,
    [types, draft?.entityTypeId],
  )

  const save = useCallback(async () => {
    if (!draft) return

    setMessage(null)
    setFieldErrors({})
    setBlocked(null)
    setIsSaving(true)

    const definitions = selectedType?.fields ?? []
    const input = {
      entityTypeId: draft.entityTypeId,
      name: draft.name.trim(),
      summary: draft.summary.trim() ? draft.summary.trim() : null,
      content: isEmptyDocument(draft.content) ? null : draft.content,
      canonStatus: draft.canonStatus,
      aliases: draft.aliases,
      tags: draft.tags,
      fields: definitions.map(
        (definition) => draft.fields[definition.id] ?? emptyValue(definition),
      ),
    }

    try {
      const saved = isNew
        ? await createEntity(universe.id, input)
        : await updateEntity(universe.id, entityId, input)

      // The entry exists now, so the picture that was waiting has somewhere to go. It is a
      // separate write and it is allowed to fail on its own: the lore is already stored, so a
      // refused image says so and leaves everything else alone.
      let image = saved.image
      if (isNew && pendingImage) {
        try {
          image = await setEntityImage(universe.id, saved.id, pendingImage.file, pendingImage)
          setPendingImage(null)
        } catch (failure: unknown) {
          setMessage(
            failure instanceof ApiError
              ? (failure.fieldErrors.file ?? failure.message)
              : 'The entry was created, but its image could not be uploaded.',
          )
        }
      }

      const stored = { ...saved, image }

      setDetail(stored)
      setDraft(draftFromDetail(stored))
      setIsEditing(false)
      setHistoryKey((key) => key + 1)

      if (isNew) {
        await navigate(`/app/universes/${universe.id}/lore/${saved.id}`, { replace: true })
      }
    } catch (error: unknown) {
      // A refusal from the promotion gate is not a save failure to report in one line:
      // the draft is still on screen and still editable, and the findings say why.
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage('That could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }, [draft, selectedType, isNew, universe.id, entityId, navigate, pendingImage])

  /**
   * The one-click promotion, which saves on the spot rather than through the editor.
   *
   * It is a gated write like any other, so a refusal has to read as one: the same notice
   * the edit form shows, and the step the author had before, because nothing moved. The
   * optimistic step is rolled back on any failure - leaving it pressed would claim a
   * status the server refused.
   */
  async function changeCanon(next: CanonStatusValue) {
    if (!draft) return
    const previous = draft.canonStatus
    const updated = { ...draft, canonStatus: next }
    setDraft(updated)

    if (isNew || isEditing) return

    setMessage(null)
    setBlocked(null)
    setIsSaving(true)
    try {
      const definitions = selectedType?.fields ?? []
      const saved = await updateEntity(universe.id, entityId, {
        entityTypeId: updated.entityTypeId,
        name: updated.name,
        summary: updated.summary.trim() ? updated.summary.trim() : null,
        content: isEmptyDocument(updated.content) ? null : updated.content,
        canonStatus: next,
        aliases: updated.aliases,
        tags: updated.tags,
        fields: definitions.map(
          (definition) => updated.fields[definition.id] ?? emptyValue(definition),
        ),
      })
      setDetail(saved)
      setDraft(draftFromDetail(saved))
      setHistoryKey((key) => key + 1)
    } catch (error: unknown) {
      setDraft({ ...updated, canonStatus: previous })

      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else {
        setMessage('The status could not be changed.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  /** After a restore the stored lore is a version the page has not seen. Read it back. */
  async function reloadAfterRestore() {
    if (entityId === undefined) return

    const loaded = await getEntity(universe.id, entityId)
    setDetail(loaded)
    setDraft(draftFromDetail(loaded))
    setHistoryKey((key) => key + 1)
  }

  /**
   * Moves the entry to the Trash. Nothing is destroyed, and the wording says so: the article,
   * the fields, the history and every connection stay stored, and Trash restores them whole.
   */
  async function moveToTrash() {
    const confirmed = window.confirm(
      'Move this entry to the Trash?\n\n' +
        'It leaves your lore, your search and your pickers, but nothing is erased. ' +
        'Its article, fields, history and connections are kept, and you can restore it ' +
        'from Trash at any time.',
    )
    if (isNew || !confirmed) return
    await deleteEntity(universe.id, entityId)
    await navigate(`/app/universes/${universe.id}/trash`, { replace: true })
  }

  // Order matters here. A load that failed leaves the draft null, so a loading guard placed
  // first would answer "Opening…" forever instead of saying what happened - which is now an
  // ordinary thing to hit, because a link to an entry since moved to the Trash answers 404.
  if (status === 'missing') {
    return (
      <div className="empty" data-testid="entity-missing">
        <p className="empty__line">That entry is not here.</p>
        <p className="empty__hint">
          It may be in the <Link to={`/app/universes/${universe.id}/trash`}>Trash</Link>, where it
          can be restored. <Link to={`/app/universes/${universe.id}/lore`}>Back to the lore</Link>
        </p>
      </div>
    )
  }

  if (status === 'loading' || !draft) {
    return (
      <p className="notice" role="status">
        Opening…
      </p>
    )
  }

  if (status === 'error') {
    return (
      <p className="notice notice--error" role="alert">
        This entry could not be opened.
      </p>
    )
  }

  const accent = selectedType?.accentColor ?? undefined

  return (
    <article
      className="entry"
      style={accent ? { ['--entry-accent' as string]: accent } : undefined}
    >
      <nav className="entry__crumbs">
        <Link to={`/app/universes/${universe.id}/lore`}>Lore</Link>
      </nav>

      <header className="entry__head">
        <div className="entry__kind">
          {isEditing ? (
            <select
              className="field__input field__input--select entry__typepick"
              aria-label="Entry type"
              value={draft.entityTypeId}
              onChange={(event) =>
                setDraft({ ...draft, entityTypeId: event.target.value, fields: {} })
              }
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="entry__type" data-testid="entry-type">
              {detail?.entityTypeName ?? selectedType?.name}
            </span>
          )}

          <div className="canon" role="group" aria-label="Canon status">
            {CANON_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                className="canon__step"
                aria-pressed={draft.canonStatus === option}
                data-canon={option}
                disabled={isSaving}
                onClick={() => changeCanon(option)}
                data-testid={`canon-${CANON_LABELS[option].toLowerCase()}`}
              >
                {CANON_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        {isEditing ? (
          <input
            className="entry__nameinput"
            aria-label="Name"
            placeholder="Name this"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        ) : (
          <h2 className="entry__name" data-testid="entry-name">
            {detail?.name}
          </h2>
        )}
        {fieldErrors.name ? <p className="field__error">{fieldErrors.name}</p> : null}

        {!isEditing && (detail?.aliases.length ?? 0) > 0 ? (
          <p className="entry__aliases" data-testid="entry-aliases">
            also known as {detail!.aliases.join(', ')}
          </p>
        ) : null}

        {isEditing ? (
          <textarea
            className="entry__summaryinput"
            aria-label="Summary"
            rows={2}
            placeholder="One or two lines that say what this is."
            value={draft.summary}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
          />
        ) : detail?.summary ? (
          <p className="entry__summary" data-testid="entry-summary">
            {detail.summary}
          </p>
        ) : null}
      </header>

      {blocked ? (
        // A blocked creation names an entry that was rolled back, so its ids lead
        // nowhere. Only an edit of something already stored can be linked.
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={!isNew} />
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="entry-error">
          {message}
        </p>
      ) : null}

      {!isEditing && detail?.image ? (
        <figure className="entry__plate" data-testid="entry-image">
          <img
            src={entityImageUrl(universe.id, detail.id, detail.image, 'original')}
            alt={detail.name}
            // The original's own dimensions. The plate is a band of fixed height, so these give
            // the browser a definite width for it before a byte has loaded - the picture arrives
            // into the space it was already occupying rather than pushing the article down.
            width={detail.image.width}
            height={detail.image.height}
            decoding="async"
          />
        </figure>
      ) : null}

      <div className="entry__layout">
        <section className="entry__article" aria-label="Article">
          {isEditing ? (
            <LoreEditor
              value={draft.content}
              onChange={(json) =>
                setDraft((current) => (current ? { ...current, content: json } : current))
              }
            />
          ) : isEmptyDocument(detail?.content ?? null) ? (
            <p className="entry__blank">No article yet. Edit this entry to start writing.</p>
          ) : (
            <LoreArticle content={detail?.content ?? null} />
          )}
        </section>

        <aside className="entry__rail">
          {isEditing ? (
            <>
              <EntityImageField
                universeId={universe.id}
                entityId={isNew ? null : entityId}
                image={detail?.image ?? null}
                pending={pendingImage}
                onPending={setPendingImage}
                onChanged={(image) => {
                  setDetail((current) => (current ? { ...current, image } : current))
                  // An image change is a version like any other, so the history beside it is
                  // read again rather than left sitting one write behind.
                  setHistoryKey((key) => key + 1)
                }}
                disabled={isSaving}
              />

              <TokenInput
                label="Aliases"
                name="aliases"
                placeholder="Other names"
                values={draft.aliases}
                onChange={(aliases) => setDraft({ ...draft, aliases })}
              />
              <TokenInput
                label="Tags"
                name="tags"
                placeholder="Add a tag"
                values={draft.tags}
                onChange={(tags) => setDraft({ ...draft, tags })}
              />

              {(selectedType?.fields ?? []).map((definition) => (
                <div key={definition.id}>
                  <FieldInput
                    definition={definition}
                    value={draft.fields[definition.id] ?? emptyValue(definition)}
                    candidates={candidates}
                    retainedReference={retainedReference(detail, candidates, definition.id)}
                    onChange={(next) =>
                      setDraft((current) =>
                        current
                          ? { ...current, fields: { ...current.fields, [definition.id]: next } }
                          : current,
                      )
                    }
                  />
                  {fieldErrors[definition.id] ? (
                    <p className="field__error">{fieldErrors[definition.id]}</p>
                  ) : null}
                </div>
              ))}
            </>
          ) : (
            <>
              {(detail?.fields.length ?? 0) > 0 ? (
                <dl className="facts" data-testid="entry-fields">
                  {detail!.fields.map((value) => (
                    <div className="facts__row" key={value.fieldDefinitionId}>
                      <dt className="facts__key">{value.name}</dt>
                      <dd className="facts__value">{renderFact(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {(detail?.tags.length ?? 0) > 0 ? (
                <div className="rail__block">
                  <h3 className="rail__heading">Tags</h3>
                  <p className="dossier__tags" data-testid="entry-tags">
                    {detail!.tags.map((tag) => (
                      <span className="chip" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </p>
                </div>
              ) : null}

              {detail ? (
                <p className="rail__meta">
                  Created {formatDate(detail.createdAt)}, last changed{' '}
                  {formatDate(detail.updatedAt)}
                </p>
              ) : null}
            </>
          )}
        </aside>
      </div>

      {!isNew && !isEditing ? (
        <>
          <RelationshipSection
            universeId={universe.id}
            entityId={entityId}
            entityName={detail?.name ?? ''}
          />
          <EntityHistory
            universeId={universe.id}
            entityId={entityId}
            reloadKey={historyKey}
            onRestored={() => void reloadAfterRestore()}
          />
        </>
      ) : null}

      <footer className="entry__actions">
        {isEditing ? (
          <>
            <button
              className="button"
              type="button"
              onClick={save}
              disabled={isSaving}
              data-testid="save-entity"
            >
              {isSaving ? 'Saving' : isNew ? 'Create entry' : 'Save changes'}
            </button>
            {!isNew ? (
              <button
                className="button button--quiet"
                type="button"
                onClick={() => {
                  if (detail) setDraft(draftFromDetail(detail))
                  setIsEditing(false)
                  setMessage(null)
                  setFieldErrors({})
                  setBlocked(null)
                }}
              >
                Cancel
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button
              className="button"
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={isSaving}
              data-testid="edit-entity"
            >
              Edit
            </button>
            <button
              className="button button--quiet"
              type="button"
              onClick={moveToTrash}
              disabled={isSaving}
              data-testid="trash-entity"
            >
              Move to Trash
            </button>
          </>
        )}
      </footer>
    </article>
  )
}

/**
 * The reference a field already holds, when the picker's own list does not contain it.
 *
 * That happens for an entry in the Trash - the listing never offers one - and for an entry
 * past the first page the picker loaded. Either way the stored id has to stay in the select,
 * or saving any other field on this form would silently clear the reference.
 */
function retainedReference(
  detail: EntityDetail | null,
  candidates: EntitySummary[],
  fieldDefinitionId: string,
) {
  const held = detail?.fields.find((value) => value.fieldDefinitionId === fieldDefinitionId)

  if (!held?.referencedEntityId || candidates.some((one) => one.id === held.referencedEntityId)) {
    return null
  }

  const name = held.referencedEntityName ?? 'Unavailable'

  return {
    id: held.referencedEntityId,
    label: held.referencedEntityIsTrashed ? `${name} (in Trash)` : name,
  }
}

function renderFact(value: {
  kind: number
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionValues: string[]
  referencedEntityName: string | null
  referencedEntityIsTrashed: boolean
}) {
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
      if (value.referencedEntityName === null) return '—'
      // Named, not hidden: the entry is still there and still connected, it is simply in the
      // Trash. Saying so is what stops the author reading it as lore that has gone missing.
      return value.referencedEntityIsTrashed
        ? `${value.referencedEntityName} (in Trash)`
        : value.referencedEntityName
    default:
      return '—'
  }
}
