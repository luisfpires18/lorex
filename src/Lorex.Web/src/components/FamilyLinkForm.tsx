import { useState } from 'react'
import { EntityPicker, type EntityChoice } from './EntityPicker'
import { ApiError } from '../lib/api'
import { createRelationship } from '../relationships/api'
import { FAMILY_SEMANTIC_WORDS, type RelationshipType } from '../relationships/types'
import { CANON_LABELS, CANON_ORDER, CanonStatus, type CanonStatusValue } from '../lore/types'

interface Props {
  universeId: string
  focal: { id: string; name: string }
  /** Only kinds whose author gave them a family meaning: nothing else can make a family connection. */
  kinds: RelationshipType[]
  onSaved: () => void
  onCancel: () => void
}

/**
 * Adds a family connection without leaving the tree. It writes an ordinary relationship of a kind that
 * carries a family meaning - the same row, the same route and the same validation as the relation editor on
 * an entry's page. There is no second kind of family link anywhere.
 */
export function FamilyLinkForm({ universeId, focal, kinds, onSaved, onCancel }: Props) {
  const [kindId, setKindId] = useState(kinds[0]?.id ?? '')
  const [focalIsParent, setFocalIsParent] = useState(true)
  const [related, setRelated] = useState<EntityChoice | null>(null)
  const [canonStatus, setCanonStatus] = useState<CanonStatusValue>(CanonStatus.Idea)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const kind = kinds.find((candidate) => candidate.id === kindId) ?? kinds[0]
  const parentName = focalIsParent ? focal.name : (related?.name ?? '…')
  const childName = focalIsParent ? (related?.name ?? '…') : focal.name

  async function save() {
    if (!kind) return

    if (!related) {
      setFieldErrors({ targetentityid: 'Choose the entry this connects to.' })
      return
    }

    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    try {
      await createRelationship(universeId, {
        relationshipTypeId: kind.id,
        // The stored row runs source to target, and the kind's family meaning says the source is the parent.
        sourceEntityId: focalIsParent ? focal.id : related.id,
        targetEntityId: focalIsParent ? related.id : focal.id,
        canonStatus,
        startDate: null,
        endDate: null,
        notes: null,
      })
      onSaved()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage('That family connection could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="relform familylink" data-testid="family-link-form">
      <p className="relform__reads" data-testid="family-link-preview">
        <span className="relform__subject">{parentName}</span>{' '}
        <span className="relform__verb">{kind?.name ?? '…'}</span>{' '}
        <span className="relform__object">{childName}</span>
      </p>
      <p className="field__hint">
        The parent is on the left and the child on the right, which is what this kind
        {kind ? ` (${FAMILY_SEMANTIC_WORDS[kind.familySemantic]})` : ''} was configured to mean.
      </p>

      <div className="relform__grid">
        <div className="field">
          <label className="field__label" htmlFor="family-link-kind">
            Connection
          </label>
          <select
            id="family-link-kind"
            className="field__input field__input--select"
            value={kind?.id ?? ''}
            onChange={(event) => setKindId(event.target.value)}
            data-testid="family-link-kind"
          >
            {kinds.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} — {FAMILY_SEMANTIC_WORDS[candidate.familySemantic]}
              </option>
            ))}
          </select>
          {fieldErrors.relationshiptypeid ? (
            <p className="field__error">{fieldErrors.relationshiptypeid}</p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="family-link-side">
            Which side
          </label>
          <select
            id="family-link-side"
            className="field__input field__input--select"
            value={focalIsParent ? 'parent' : 'child'}
            onChange={(event) => setFocalIsParent(event.target.value === 'parent')}
            data-testid="family-link-side"
          >
            <option value="parent">{focal.name} is the parent</option>
            <option value="child">{focal.name} is the child</option>
          </select>
        </div>

        <EntityPicker
          label={focalIsParent ? 'The child' : 'The parent'}
          universeId={universeId}
          value={related}
          onChange={setRelated}
          excludeId={focal.id}
          error={fieldErrors.targetentityid ?? fieldErrors.sourceentityid}
        />

        <div className="field">
          <span className="field__label">Status</span>
          <div className="canon" role="group" aria-label="Connection status">
            {CANON_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                className="canon__step"
                aria-pressed={canonStatus === option}
                onClick={() => setCanonStatus(option)}
                data-testid={`family-link-canon-${CANON_LABELS[option].toLowerCase()}`}
              >
                {CANON_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {message ? (
        <p className="form__message" role="alert" data-testid="family-link-error">
          {message}
        </p>
      ) : null}

      <div className="relform__actions">
        <button
          className="button"
          type="button"
          onClick={save}
          disabled={isSaving || !kind}
          data-testid="save-family-link"
        >
          {isSaving ? 'Saving' : 'Add connection'}
        </button>
        <button className="button button--quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
