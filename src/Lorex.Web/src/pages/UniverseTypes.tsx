import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { Field } from '../components/Field'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { useQueryTab } from '../lib/queryTab'
import { RelationshipTypeManager } from '../components/RelationshipTypeManager'
import { TypeIcon } from '../components/TypeIcon'
import { TypeIconPicker } from '../components/TypeIconPicker'
import { ValidationTermManager } from '../components/ValidationTermManager'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import {
  addField,
  createEntityType,
  deleteEntityType,
  deleteField,
  listEntityTypes,
  moveEntityType,
  updateEntityType,
  updateField,
} from '../lore/api'
import {
  FIELD_KIND_LABELS,
  FIELD_SEMANTIC_LABELS,
  FieldKind,
  semanticsFor,
  type EntityType,
  type FieldDefinition,
  type FieldKindValue,
  type FieldSemanticValue,
} from '../lore/types'
import { buildTypeTree, branchIds, typePathLabel, type TypeTree } from '../lore/typeTree'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'

const KIND_ORDER: FieldKindValue[] = [
  FieldKind.ShortText,
  FieldKind.LongText,
  FieldKind.Number,
  FieldKind.Boolean,
  FieldKind.Date,
  FieldKind.Select,
  FieldKind.MultiSelect,
  FieldKind.EntityReference,
]

/** Three vocabularies, one screen: kept apart as tabs so none of them is a long scroll below another. */
const TABS = [
  { id: 'lore', label: 'Lore Types' },
  { id: 'relations', label: 'Relation Kinds' },
  { id: 'events', label: 'Event Kinds & Methods' },
] as const

const LEDES: Record<(typeof TABS)[number]['id'], string> = {
  lore: 'Every entry is one of these. Add your own, nest one inside another to organise Lore, and give each the fields this world actually needs.',
  relations:
    'How entries connect: each kind’s two readings, its Canon constraints and its family meaning.',
  events: 'The event kinds and methods a moment and a world rule’s check can name.',
}

/**
 * The universe's vocabularies (Product refinement 016): Lore Types, Relation Kinds, and Event Kinds & Methods, each a tab
 * in the address (`?tab=`) as real steps of history - Back and Forward walk the tabs, unlike Settings. Every panel stays mounted, so a half-written relation kind
 * survives a look at another tab.
 */
