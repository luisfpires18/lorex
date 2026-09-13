import { namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'

export type ChronologyPointPart = 'eraId' | 'year' | 'month' | 'day'

/**
 * A point as it is being typed. Every part stays a string, so an empty box is genuinely empty
 * rather than zero, and a year of 0 stays distinct from no year at all. An empty era is no era
 * chosen yet.
 */
export type ChronologyPointDraft = Record<ChronologyPointPart, string>

interface ChronologyPointFieldsProps {
  chronology: Chronology
  /** Each input's id, also its test id. */
  ids: Record<ChronologyPointPart, string>
  eraLabel?: string
  yearLabel?: string
  value: ChronologyPointDraft
  onChange: (part: ChronologyPointPart, value: string) => void
  errors: Partial<Record<ChronologyPointPart, string | undefined>>
}

/**
 * One point on a universe's line as a row of inputs: the era first when the universe names its
 * eras, then the year, month and day.
 *
 * The one era picker in Lorex. A timeline moment's start and end and a scene's position all come
 * through here, so the eras are offered, labelled and ruled the same way everywhere - a year inside
 * an era counts from 1, a plain year is signed. On a universe that names no eras there is no era to
 * choose and the row is the year, month and day it always was.
 */
export function ChronologyPointFields({
  chronology,
  ids,
  eraLabel = 'Era',
  yearLabel = 'Year',
  value,
  onChange,
  errors,
}: ChronologyPointFieldsProps) {
  const reckonsInEras = namesEras(chronology)

  return (
    <div
      className={reckonsInEras ? 'momentform__point momentform__point--era' : 'momentform__point'}
    >
      {reckonsInEras ? (
        <div className="field">
          <label className="field__label" htmlFor={ids.eraId}>
            {eraLabel}
          </label>
          <select
            id={ids.eraId}
            className="field__input field__input--select"
            value={value.eraId}
            onChange={(event) => onChange('eraId', event.target.value)}
            aria-invalid={errors.eraId ? true : undefined}
            data-testid={ids.eraId}
          >
            <option value="">Choose an era</option>
            {chronology.eras.map((option) => (
              <option key={option.id} value={option.id}>
                {option.abbreviation ? `${option.name} (${option.abbreviation})` : option.name}
              </option>
            ))}
          </select>
          {errors.eraId ? <p className="field__error">{errors.eraId}</p> : null}
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor={ids.year}>
          {yearLabel}
        </label>
        <input
          id={ids.year}
          className="field__input"
          type="number"
          step="1"
          min={reckonsInEras ? 1 : undefined}
          inputMode="numeric"
          placeholder={reckonsInEras ? '10' : '3018'}
          value={value.year}
          onChange={(event) => onChange('year', event.target.value)}
          aria-invalid={errors.year ? true : undefined}
          data-testid={ids.year}
        />
        {errors.year ? <p className="field__error">{errors.year}</p> : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={ids.month}>
          Month
        </label>
        <input
          id={ids.month}
          className="field__input"
          type="number"
          step="1"
          min={1}
          max={12}
          inputMode="numeric"
          placeholder="—"
          value={value.month}
          onChange={(event) => onChange('month', event.target.value)}
          aria-invalid={errors.month ? true : undefined}
          data-testid={ids.month}
        />
        {errors.month ? <p className="field__error">{errors.month}</p> : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={ids.day}>
          Day
        </label>
        <input
          id={ids.day}
          className="field__input"
          type="number"
          step="1"
          min={1}
          max={31}
          inputMode="numeric"
          placeholder="—"
          value={value.day}
          onChange={(event) => onChange('day', event.target.value)}
          aria-invalid={errors.day ? true : undefined}
          data-testid={ids.day}
        />
        {errors.day ? <p className="field__error">{errors.day}</p> : null}
      </div>
    </div>
  )
}
