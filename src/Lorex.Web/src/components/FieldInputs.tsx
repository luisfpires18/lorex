import {
  FieldKind,
  type EntitySummary,
  type FieldDefinition,
  type FieldValueInput,
} from '../lore/types'

interface FieldInputProps {
  definition: FieldDefinition
  value: FieldValueInput
  candidates: EntitySummary[]
  onChange: (next: FieldValueInput) => void
}

/** Renders the one control the field's kind calls for. */
export function FieldInput({ definition, value, candidates, onChange }: FieldInputProps) {
  const id = `field-${definition.id}`
  const label = definition.isRequired ? `${definition.name} (required)` : definition.name

  function patch(part: Partial<FieldValueInput>) {
    onChange({ ...value, ...part })
  }

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
        <input
          id={id}
          type="number"
          className="field__input"
          value={value.number ?? ''}
          onChange={(event) =>
            patch({ number: event.target.value === '' ? null : Number(event.target.value) })
          }
        />
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
