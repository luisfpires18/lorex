import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { Check, Network, Pencil, Trash, X } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { EntityArticleSection } from '../components/EntityArticle'
import { EntityHistory } from '../components/EntityHistory'
import { EntityImageField, type PendingImage } from '../components/EntityImageField'
import { FieldInput } from '../components/FieldInputs'
import { NameList } from '../components/NameList'
import { RelationshipSection } from '../components/RelationshipSection'
import { emptyValue } from '../lore/document'
import { entityImageUrl, setEntityImage } from '../lore/images'
import { TokenInput } from '../components/TokenInput'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { formatChronologyYear } from '../chronology/format'
import type { Chronology } from '../chronology/types'
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
      eraId: value.eraId,
    }
  }

  return {
    entityTypeId: detail.entityTypeId,
    name: detail.name,
    summary: detail.summary ?? '',
    canonStatus: detail.canonStatus,
    aliases: detail.aliases,
    tags: detail.tags,
    fields,
  }
}

/** How long the article stays marked after a link lands on it - the story page's scene and beat mark, for the same reason. */
const ARRIVAL_MS = 2400

/**
 * Which of the entry's three views is open. Read from the address and written back to it, never held
 * as page state: each one is a place, so it reloads, it is linkable, and Back leaves it (ADR 0028).
 */
type EntryView = 'article' | 'relations' | 'history'

/**
 * One entry, under one header, at three addresses.
 *
 * The header is the whole identity and every action on the entry itself: the type it is, the Canon status it
 * holds, and Edit, Family tree and Move to Trash - all of it above the article, so none of it depends on how
 * long the entry has grown. Under it the entry's own navigation, which is three ordinary links rather than a
 * tablist, because each view is a separate address that the browser's Back, a reload and a shared link all
 * have to land on.
 *
 * Article is the default and carries the picture, the structured facts beside it and the prose, with the
 * article's own history under it. Relations is every link this entry has, and History is the versions of its
 * details - a boundary the domain draws and this page keeps: an article's versions are the article's.
 *
 * Nothing about any of this reads the entry's type. A Character, a Location and a type an author invented
 * this morning are the same screen.
 */
