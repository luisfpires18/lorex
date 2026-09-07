import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { FieldInput } from '../components/FieldInputs'
import { LoreArticle, LoreEditor } from '../components/LoreEditor'
import { emptyValue, isEmptyDocument } from '../lore/document'
import { TokenInput } from '../components/TokenInput'
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
  const [isSaving, setIsSaving] = useState(false)

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

      setDetail(saved)
      setDraft(draftFromDetail(saved))
      setIsEditing(false)

      if (isNew) {
        await navigate(`/app/universes/${universe.id}/lore/${saved.id}`, { replace: true })
      }
    } catch (error: unknown) {
      if (error instanceof ApiError) {
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
  }, [draft, selectedType, isNew, universe.id, entityId, navigate])

  async function changeCanon(next: CanonStatusValue) {
    if (!draft) return
    const updated = { ...draft, canonStatus: next }
    setDraft(updated)

    if (isNew || isEditing) return

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
    } catch {
      setMessage('The status could not be changed.')
    } finally {
      setIsSaving(false)
    }
  }

  async function remove() {
    if (isNew || !window.confirm('Delete this entry permanently?')) return
    await deleteEntity(universe.id, entityId)
    await navigate(`/app/universes/${universe.id}/lore`, { replace: true })
  }

  if (status === 'loading' || !draft) {
    return (
      <p className="notice" role="status">
        Opening…
      </p>
    )
  }

  if (status === 'missing') {
    return (
      <div className="empty" data-testid="entity-missing">
        <p className="empty__line">That entry is not here.</p>
        <p className="empty__hint">
          <Link to={`/app/universes/${universe.id}/lore`}>Back to the lore</Link>
        </p>
      </div>
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
              aria-label="Type"
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

      {message ? (
        <p className="form__message" role="alert" data-testid="entry-error">
          {message}
        </p>
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
              data-testid="edit-entity"
            >
              Edit
            </button>
            <button className="button button--quiet" type="button" onClick={remove}>
              Delete
            </button>
          </>
        )}
      </footer>
    </article>
  )
}

function renderFact(value: {
  kind: number
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionValues: string[]
  referencedEntityName: string | null
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
      return value.referencedEntityName ?? '—'
    default:
      return '—'
  }
}
