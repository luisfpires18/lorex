import { useEffect, useState } from 'react'
import { Field } from './Field'
import { ApiError } from '../lib/api'
import {
  createRelationshipType,
  deleteRelationshipType,
  listRelationshipTypes,
  updateRelationshipType,
} from '../relationships/api'
import type { RelationshipType } from '../relationships/types'

interface TypeDraft {
  name: string
  inverseName: string
  isSymmetric: boolean
  description: string
}

const BLANK: TypeDraft = { name: '', inverseName: '', isSymmetric: false, description: '' }

function draftFrom(type: RelationshipType): TypeDraft {
  return {
    name: type.name,
    inverseName: type.inverseName ?? '',
    isSymmetric: type.isSymmetric,
    description: type.description ?? '',
  }
}

/** How a type reads from each side, in the author's own words. */
function reading(type: RelationshipType) {
  return type.isSymmetric
    ? `${type.name}, both ways`
    : `${type.name} one way, ${type.inverseName ?? type.name} the other`
}

export function RelationshipTypeManager({ universeId }: { universeId: string }) {
  const [types, setTypes] = useState<RelationshipType[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState<TypeDraft>(BLANK)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listRelationshipTypes(universeId, controller.signal)
      .then(setTypes)
      .catch(() => {
        if (controller.signal.aborted) return
        setTypes([])
        setMessage('The relation kinds could not be loaded.')
      })
    return () => {
      controller.abort()
    }
  }, [universeId])

  function close() {
    setIsAdding(false)
    setEditingId(null)
    setDraft(BLANK)
    setFieldErrors({})
  }

  async function refresh() {
    setTypes(await listRelationshipTypes(universeId))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    const input = {
      name: draft.name.trim(),
      // A symmetric kind reads the same both ways, so no second wording is sent.
      inverseName: draft.isSymmetric ? null : draft.inverseName.trim() || null,
      isSymmetric: draft.isSymmetric,
      description: draft.description.trim() ? draft.description.trim() : null,
      displayOrder: null,
    }

    try {
      if (editingId) {
        await updateRelationshipType(universeId, editingId, input)
      } else {
        await createRelationshipType(universeId, input)
      }
      close()
      await refresh()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        if (Object.keys(error.fieldErrors).length === 0) setMessage(error.message)
      } else {
        setMessage('That relation kind could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function remove(type: RelationshipType) {
    setMessage(null)
    try {
      await deleteRelationshipType(universeId, type.id)
      if (editingId === type.id) close()
      await refresh()
    } catch (error: unknown) {
      // 409 carries the count of relations still using the kind, which is the useful part.
      setMessage(
        error instanceof ApiError ? error.message : 'That relation kind could not be deleted.',
      )
    }
  }

  const form = (
    <div className="reltype__form" data-testid="relationship-type-form">
      <Field
        label="Reads as"
        name="reltype-name"
        placeholder="rules, parent of, married to"
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        error={fieldErrors.name}
      />

      {draft.isSymmetric ? (
        <p className="settings__note">
          Both entries read “{draft.name.trim() || 'this'}”. Nothing is worded in reverse.
        </p>
      ) : (
        <Field
          label="Reads as, from the other side"
          name="reltype-inverse"
          placeholder="ruled by, child of"
          value={draft.inverseName}
          onChange={(event) => setDraft({ ...draft, inverseName: event.target.value })}
          error={fieldErrors.inversename}
        />
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={draft.isSymmetric}
          onChange={(event) => setDraft({ ...draft, isSymmetric: event.target.checked })}
          data-testid="reltype-symmetric"
        />
        <span>Reads the same from both sides</span>
      </label>

      <Field
        label="Description"
        name="reltype-description"
        placeholder="Optional"
        value={draft.description}
        onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        error={fieldErrors.description}
      />

      <div className="relform__actions">
        <button
          className="button"
          type="button"
          onClick={save}
          disabled={isSaving}
          data-testid="save-relationship-type"
        >
          {isSaving ? 'Saving' : editingId ? 'Save kind' : 'Add kind'}
        </button>
        <button className="button button--quiet" type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  )

  if (!types) {
    return (
      <p className="notice" role="status">
        Reading the relation kinds…
      </p>
    )
  }

  return (
    <section className="reltypes" aria-labelledby="reltypes-heading">
      <div className="relations__head">
        <h3 className="settings__heading" id="reltypes-heading">
          Relation kinds
        </h3>
        {!isAdding && !editingId ? (
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              setMessage(null)
              setFieldErrors({})
              setEditingId(null)
              setDraft(BLANK)
              setIsAdding(true)
            }}
            data-testid="add-relationship-type"
          >
            Add kind
          </button>
        ) : null}
      </div>

      <p className="settings__note">
        How entries connect. Each kind carries both readings, so one link says “rules” on one entry
        and “ruled by” on the other.
      </p>

      {message ? (
        <p className="form__message" role="alert" data-testid="reltype-error">
          {message}
        </p>
      ) : null}

      {isAdding ? form : null}

      {types.length === 0 && !isAdding ? (
        <p className="relations__quiet" data-testid="reltypes-empty">
          No kinds yet. Name the first one and entries can start connecting.
        </p>
      ) : (
        <ul className="types__list" data-testid="relationship-type-list">
          {types.map((type) =>
            editingId === type.id ? (
              <li className="types__row" key={type.id}>
                {form}
              </li>
            ) : (
              <li className="types__row" key={type.id} data-reltype-name={type.name}>
                <div className="types__head">
                  <span className="types__name">{type.name}</span>
                  <span className="types__count">
                    {type.relationshipCount === 1
                      ? '1 relation'
                      : `${type.relationshipCount} relations`}
                  </span>
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() => {
                      setMessage(null)
                      setFieldErrors({})
                      setIsAdding(false)
                      setEditingId(type.id)
                      setDraft(draftFrom(type))
                    }}
                    data-testid={`edit-reltype-${type.name}`}
                  >
                    Edit
                  </button>
                  {type.relationshipCount === 0 ? (
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={() => remove(type)}
                      data-testid={`delete-reltype-${type.name}`}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>

                <p className="types__description">{reading(type)}</p>
                {type.description ? <p className="types__description">{type.description}</p> : null}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}