export default function EntityPage({ view = 'article' }: { view?: EntryView }) {
  const { universe, chronology } = useOutletContext<WorkspaceContext>()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // A new entry opened from a Lore type (`lore/new?type=<id>`) starts in that type; the author can
  // still change it. Read by id only, and only if this universe has that type.
  const [searchParams] = useSearchParams()
  const startingTypeId = searchParams.get('type')

  const isNew = entityId === undefined
  const [types, setTypes] = useState<EntityType[]>([])
  const [candidates, setCandidates] = useState<EntitySummary[]>([])
  const [detail, setDetail] = useState<EntityDetail | null>(null)
  const [editedDraft, setDraft] = useState<Draft | null>(null)
  const [isFormOpen, setIsEditing] = useState(isNew)

  // The entry's form belongs to the Article view - it edits what that view shows. Deriving this rather
  // than clearing it on a view change is what makes the browser's Back honest: going back to Relations
  // shows Relations, and coming forward again finds the form exactly as it was left.
  const isEditing = isFormOpen && view === 'article'
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    isNew ? 'ready' : 'loading',
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // While the article is being written it has its own save bar, and the entry's actions step aside for it: one
  // editor, and one bar at the foot of a phone's screen, at a time.
  const [isWritingArticle, setIsWritingArticle] = useState(false)

  /** An article save touched the entry: the rail's "last changed" says so without reading the entry again. */
  const articleSaved = useCallback((updatedAt: string) => {
    setDetail((current) => (current ? { ...current, updatedAt } : current))
  }, [])

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
      entityTypeId: types.find((type) => type.id === startingTypeId)?.id ?? types[0].id,
      name: '',
      summary: '',
      canonStatus: CanonStatus.Idea,
      aliases: [],
      tags: [],
      fields: {},
    } satisfies Draft
  }, [editedDraft, isNew, types, startingTypeId])

  const selectedType = useMemo(
    () => types.find((type) => type.id === draft?.entityTypeId) ?? null,
    [types, draft?.entityTypeId],
  )

  // A link to `#article` - a search result whose words were in the article - lands on it once the entry is on screen:
  // scrolled to, the focus on its heading, and marked for a moment. The entry's id and the location's key run it again for
  // another entry, or the same link followed twice.
  const arrivedFor = status === 'ready' ? (detail?.id ?? null) : null
  useEffect(() => {
    if (arrivedFor === null || location.hash !== '#article') return
    const target = document.getElementById('article')
    if (!target) return

    target.scrollIntoView({ block: 'start' })
    target.querySelector<HTMLElement>('[data-arrival-focus]')?.focus({ preventScroll: true })
    target.setAttribute('data-arrived', 'true')
    const timer = window.setTimeout(() => target.removeAttribute('data-arrived'), ARRIVAL_MS)

    return () => {
      window.clearTimeout(timer)
      target.removeAttribute('data-arrived')
    }
  }, [arrivedFor, location.hash, location.key])

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
          image = await setEntityImage(universe.id, saved.id, pendingImage.file, pendingImage.crop)
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
  const entryPath = `/app/universes/${universe.id}/lore/${entityId}`

  /**
   * Starts the entry's own form, from whichever view the author pressed Edit on.
   *
   * The form edits what the Article view shows - the picture, the facts, the summary - so it opens there.
   * A move from Relations or History is an ordinary navigation, so anything unsaved has already been asked
   * about by the time this runs.
   */
  function startEditing() {
    setIsEditing(true)
    if (view !== 'article') void navigate(entryPath)
  }

  return (
    <article
      className="entry"
      style={accent ? { ['--entry-accent' as string]: accent } : undefined}
    >
      <header className="entry__head">
        <div className="entry__kind">
          <nav className="entry__crumbs" aria-label="Breadcrumb">
            <Link to={`/app/universes/${universe.id}/lore`}>Lore</Link>
          </nav>

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
            // Back to the Lore list at this entry's type, by the type's id.
            <Link
              className="entry__type"
              to={`/app/universes/${universe.id}/lore?type=${detail?.entityTypeId ?? draft.entityTypeId}`}
              data-testid="entry-type"
            >
              <bdi>{detail?.entityTypeName ?? selectedType?.name}</bdi>
            </Link>
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
            dir="auto"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        ) : (
          <h1 className="entry__name" data-testid="entry-name">
            <bdi>{detail?.name}</bdi>
          </h1>
        )}
        {fieldErrors.name ? <p className="field__error">{fieldErrors.name}</p> : null}

        {!isEditing && (detail?.aliases.length ?? 0) > 0 ? (
          <p className="entry__aliases" data-testid="entry-aliases">
            also known as <NameList names={detail!.aliases} />
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
          <p className="entry__summary prose" data-testid="entry-summary">
            {detail.summary}
          </p>
        ) : null}
      </header>

      {/* One bar under the identity: where in the entry you are, and what you can do to the entry itself.
          Neither belongs at the foot of a page whose length is whatever the author wrote. It is not drawn
          while the entry's own form is open - there is one editor at a time, and it has its own bar - nor
          while the article is being written, for the same reason. */}
      {!isNew && !isEditing ? (
        <div className="entry__bar">
          <nav className="views" aria-label="Entry views" data-testid="entry-views">
            <NavLink to={entryPath} end className="views__link" data-testid="entry-view-article">
              Article
            </NavLink>
            <NavLink
              to={`${entryPath}/relations`}
              className="views__link"
              data-testid="entry-view-relations"
            >
              Relations
            </NavLink>
            <NavLink
              to={`${entryPath}/history`}
              className="views__link"
              data-testid="entry-view-history"
            >
              History
            </NavLink>
          </nav>

          {isWritingArticle ? null : (
            <div className="entry__tools">
              <button
                className="button button--quiet button--icon"
                type="button"
                onClick={startEditing}
                disabled={isSaving}
                data-testid="edit-entity"
              >
                <ActionIcon icon={Pencil} />
                Edit
              </button>
              {/* Offered on every entry: family is recorded by the author, never inferred from what an
                  entry is. An entry with no family connections opens an empty tree that says so. */}
              <Link
                className="button button--quiet button--icon"
                to={`/app/universes/${universe.id}/family-tree/${entityId}`}
                data-testid="entity-family-tree"
              >
                <ActionIcon icon={Network} />
                Family tree
              </Link>
              <button
                className="button button--quiet button--icon entry__trash"
                type="button"
                onClick={moveToTrash}
                disabled={isSaving}
                data-testid="trash-entity"
              >
                <ActionIcon icon={Trash} />
                Move to Trash
              </button>
            </div>
          )}
        </div>
      ) : null}

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

      {view === 'article' ? (
        <div className="entry__layout">
          <div className="entry__main">
            {!isEditing && detail?.image ? (
              <figure className="entry__plate" data-testid="entry-image">
                <img
                  src={entityImageUrl(universe.id, detail.id, detail.image, 'original')}
                  alt={detail.name}
                  // The original's own dimensions, which give the browser the picture's shape before a byte
                  // of it has loaded: the space it will occupy is reserved from its own aspect ratio, so the
                  // article never jumps down the page as one arrives.
                  width={detail.image.width}
                  height={detail.image.height}
                  decoding="async"
                />
              </figure>
            ) : null}

            {isNew ? (
              <section className="entry__article" aria-label="Article">
                <p className="entry__blank">
                  Once the entry is created, you can write its article here.
                </p>
              </section>
            ) : (
              <EntityArticleSection
                key={entityId}
                universeId={universe.id}
                entityId={entityId}
                entityName={detail?.name ?? ''}
                canEdit={!isEditing}
                onEditingChange={setIsWritingArticle}
                onSaved={articleSaved}
              />
            )}
          </div>

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
                      chronology={chronology}
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
                        <dd className="facts__value prose">{renderFact(value, chronology)}</dd>
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
      ) : view === 'relations' ? (
        <div className="entry__view">
          <RelationshipSection
            universeId={universe.id}
            entityId={entityId!}
            entityName={detail?.name ?? ''}
          />
        </div>
      ) : (
        <div className="entry__view">
          <EntityHistory
            universeId={universe.id}
            entityId={entityId!}
            chronology={chronology}
            reloadKey={historyKey}
            onRestored={() => void reloadAfterRestore()}
          />
        </div>
      )}

      {/* The form's own bar, and the only thing left at the foot of the page: Save and Cancel belong at the
          end of what is being filled in. On a phone it sticks to the bottom edge, as it always has. */}
      {isEditing ? (
        <footer className="entry__actions">
          <button
            className="button button--icon"
            type="button"
            onClick={save}
            disabled={isSaving}
            data-testid="save-entity"
          >
            <ActionIcon icon={Check} />
            {isSaving ? 'Saving' : isNew ? 'Create entry' : 'Save changes'}
          </button>
          {!isNew ? (
            <button
              className="button button--quiet button--icon"
              type="button"
              onClick={() => {
                if (detail) setDraft(draftFromDetail(detail))
                setIsEditing(false)
                setMessage(null)
                setFieldErrors({})
                setBlocked(null)
              }}
            >
              <ActionIcon icon={X} />
              Cancel
            </button>
          ) : null}
        </footer>
      ) : null}
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

function renderFact(
  value: {
    kind: number
    text: string | null
    number: number | null
    eraId: string | null
    boolean: boolean | null
    date: string | null
    optionValues: string[]
    referencedEntityName: string | null
    referencedEntityIsTrashed: boolean
  },
  chronology: Chronology,
) {
  switch (value.kind) {
    case FieldKind.ShortText:
    case FieldKind.LongText:
      return value.text ?? '—'
    case FieldKind.Number:
      if (value.number === null) return '—'
      // A year in an era reads the way the universe writes it; any other number stays as typed.
      return value.eraId
        ? formatChronologyYear(chronology, value.number, value.eraId)
        : value.number
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
