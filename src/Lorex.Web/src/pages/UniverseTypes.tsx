import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Field } from '../components/Field'
import { RelationshipTypeManager } from '../components/RelationshipTypeManager'
import { ApiError } from '../lib/api'
import {
  addField,
  createEntityType,
  deleteEntityType,
  deleteField,
  listEntityTypes,
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

export default function UniverseTypes() {
  const { universe } = useOutletContext<WorkspaceContext>()

  const [types, setTypes] = useState<EntityType[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [newType, setNewType] = useState('')
  const [openTypeId, setOpenTypeId] = useState<string | null>(null)

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
      .catch(() => setMessage('The types could not be loaded.'))
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

  async function submitType() {
    if (!newType.trim()) return
    setMessage(null)
    try {
      await createEntityType(universe.id, {
        name: newType.trim(),
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
      })
      setNewType('')
      await refresh()
    } catch (error: unknown) {
      report(error, 'That type could not be created.')
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

  if (!types) {
    return (
      <p className="notice" role="status">
        Reading the types…
      </p>
    )
  }

  return (
    <article className="types">
      <h2 className="settings__title">Types</h2>
      <p className="settings__note">
        Every entry is one of these. Add your own, and give it the fields this world actually needs.
      </p>

      {message ? (
        <p className="form__message" role="alert" data-testid="types-error">
          {message}
        </p>
      ) : null}

      <ul className="types__list" data-testid="type-list">
        {types.map((type) => (
          <li className="types__row" key={type.id} data-type-name={type.name}>
            <div className="types__head">
              <span className="types__name">{type.name}</span>
              <span className="types__count">
                {type.entityCount === 1 ? '1 entry' : `${type.entityCount} entries`}
              </span>
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setOpenTypeId(openTypeId === type.id ? null : type.id)}
                data-testid={`fields-${type.name}`}
              >
                {openTypeId === type.id ? 'Close' : 'Fields'}
              </button>
              {type.entityCount === 0 ? (
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() => removeType(type.id)}
                >
                  Delete
                </button>
              ) : null}
            </div>

            {type.description ? <p className="types__description">{type.description}</p> : null}

            {openTypeId === type.id ? (
              <div className="types__fields">
                {type.fields.length > 0 ? (
                  <ul className="types__fieldlist">
                    {type.fields.map((field) => (
                      <li key={field.id} data-field-name={field.name}>
                        <span className="types__fieldname">{field.name}</span>
                        <span className="types__fieldkind">{FIELD_KIND_LABELS[field.kind]}</span>
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
                          current !== null && semanticsFor(kind).includes(current) ? current : null,
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

      <div className="types__new">
        <Field
          label="New type"
          name="new-type"
          placeholder="Starship, Language, Ritual…"
          value={newType}
          onChange={(event) => setNewType(event.target.value)}
        />
        <button className="button" type="button" onClick={submitType} data-testid="add-type">
          Add type
        </button>
      </div>

      <RelationshipTypeManager universeId={universe.id} />
    </article>
  )
}
