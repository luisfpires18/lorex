import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
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
  lore: 'Every entry is one of these. Add your own, and give it the fields this world actually needs.',
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
  const [isCreatingType, setIsCreatingType] = useState(false)
  const [openTypeId, setOpenTypeId] = useState<string | null>(null)
  const [iconTypeId, setIconTypeId] = useState<string | null>(null)
  const [busyTypeId, setBusyTypeId] = useState<string | null>(null)

  const [fieldName, setFieldName] = useState('')
  const [fieldKind, setFieldKind] = useState<FieldKindValue>(FieldKind.ShortText)
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldOptions, setFieldOptions] = useState('')
  const [fieldSemantic, setFieldSemantic] = useState<FieldSemanticValue | null>(null)
  const [busyFieldId, setBusyFieldId] = useState<string | null>(null)

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

  /**
   * Changes one type's icon, and nothing else: the rest of the type is sent back as it stands,
   * because the route replaces the whole type. Saved on choosing, like a field's meaning.
   */
  async function changeIcon(type: EntityType, icon: string | null) {
    setMessage(null)
    setBusyTypeId(type.id)
    try {
      await updateEntityType(universe.id, type.id, {
        name: type.name,
        description: type.description,
        icon,
        accentColor: type.accentColor,
        displayOrder: type.displayOrder,
      })
      await refresh()
    } catch (error: unknown) {
      report(error, 'That icon could not be changed.')
    } finally {
      setBusyTypeId(null)
    }
  }

  /**
   * Whether this type's entries take part in the Family Tree. Saved on choosing, like the icon, with the rest of the type
   * sent back as it stands. A meaning of the type, never of its name (ADR 0040).
   */
  async function changeFamilyTree(type: EntityType, familyTreeEligible: boolean) {
    setMessage(null)
    setBusyTypeId(type.id)
    // Shown at once; a refusal puts back what is stored.
    setTypes(
      (current) =>
        current?.map((each) => (each.id === type.id ? { ...each, familyTreeEligible } : each)) ??
        null,
    )
    try {
      await updateEntityType(universe.id, type.id, {
        name: type.name,
        description: type.description,
        icon: type.icon,
        accentColor: type.accentColor,
        displayOrder: type.displayOrder,
        familyTreeEligible,
      })
      await refresh()
    } catch (error: unknown) {
      report(error, 'That could not be changed.')
      await refresh().catch(() => undefined)
    } finally {
      setBusyTypeId(null)
    }
  }

  async function removeType(typeId: string) {
    setMessage(null)
    try {
      await deleteEntityType(universe.id, typeId)
      await refresh()
    } catch (error: unknown) {
      report(error, 'That type could not be deleted.')
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
              onClick={() => setIsCreatingType(true)}
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

      {isCreatingType ? (
        <NewTypeDialog
          universeId={universe.id}
          onClose={() => setIsCreatingType(false)}
          onCreated={async () => {
            setIsCreatingType(false)
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

        {!types ? (
          <p className="notice" role="status">
            Reading the types…
          </p>
        ) : (
          <ul className="types__list" data-testid="type-list">
            {types.map((type) => (
              <li className="types__row" key={type.id} data-type-name={type.name}>
                <div className="types__head">
                  <span className="types__icon" data-testid={`type-icon-${type.name}`}>
                    <TypeIcon iconKey={type.icon} />
                  </span>
                  <span className="types__name">
                    <bdi>{type.name}</bdi>
                  </span>
                  <span className="types__count">
                    {type.entityCount === 1 ? '1 entry' : `${type.entityCount} entries`}
                  </span>
                  <button
                    className="button button--secondary button--sm"
                    type="button"
                    aria-expanded={iconTypeId === type.id}
                    onClick={() => setIconTypeId(iconTypeId === type.id ? null : type.id)}
                    data-testid={`icon-${type.name}`}
                  >
                    Icon
                  </button>
                  <button
                    className="button button--secondary button--sm"
                    type="button"
                    onClick={() => setOpenTypeId(openTypeId === type.id ? null : type.id)}
                    data-testid={`fields-${type.name}`}
                  >
                    {openTypeId === type.id ? 'Close' : 'Fields'}
                  </button>
                  {type.entityCount === 0 ? (
                    <button
                      className="button button--secondary button--sm"
                      type="button"
                      onClick={() => removeType(type.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>

                {type.description ? (
                  <p className="types__description prose">{type.description}</p>
                ) : null}

                <label className="check types__family">
                  <input
                    type="checkbox"
                    checked={type.familyTreeEligible}
                    disabled={busyTypeId === type.id}
                    onChange={(event) => void changeFamilyTree(type, event.target.checked)}
                    data-testid={`family-eligible-${type.name}`}
                  />
                  <span>
                    <span className="types__familylabel">Family Tree</span>
                    Entries of this type can appear in Family Tree
                  </span>
                </label>

                {iconTypeId === type.id ? (
                  <div className="types__iconpanel">
                    <TypeIconPicker
                      value={type.icon}
                      disabled={busyTypeId === type.id}
                      onChange={(icon) => void changeIcon(type, icon)}
                      testId={`icon-picker-${type.name}`}
                    />
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
                            Read by the deterministic Canon Integrity rules, never by a reader, and
                            never guessed from the field&rsquo;s name. Most fields need none.
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
            ))}
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
 * A new Lore Type: its name, its icon, and whether its entries take part in the Family Tree - the only things a type needs
 * before its first entry. Fields are added on the type afterwards. In the drawer every Lorex form uses, so focus goes in,
 * Escape asks before a typed name is lost, and focus returns to "New type".
 */
function NewTypeDialog({
  universeId,
  onClose,
  onCreated,
}: {
  universeId: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [familyTreeEligible, setFamilyTreeEligible] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty =
    payloadKey({ name: name.trim(), icon, familyTreeEligible }) !==
    payloadKey({ name: '', icon: null, familyTreeEligible: false })
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    'This type has not been created. Leave without saving it?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById('new-type-name')?.focus()
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
      await createEntityType(universeId, {
        name: name.trim(),
        description: null,
        icon,
        accentColor: null,
        displayOrder: null,
        familyTreeEligible,
      })
      await onCreated()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be created.',
        )
      } else {
        setMessage('That type could not be created.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="new-type-heading"
      {...dialogProps}
      data-testid="new-type-dialog"
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
          <h2 className="drawer__title" id="new-type-heading">
            New type
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="new-type-error">
              {message}
            </p>
          ) : null}

          <Field
            label="Name"
            name="new-type-name"
            placeholder="Starship, Language, Ritual…"
            dir="auto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            data-testid="new-type-name"
          />

          <div className="field">
            <TypeIconPicker value={icon} onChange={setIcon} testId="new-type-icon" />
            <p className="field__hint">
              Optional, and only a picture: it marks the type on the Lore filter. Nothing is chosen
              for you from the name.
            </p>
            {fieldErrors.icon ? <p className="field__error">{fieldErrors.icon}</p> : null}
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={familyTreeEligible}
              onChange={(event) => setFamilyTreeEligible(event.target.checked)}
              data-testid="new-type-family"
            />
            <span>
              <span className="types__familylabel">Family Tree</span>
              Entries of this type can appear in Family Tree
            </span>
          </label>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="create-type">
            {isSaving ? 'Creating' : 'Create'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-new-type"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
