import { useId } from 'react'
import { TYPE_ICONS } from '../lore/typeIcons'
import { TypeIcon } from './TypeIcon'

/**
 * Chooses an entity type's icon from the built-in set, or none.
 *
 * Radio buttons underneath, styled as a grid of small round swatches: one choice from a list is
 * what a radio group is, so the keyboard, the checked state and what a screen reader says all come
 * from the platform. Each swatch is named for the picture it shows, never for a kind of lore.
 *
 * "None" is a real choice and the default. It draws the same neutral shape a type with no icon gets
 * everywhere else, so the author sees exactly what they are choosing.
 */
export function TypeIconPicker({
  value,
  onChange,
  disabled = false,
  testId,
}: {
  value: string | null
  onChange: (key: string | null) => void
  disabled?: boolean
  testId?: string
}) {
  const name = useId()

  return (
    <fieldset className="iconpicker" disabled={disabled} data-testid={testId}>
      <legend className="field__label">Icon</legend>

      <div className="iconpicker__grid">
        <label className="iconpicker__choice" title="No icon">
          <input
            className="iconpicker__input"
            type="radio"
            name={name}
            value=""
            checked={value === null}
            onChange={() => onChange(null)}
          />
          <span className="iconpicker__swatch" aria-hidden="true">
            <TypeIcon iconKey={null} />
          </span>
          <span className="iconpicker__name">No icon</span>
        </label>

        {TYPE_ICONS.map((option) => (
          <label className="iconpicker__choice" key={option.key} title={option.label}>
            <input
              className="iconpicker__input"
              type="radio"
              name={name}
              value={option.key}
              checked={value === option.key}
              onChange={() => onChange(option.key)}
              data-icon-key={option.key}
            />
            <span className="iconpicker__swatch" aria-hidden="true">
              <TypeIcon iconKey={option.key} />
            </span>
            <span className="iconpicker__name">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