export default function UniverseTypes() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const [tab, chooseTab] = useQueryTab(TABS, { history: 'push' })

  const [types, setTypes] = useState<EntityType[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // The type editor: a new type, or the existing one being edited. One drawer for both.
  const [editing, setEditing] = useState<EntityType | 'new' | null>(null)
  const [openTypeId, setOpenTypeId] = useState<string | null>(null)
  // Why one type cannot be deleted, said under it: counted from the list, or the API's own words if it refused.
  const [blocked, setBlocked] = useState<{ typeId: string; text: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [fieldName, setFieldName] = useState('')
  const [fieldKind, setFieldKind] = useState<FieldKindValue>(FieldKind.ShortText)
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldOptions, setFieldOptions] = useState('')
  const [fieldSemantic, setFieldSemantic] = useState<FieldSemanticValue | null>(null)
  const [busyFieldId, setBusyFieldId] = useState<string | null>(null)

  const tree = useMemo(() => buildTypeTree(types ?? []), [types])
  // One move at a time; the button that asked keeps the focus once its row has moved (React moves the row's node, which
  // a browser does not keep focused on its own).
  const [moving, setMoving] = useState<string | null>(null)
  const moveButtons = useRef(new Map<string, HTMLButtonElement>())
  const refocus = useRef<string | null>(null)

  useEffect(() => {
    if (!refocus.current) return
    moveButtons.current.get(refocus.current)?.focus()
    refocus.current = null
  }, [types])

  useEffect(() => {
    const controller = new AbortController()
    listEntityTypes(universe.id, controller.signal)
      .then(setTypes)
      .catch(() => {
        // Leaving the screen aborts this read. That is not a failure to report: the message
        // belongs to a request that was answered badly, not to one Lorex cancelled itself.
        if (controller.signal.aborted) return
        setMessage('The types could not be loaded.')
      })
    return () => {
      controller.abort()
    }
  }, [universe.id])

  function report(error: unknown, fallback: string) {
    setMessage(error instanceof ApiError ? error.message : fallback)
  }

  async function refresh() {
    setTypes(await listEntityTypes(universe.id))
  }

  /** One place up or down among the type's own siblings; the list comes back from the move itself. */
  async function move(type: EntityType, direction: 'up' | 'down') {
    if (moving) return
    setMessage(null)
    setNotice(null)
    setMoving(type.id)
    try {
      const moved = await moveEntityType(universe.id, type.id, direction)
      refocus.current = `${type.id}:${direction}`
      setTypes(moved)
      setNotice(`Moved “${type.name}” ${direction}.`)
    } catch (error: unknown) {
      report(error, 'That type could not be moved.')
    } finally {
      setMoving(null)
    }
  }

  /**
   * Deleting a type. A type any entry still uses - in Lore or in the Trash, since an entry there keeps its type - is not
   * offered a confirmation it could only fail: the author is told, under the type, exactly what uses it and where to
   * go. An unused type asks once, as every irreversible action in Lorex does, and is gone.
   */
  async function removeType(type: EntityType) {
    setMessage(null)
    setNotice(null)
    setBlocked(null)

    // Nested types hold it too: never deleted with it, never promoted or moved somewhere the author did not choose.
    const children = tree.byId.get(type.id)?.children.length ?? 0
    if (type.entityCount > 0 || children > 0) {
      setBlocked({
        typeId: type.id,
        text: inUseDetail(
          type.name,
          type.entityCount - type.trashedEntityCount,
          type.trashedEntityCount,
          children,
        ),
      })
      return
    }

    if (
      !window.confirm(`Delete the type “${type.name}”?\n\nNo entry uses it. This cannot be undone.`)
    ) {
      return
    }

    try {
      await deleteEntityType(universe.id, type.id)
      setNotice(`Deleted the type “${type.name}”.`)
      if (openTypeId === type.id) setOpenTypeId(null)
      await refresh()
    } catch (error: unknown) {
      // Used since the list was read - another tab, or the entry form - so the API's count is the true one.
      if (error instanceof ApiError && error.status === 409) {
        setBlocked({ typeId: type.id, text: error.message })
        await refresh().catch(() => undefined)
      } else {
        report(error, 'That type could not be deleted.')
      }
    }
  }

  async function submitField(typeId: string) {
    if (!fieldName.trim()) return
    setMessage(null)

    const needsOptions = fieldKind === FieldKind.Select || fieldKind === FieldKind.MultiSelect
    try {
      await addField(universe.id, typeId, {
        name: fieldName.trim(),
        kind: fieldKind,
        isRequired: fieldRequired,
        displayOrder: null,
        defaultValue: null,
        options: needsOptions
          ? fieldOptions
              .split(',')
              .map((option) => option.trim())
              .filter(Boolean)
          : null,
        semantic: fieldSemantic,
      })
      setFieldName('')
      setFieldOptions('')
      setFieldRequired(false)
      setFieldSemantic(null)
      await refresh()
    } catch (error: unknown) {
      report(error, 'That field could not be added.')
    }
  }

  /**
   * Declares, changes or withdraws what one existing field means. Everything else about the
   * definition is sent back as it stands: this control edits the meaning and nothing else.
   *
   * The route is gated, so pointing a meaning at a field a hundred Canon entries have
   * already filled in can be refused. That refusal, and the "only one field may mean it"
   * validation, both arrive as ordinary API errors and are reported like any other.
   */
  async function changeMeaning(
    typeId: string,
    field: FieldDefinition,
    semantic: FieldSemanticValue | null,
  ) {
    setMessage(null)
    setBusyFieldId(field.id)
    try {
      await updateField(universe.id, typeId, field.id, {
        name: field.name,
        kind: field.kind,
        isRequired: field.isRequired,
        displayOrder: field.displayOrder,
        defaultValue: field.defaultValue,
        options: field.options.map((option) => option.value),
        semantic,
      })
      await refresh()
    } catch (error: unknown) {
      report(error, 'That meaning could not be changed.')
    } finally {
      setBusyFieldId(null)
    }
  }

  async function removeField(typeId: string, fieldId: string) {
    setMessage(null)
    try {
      await deleteField(universe.id, typeId, fieldId)
      await refresh()
    } catch (error: unknown) {
      report(error, 'That field could not be deleted.')
    }
  }

  return (
    <article className="types">
      <PageHeader
        title="Types"
        lede={LEDES[tab]}
        actions={
          tab === 'lore' ? (
            <button
              className="button"
              type="button"
              onClick={() => setEditing('new')}
              data-testid="new-type"
            >
              <ActionIcon icon={Plus} />
              New type
            </button>
          ) : null
        }
      >
        <QueryTabList label="Types" idPrefix="types" tabs={TABS} tab={tab} onChoose={chooseTab} />
      </PageHeader>

      {editing ? (
        <TypeDialog
          universeId={universe.id}
          tree={tree}
          type={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (savedName) => {
            const wasNew = editing === 'new'
            setEditing(null)
            setBlocked(null)
            setNotice(
              wasNew ? `Created the type “${savedName}”.` : `Saved the type “${savedName}”.`,
            )
            await refresh()
          }}
        />
      ) : null}

      <TabPanel idPrefix="types" id="lore" tab={tab}>
        {message ? (
          <p className="form__message" role="alert" data-testid="types-error">
            {message}
          </p>
        ) : null}

        <p className="types__notice" role="status" data-testid="types-notice">
          {notice}
        </p>

        {!types ? (
          <p className="notice" role="status">
            Reading the types…
          </p>
        ) : (
          <ul className="types__list" data-testid="type-list">
            {tree.ordered.map((node) => {
              const type = node.type
              const siblings =
                node.depth === 0
                  ? tree.roots
                  : tree.byId.get(node.path[node.path.length - 2]!.id)!.children
              const place = siblings.indexOf(node)
              const isFirst = place === 0
              const isLast = place === siblings.length - 1
              return (
                <li
                  className="types__row"
                  key={type.id}
                  data-type-name={type.name}
                  data-depth={node.depth}
                  style={{ ['--depth' as string]: Math.min(node.depth, 6) }}
                >
                  <div className="types__head">
                    <span className="types__icon" data-testid={`type-icon-${type.name}`}>
                      <TypeIcon iconKey={type.icon} />
                    </span>
                    <span className="types__name">
                      <bdi>{type.name}</bdi>
                      {node.depth > 0 ? (
                        <span className="visually-hidden">
                          , inside{' '}
                          {typePathLabel(tree.byId.get(node.path[node.path.length - 2]!.id)!)}
                        </span>
                      ) : null}
                    </span>
                    <span className="types__count" data-testid={`type-count-${type.name}`}>
                      {type.entityCount === 1 ? '1 entry' : `${type.entityCount} entries`}
                      {type.trashedEntityCount > 0 ? (
                        <span className="types__trashed">
                          {type.trashedEntityCount === type.entityCount
                            ? type.entityCount === 1
                              ? ', in the Trash'
                              : ', all in the Trash'
                            : `, ${type.trashedEntityCount} in the Trash`}
                        </span>
                      ) : null}
                    </span>
                    <span className="types__actions">
                      <span
                        className="types__move"
                        role="group"
                        aria-label={`Order of ${type.name}`}
                      >
                        {(['up', 'down'] as const).map((direction) => {
                          const isEnd = direction === 'up' ? isFirst : isLast
                          return (
                            <button
                              key={direction}
                              ref={(element) => {
                                const key = `${type.id}:${direction}`
                                if (element) moveButtons.current.set(key, element)
                                else moveButtons.current.delete(key)
                              }}
                              className="button button--text button--sm types__movebutton"
                              type="button"
                              aria-disabled={isEnd || moving !== null || undefined}
                              aria-label={`Move ${type.name} ${direction}`}
                              title={
                                isEnd
                                  ? direction === 'up'
                                    ? 'Already first among its siblings'
                                    : 'Already last among its siblings'
                                  : undefined
                              }
                              onClick={() => {
                                if (!isEnd) void move(type, direction)
                              }}
                              data-testid={`move-${direction}-${type.name}`}
                            >
                              <ActionIcon icon={direction === 'up' ? ArrowUp : ArrowDown} />
                              {direction === 'up' ? 'Up' : 'Down'}
                            </button>
                          )
                        })}
                      </span>
                      <button
                        className="button button--secondary button--sm"
                        type="button"
                        onClick={() => {
                          setBlocked(null)
                          setEditing(type)
                        }}
                        aria-label={`Edit ${type.name}`}
                        data-testid={`edit-type-${type.name}`}
                      >
                        <ActionIcon icon={Pencil} />
                        Edit
                      </button>
                      <button
                        className="button button--secondary button--sm"
                        type="button"
                        aria-expanded={openTypeId === type.id}
                        aria-label={`Fields of ${type.name}`}
                        onClick={() => setOpenTypeId(openTypeId === type.id ? null : type.id)}
                        data-testid={`fields-${type.name}`}
                      >
                        Fields
                        {type.fields.length > 0 ? (
                          <span className="types__fieldcount">{type.fields.length}</span>
                        ) : null}
                      </button>
                      <ActionMenu
                        label={`More actions for ${type.name}`}
                        triggerTestId={`type-actions-${type.name}`}
                      >
                        <button
                          className="actionmenu__item actionmenu__item--danger"
                          type="button"
                          onClick={() => void removeType(type)}
                          data-testid={`delete-type-${type.name}`}
                        >
                          Delete type
                        </button>
                      </ActionMenu>
                    </span>
                  </div>

                  {type.description ? (
                    <p className="types__description prose">{type.description}</p>
                  ) : null}

                  {blocked?.typeId === type.id ? (
                    <div
                      className="callout callout--warning types__blocked"
                      role="alert"
                      data-testid={`type-blocked-${type.name}`}
                    >
                      <p className="types__blockedtext">{blocked.text}</p>
                      <p className="types__blockedlinks">
                        {type.entityCount > type.trashedEntityCount ? (
                          <Link to={`/app/universes/${universe.id}/lore?type=${type.id}`}>
                            Show its entries in Lore
                          </Link>
                        ) : null}
                        {type.trashedEntityCount > 0 ? (
                          <Link to={`/app/universes/${universe.id}/trash`}>Open the Trash</Link>
                        ) : null}
                      </p>
                    </div>
                  ) : null}

                  {openTypeId === type.id ? (
                    <div className="types__fields">
                      {type.fields.length > 0 ? (
                        <ul className="types__fieldlist">
                          {type.fields.map((field) => (
                            <li key={field.id} data-field-name={field.name}>
                              <span className="types__fieldname">{field.name}</span>
                              <span className="types__fieldkind">
                                {FIELD_KIND_LABELS[field.kind]}
                              </span>
                              {field.isRequired ? (
                                <span className="types__fieldkind">required</span>
                              ) : null}
                              {semanticsFor(field.kind).length > 0 ? (
                                <select
                                  className="types__meaning"
                                  aria-label={`Canon meaning of ${field.name}`}
                                  value={field.semantic ?? ''}
                                  disabled={busyFieldId === field.id}
                                  onChange={(event) =>
                                    void changeMeaning(
                                      type.id,
                                      field,
                                      event.target.value === ''
                                        ? null
                                        : (Number(event.target.value) as FieldSemanticValue),
                                    )
                                  }
                                  data-testid={`field-meaning-${field.name}`}
                                >
                                  <option value="">No meaning</option>
                                  {semanticsFor(field.kind).map((semantic) => (
                                    <option key={semantic} value={semantic}>
                                      {FIELD_SEMANTIC_LABELS[semantic]}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                              <button
                                className="token__remove"
                                type="button"
                                aria-label={`Delete ${field.name}`}
                                onClick={() => removeField(type.id, field.id)}
                              >
                                &times;
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="settings__note">No custom fields yet.</p>
                      )}

                      <div className="types__add">
                        <Field
                          label="Field name"
                          name={`field-name-${type.id}`}
                          value={fieldName}
                          onChange={(event) => setFieldName(event.target.value)}
                        />

                        <div className="field">
                          <label className="field__label" htmlFor={`field-kind-${type.id}`}>
                            Kind
                          </label>
                          <select
                            id={`field-kind-${type.id}`}
                            className="field__input field__input--select"
                            value={fieldKind}
                            onChange={(event) => {
                              const kind = Number(event.target.value) as FieldKindValue
                              setFieldKind(kind)
                              // A meaning belongs to a shape. Switching away from one that can
                              // carry it drops it rather than sending a pair the API refuses.
                              setFieldSemantic((current) =>
                                current !== null && semanticsFor(kind).includes(current)
                                  ? current
                                  : null,
                              )
                            }}
                          >
                            {KIND_ORDER.map((kind) => (
                              <option key={kind} value={kind}>
                                {FIELD_KIND_LABELS[kind]}
                              </option>
                            ))}
                          </select>
                        </div>

                        {fieldKind === FieldKind.Select || fieldKind === FieldKind.MultiSelect ? (
                          <Field
                            label="Options, separated by commas"
                            name={`field-options-${type.id}`}
                            value={fieldOptions}
                            onChange={(event) => setFieldOptions(event.target.value)}
                          />
                        ) : null}

                        {semanticsFor(fieldKind).length > 0 ? (
                          <div className="field">
                            <label className="field__label" htmlFor={`field-semantic-${type.id}`}>
                              Canon meaning
                            </label>
                            <select
                              id={`field-semantic-${type.id}`}
                              className="field__input field__input--select"
                              value={fieldSemantic ?? ''}
                              onChange={(event) =>
                                setFieldSemantic(
                                  event.target.value === ''
                                    ? null
                                    : (Number(event.target.value) as FieldSemanticValue),
                                )
                              }
                              data-testid={`field-semantic-${type.name}`}
                            >
                              <option value="">None</option>
                              {semanticsFor(fieldKind).map((semantic) => (
                                <option key={semantic} value={semantic}>
                                  {FIELD_SEMANTIC_LABELS[semantic]}
                                </option>
                              ))}
                            </select>
                            <p className="field__hint">
                              Read by the deterministic Canon Integrity rules, never by a reader,
                              and never guessed from the field&rsquo;s name. Most fields need none.
                            </p>
                          </div>
                        ) : null}

                        <label className="check">
                          <input
                            type="checkbox"
                            checked={fieldRequired}
                            onChange={(event) => setFieldRequired(event.target.checked)}
                          />
                          <span>Required</span>
                        </label>

                        <button
                          className="button"
                          type="button"
                          onClick={() => submitField(type.id)}
                          data-testid={`add-field-${type.name}`}
                        >
                          Add field
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </TabPanel>

      <TabPanel idPrefix="types" id="relations" tab={tab}>
        <RelationshipTypeManager universeId={universe.id} />
      </TabPanel>

      <TabPanel idPrefix="types" id="events" tab={tab}>
        <ValidationTermManager universeId={universe.id} />
      </TabPanel>
    </article>
  )
}

/**
 * Why a type cannot be deleted, in the author's terms. The same sentence the API's refusal carries
 * (`EntityTypeEndpoints.InUseDetail`), said from the list before anything is sent: an entry in the Trash is out of sight in
 * Lore and still keeps its type, so it is named.
 */
function inUseDetail(name: string, live: number, trashed: number, children = 0) {
  const nested = children === 1 ? '1 nested type' : `${children} nested types`
  if (live + trashed === 0) {
    return `${name} can't be deleted because it still contains ${nested}. Move or delete those types first.`
  }
  const total = live + trashed
  const uses = total === 1 ? '1 entry still uses it' : `${total} entries still use it`
  const where =
    trashed === 0
      ? ''
      : trashed === total
        ? total === 1
          ? ', and it is in the Trash'
          : ', all of them in the Trash'
        : `, ${trashed} of them in the Trash`
  const fix =
    total === 1
      ? trashed === 0
        ? 'Move it to another type first.'
        : 'Restore it from the Trash, then move it to another type.'
      : trashed === 0
        ? 'Move them to another type first.'
        : 'Move them to another type first; an entry in the Trash has to be restored before it can be moved.'
  return children === 0
    ? `${name} can't be deleted because ${uses}${where}. ${fix}`
    : `${name} can't be deleted because ${uses}${where}, and it still contains ${nested}. ${fix} ` +
        (children === 1 ? 'Move or delete that type too.' : 'Move or delete those types too.')
}

/**
 * One Lore Type, new or existing. A new type is given its name, its icon, and whether its entries take part in the Family
 * Tree - the only things a type needs before its first entry. An existing one edits its name and icon only: the Family
 * Tree choice is the first of a type's constraints, and those get a surface of their own rather than one more checkbox
 * here, so an edit sends the stored choice back untouched. Fields are managed on the type.
 * In the drawer every Lorex form uses, so focus goes in, Escape asks before an edit is lost, and focus returns to the
 * button that opened it.
 *
 * An edit changes the type in place, by id: every entry keeps it, and so do Lore's filter and its address. The route
 * replaces the whole type, so what this form does not edit - the description, the colour, the order, the Family Tree
 * choice - is sent back exactly as it is stored.
 *
 * Both choose where the type sits: at the top, or inside another type - structure, so it belongs with the name. Moving a
 * type moves everything inside it, and it goes last among its new siblings. The type itself and anything already inside
 * it are not offered, since a type cannot sit inside itself. Nothing is inherited from a parent, and a parent's Family
 * Tree choice says nothing about its children.
 */
function TypeDialog({
  universeId,
  tree,
  type,
  onClose,
  onSaved,
}: {
  universeId: string
  tree: TypeTree
  /** The type being edited, or null for a new one. */
  type: EntityType | null
  onClose: () => void
  onSaved: (name: string) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const initial = {
    name: type?.name ?? '',
    icon: type?.icon ?? null,
    familyTreeEligible: type?.familyTreeEligible ?? false,
    parentId: type?.parentId ?? null,
  }
  const [name, setName] = useState(initial.name)
  const [parentId, setParentId] = useState<string | null>(initial.parentId)
  const ownBranch =
    type && tree.byId.get(type.id) ? branchIds(tree.byId.get(type.id)!) : new Set<string>()
  const parents = tree.ordered.filter((node) => !ownBranch.has(node.type.id))
  const [icon, setIcon] = useState<string | null>(initial.icon)
  const [familyTreeEligible, setFamilyTreeEligible] = useState(initial.familyTreeEligible)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty =
    payloadKey({ name: name.trim(), icon, familyTreeEligible, parentId }) !==
    payloadKey({
      name: initial.name,
      icon: initial.icon,
      familyTreeEligible: initial.familyTreeEligible,
      parentId: initial.parentId,
    })
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    type
      ? `Your changes to “${type.name}” have not been saved. Leave without saving them?`
      : 'This type has not been created. Leave without saving it?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById('type-name')?.focus()
  }, [])

  async function save() {
    setMessage(null)
    setFieldErrors({})
    if (!name.trim()) {
      setFieldErrors({ name: 'Give the type a name.' })
      return
    }

    setIsSaving(true)
    try {
      if (type) {
        await updateEntityType(universeId, type.id, {
          name: name.trim(),
          description: type.description,
          icon,
          accentColor: type.accentColor,
          displayOrder: type.displayOrder,
          familyTreeEligible: type.familyTreeEligible,
          parent: { id: parentId },
        })
      } else {
        await createEntityType(universeId, {
          name: name.trim(),
          description: null,
          icon,
          accentColor: null,
          displayOrder: null,
          familyTreeEligible,
          parent: { id: parentId },
        })
      }
      await onSaved(name.trim())
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : `Some details need a change before this can be ${type ? 'saved' : 'created'}.`,
        )
      } else {
        setMessage(type ? 'That type could not be saved.' : 'That type could not be created.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="type-heading"
      {...dialogProps}
      data-testid={type ? 'edit-type-dialog' : 'new-type-dialog'}
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">Lore Types</p>
          <h2 className="drawer__title" id="type-heading">
            {type ? 'Edit type' : 'New type'}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="type-dialog-error">
              {message}
            </p>
          ) : null}

          <Field
            label="Name"
            name="type-name"
            placeholder={type ? undefined : 'Starship, Language, Ritual…'}
            dir="auto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            data-testid="type-name"
          />

          <div className="field">
            <TypeIconPicker value={icon} onChange={setIcon} testId="type-icon" />
            <p className="field__hint">
              Optional, and only a picture: it marks the type on the Lore filter. Nothing is chosen
              for you from the name.
            </p>
            {fieldErrors.icon ? <p className="field__error">{fieldErrors.icon}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="type-parent">
              Parent type
            </label>
            <select
              id="type-parent"
              className="field__input field__input--select"
              value={parentId ?? ''}
              onChange={(event) => setParentId(event.target.value || null)}
              aria-describedby="type-parent-hint"
              data-testid="type-parent"
            >
              <option value="">None – a top-level type</option>
              {parents.map((node) => (
                <option key={node.type.id} value={node.type.id}>
                  {typePathLabel(node)}
                </option>
              ))}
            </select>
            <p className="field__hint" id="type-parent-hint">
              Organises Lore: choosing a type there shows the entries of the types inside it too.
              Nothing is inherited - each type keeps its own fields.
            </p>
            {fieldErrors.parent ? <p className="field__error">{fieldErrors.parent}</p> : null}
          </div>

          {type ? null : (
            <label className="check">
              <input
                type="checkbox"
                checked={familyTreeEligible}
                onChange={(event) => setFamilyTreeEligible(event.target.checked)}
                data-testid="type-family"
              />
              <span>
                <span className="types__familylabel">Family Tree</span>
                Entries of this type can appear in Family Tree
              </span>
            </label>
          )}
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-type">
            {type ? (isSaving ? 'Saving…' : 'Save changes') : isSaving ? 'Creating…' : 'Create'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-type"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
