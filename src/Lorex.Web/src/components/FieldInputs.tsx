import { namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import {
  FieldKind,
  isYearMeaning,
  type EntitySummary,
  type FieldDefinition,
  type FieldValueInput,
} from '../lore/types'

interface FieldInputProps {
  definition: FieldDefinition
  value: FieldValueInput
  candidates: EntitySummary[]

  /**
   * The reference this field already holds, when it is not among `candidates` - because the
   * entry it names is in the Trash, or simply beyond the first page the picker loaded.
   *
   * It is offered as a disabled option carrying the stored id, so the select shows what is
   * really there and a save round-trips it. Without this the control would read "Not set" and
   * saving an unrelated field would quietly destroy the reference.
   */
  retainedReference?: { id: string; label: string } | null

  /** How the universe keeps time, for a number that is a year in one of its eras. */
  chronology: Chronology
  onChange: (next: FieldValueInput) => void
}

/** Renders the one control the field's kind calls for. */
export function FieldInput({
  definition,
  value,
  candidates,
  retainedReference,
  chronology,
  onChange,
}: FieldInputProps) {
  const id = `field-${definition.id}`
  const label = definition.isRequired ? `${definition.name} (required)` : definition.name

  // A birth or death year on a universe that names eras is written in one of them, and so is any
  // number that already carries an era - showing it keeps a save from quietly dropping it.
  const yearMeaning = isYearMeaning(definition.semantic)
  const showsEra = namesEras(chronology) && (yearMeaning || value.eraId !== null)

  function patch(part: Partial<FieldValueInput>) {
    onChange({ ...value, ...part })
  }

  const numberInput = (
    <input
      id={id}
      type="number"
      className="field__input"
      min={showsEra && value.eraId ? 1 : undefined}
      step={showsEra && value.eraId ? 1 : undefined}
      value={value.number ?? ''}
      onChange={(event) =>
        patch({ number: event.target.value === '' ? null : Number(event.target.value) })
      }
    />
  )

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      {definition.kind === FieldKind.ShortText ? (
        <input
          id={id}
          className="field__input"
          value={value.text ?? ''}
          onChange={(event) => patch({ text: event.target.value })}
        />
      ) : null}

      {definition.kind === FieldKind.LongText ? (
        <textarea
          id={id}
          className="field__input field__input--area"
          rows={3}
          value={value.text ?? ''}
          onChange={(event) => patch({ text: event.target.value })}
        />
      ) : null}

      {definition.kind === FieldKind.Number ? (
        showsEra ? (
          <div className="fieldera">
            <select
              className="field__input field__input--select"
              aria-label={`${definition.name}: era`}
              value={value.eraId ?? ''}
              onChange={(event) => patch({ eraId: event.target.value || null })}
              data-testid={`field-era-${definition.id}`}
            >
              <option value="">{yearMeaning ? 'Choose an era' : 'No era'}</option>
              {chronology.eras.map((era) => (
                <option key={era.id} value={era.id}>
                  {era.abbreviation ? `${era.name} (${era.abbreviation})` : era.name}
                </option>
              ))}
            </select>
            {numberInput}
          </div>
        ) : (
          numberInput
        )
      ) : null}

      {definition.kind === FieldKind.Boolean ? (
        <label className="check">
          <input
            id={id}
            type="checkbox"
            checked={value.boolean ?? false}
            onChange={(event) => patch({ boolean: event.target.checked })}
          />
          <span>Yes</span>
        </label>
      ) : null}

      {definition.kind === FieldKind.Date ? (
        <input
          id={id}
          type="date"
          className="field__input"
          value={value.date ? value.date.slice(0, 10) : ''}
          onChange={(event) =>
            patch({ date: event.target.value ? `${event.target.value}T00:00:00Z` : null })
          }
        />
      ) : null}

      {definition.kind === FieldKind.Select ? (
        <select
          id={id}
          className="field__input field__input--select"
          value={value.optionIds?.[0] ?? ''}
          onChange={(event) => patch({ optionIds: event.target.value ? [event.target.value] : [] })}
        >
          <option value="">Not set</option>
          {definition.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.value}
            </option>
          ))}
        </select>
      ) : null}

      {definition.kind === FieldKind.MultiSelect ? (
        <div className="choices" id={id}>
          {definition.options.map((option) => {
            const chosen = value.optionIds?.includes(option.id) ?? false
            return (
              <label className="check" key={option.id}>
                <input
                  type="checkbox"
                  checked={chosen}
                  onChange={(event) => {
                    const current = value.optionIds ?? []
                    patch({
                      optionIds: event.target.checked
                        ? [...current, option.id]
                        : current.filter((candidate) => candidate !== option.id),
                    })
                  }}
                />
                <span>{option.value}</span>
              </label>
            )
          })}
        </div>
      ) : null}

      {definition.kind === FieldKind.EntityReference ? (
        <select
          id={id}
          className="field__input field__input--select"
          value={value.referencedEntityId ?? ''}
          onChange={(event) => patch({ referencedEntityId: event.target.value || null })}
        >
          <option value="">Not set</option>
          {retainedReference ? (
            <option value={retainedReference.id} disabled>
              {retainedReference.label}
            </option>
          ) : null}
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
