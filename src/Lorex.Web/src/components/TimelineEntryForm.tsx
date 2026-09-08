import { useEffect, useRef, useState } from 'react'
import { EntityMultiPicker, type EntityChoice } from './EntityPicker'
import { ApiError } from '../lib/api'
import { CANON_LABELS, CANON_ORDER, CanonStatus, type CanonStatusValue } from '../lore/types'
import { createTimelineEntry, updateTimelineEntry } from '../timeline/api'
import {
  DATE_KIND_HINTS,
  DATE_KIND_LABELS,
  DATE_KIND_ORDER,
  DateKind,
  type DateKindValue,
  type TimelineEntry,
} from '../timeline/types'

/**
 * The draft holds every component as a string. An empty number input is genuinely empty
 * rather than zero, and a year of 0 stays distinct from no year at all.
 */
interface MomentDraft {
  title: string
  description: string
  canonStatus: CanonStatusValue
  dateKind: DateKindValue
  startYear: string
  startMonth: string
  startDay: string
  endYear: string
  endMonth: string
  endDay: string
  eraLabel: string
  entities: EntityChoice[]
}

/** The six chronology boxes, named so one handler can serve all of them. */
type ComponentKey = 'startYear' | 'startMonth' | 'startDay' | 'endYear' | 'endMonth' | 'endDay'

const EMPTY: MomentDraft = {
  title: '',
  description: '',
  canonStatus: CanonStatus.Idea,
  dateKind: DateKind.Exact,
  startYear: '',
  startMonth: '',
  startDay: '',
  endYear: '',
  endMonth: '',
  endDay: '',
  eraLabel: '',
  entities: [],
}

function numberText(value: number | null) {
  return value === null ? '' : String(value)
}

function draftFrom(entry: TimelineEntry): MomentDraft {
  return {
    title: entry.title,
    description: entry.description ?? '',
    canonStatus: entry.canonStatus,
    dateKind: entry.date.kind,
    startYear: numberText(entry.date.startYear),
    startMonth: numberText(entry.date.startMonth),
    startDay: numberText(entry.date.startDay),
    endYear: numberText(entry.date.endYear),
    endMonth: numberText(entry.date.endMonth),
    endDay: numberText(entry.date.endDay),
    eraLabel: entry.date.eraLabel ?? '',
    entities: entry.entities.map((link) => ({ id: link.entityId, name: link.name })),
  }
}

/** An empty box is no claim at all; anything unreadable is left for the API to refuse. */
function toNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

interface TimelineEntryFormProps {
  universeId: string
  /** The moment being changed, or null when one is being written for the first time. */
  entry: TimelineEntry | null
  onClose: () => void
  onSaved: () => void
}

/**
 * A drawer over the chronology rather than a page of its own: the moments stay visible
 * behind it, so an author can see where the one they are writing will land.
 *
 * Only the components the chosen kind allows are shown, and switching kind clears the
 * ones it forbids, so the form can never send a shape the API is bound to refuse.
 */
export function TimelineEntryForm({ universeId, entry, onClose, onSaved }: TimelineEntryFormProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<MomentDraft>(() => (entry ? draftFrom(entry) : EMPTY))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // showModal, not the open attribute: it brings the focus trap, the backdrop and
    // Escape with it rather than leaving them to be rebuilt here.
    dialog.current?.showModal()
  }, [])

  function edit(change: Partial<MomentDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function setComponent(key: ComponentKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  /** A kind only carries its own components, so the others are dropped as it changes. */
  function chooseKind(dateKind: DateKindValue) {
    if (dateKind === DateKind.Unknown) {
      edit({
        dateKind,
        startYear: '',
        startMonth: '',
        startDay: '',
        endYear: '',
        endMonth: '',
        endDay: '',
      })
    } else if (dateKind === DateKind.Range) {
      edit({ dateKind })
    } else {
      edit({ dateKind, endYear: '', endMonth: '', endDay: '' })
    }
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    const input = {
      title: draft.title.trim(),
      description: trimmed(draft.description),
      canonStatus: draft.canonStatus,
      dateKind: draft.dateKind,
      startYear: toNumber(draft.startYear),
      startMonth: toNumber(draft.startMonth),
      startDay: toNumber(draft.startDay),
      endYear: toNumber(draft.endYear),
      endMonth: toNumber(draft.endMonth),
      endDay: toNumber(draft.endDay),
      eraLabel: trimmed(draft.eraLabel),
      entityIds: draft.entities.map((choice) => choice.id),
    }

    try {
      if (entry) {
        await updateTimelineEntry(universeId, entry.id, input)
      } else {
        await createTimelineEntry(universeId, input)
      }
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
        setMessage('That moment could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const isRange = draft.dateKind === DateKind.Range
  const isDated = draft.dateKind !== DateKind.Unknown

  function point(
    prefix: 'start' | 'end',
    yearLabel: string,
    yearError: string | undefined,
    monthError: string | undefined,
    dayError: string | undefined,
  ) {
    const year: ComponentKey = prefix === 'start' ? 'startYear' : 'endYear'
    const month: ComponentKey = prefix === 'start' ? 'startMonth' : 'endMonth'
    const day: ComponentKey = prefix === 'start' ? 'startDay' : 'endDay'

    return (
      <div className="momentform__point">
        <div className="field">
          <label className="field__label" htmlFor={`moment-${year}`}>
            {yearLabel}
          </label>
          <input
            id={`moment-${year}`}
            className="field__input"
            type="number"
            step="1"
            inputMode="numeric"
            placeholder="3018"
            value={draft[year]}
            onChange={(event) => setComponent(year, event.target.value)}
            aria-invalid={yearError ? true : undefined}
            data-testid={`moment-${year}`}
          />
          {yearError ? <p className="field__error">{yearError}</p> : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`moment-${month}`}>
            Month
          </label>
          <input
            id={`moment-${month}`}
            className="field__input"
            type="number"
            step="1"
            min={1}
            max={12}
            inputMode="numeric"
            placeholder="—"
            value={draft[month]}
            onChange={(event) => setComponent(month, event.target.value)}
            aria-invalid={monthError ? true : undefined}
            data-testid={`moment-${month}`}
          />
          {monthError ? <p className="field__error">{monthError}</p> : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`moment-${day}`}>
            Day
          </label>
          <input
            id={`moment-${day}`}
            className="field__input"
            type="number"
            step="1"
            min={1}
            max={31}
            inputMode="numeric"
            placeholder="—"
            value={draft[day]}
            onChange={(event) => setComponent(day, event.target.value)}
            aria-invalid={dayError ? true : undefined}
            data-testid={`moment-${day}`}
          />
          {dayError ? <p className="field__error">{dayError}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="moment-heading"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // Only a click on the backdrop itself lands on the dialog element.
        if (event.target === dialog.current) onClose()
      }}
      data-testid="moment-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">{entry ? 'Editing a moment' : 'A new moment'}</p>
          <h2 className="drawer__title" id="moment-heading">
            {entry ? entry.title || 'Untitled moment' : 'Add timeline entry'}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="moment-error">
              {message}
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="moment-title">
              Title
            </label>
            <input
              id="moment-title"
              className="field__input"
              type="text"
              placeholder="Frodo leaves the Shire"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="moment-title"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="moment-description">
              What happened
            </label>
            <textarea
              id="moment-description"
              className="field__input field__input--area"
              rows={3}
              placeholder="A sentence or two, for the reader who has forgotten."
              value={draft.description}
              onChange={(event) => edit({ description: event.target.value })}
              data-testid="moment-description"
            />
            {fieldErrors.description ? (
              <p className="field__error">{fieldErrors.description}</p>
            ) : null}
          </div>

          <div className="field">
            <span className="field__label">Status</span>
            <div className="canon" role="group" aria-label="Moment status">
              {CANON_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="canon__step"
                  aria-pressed={draft.canonStatus === option}
                  onClick={() => edit({ canonStatus: option })}
                  data-testid={`moment-canon-${CANON_LABELS[option].toLowerCase()}`}
                >
                  {CANON_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">When</span>
            <div className="kinds" role="group" aria-label="How the date is known">
              {DATE_KIND_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="kinds__step"
                  aria-pressed={draft.dateKind === option}
                  onClick={() => chooseKind(option)}
                  data-testid={`moment-kind-${DATE_KIND_LABELS[option].toLowerCase()}`}
                >
                  {DATE_KIND_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="field__hint">{DATE_KIND_HINTS[draft.dateKind]}</p>
            {fieldErrors.datekind ? <p className="field__error">{fieldErrors.datekind}</p> : null}
          </div>

          {isDated ? (
            <>
              {point(
                'start',
                isRange ? 'Starts in year' : 'Year',
                fieldErrors.startyear,
                fieldErrors.startmonth,
                fieldErrors.startday,
              )}

              {isRange
                ? point(
                    'end',
                    'Ends in year',
                    fieldErrors.endyear,
                    fieldErrors.endmonth,
                    fieldErrors.endday,
                  )
                : null}
            </>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="moment-era">
              Era
            </label>
            <p className="field__hint">
              A name for the reckoning: Third Age, AC, Before the Flood. Lorex shows it, but does
              not order by it yet.
            </p>
            <input
              id="moment-era"
              className="field__input"
              type="text"
              placeholder="Optional"
              value={draft.eraLabel}
              onChange={(event) => edit({ eraLabel: event.target.value })}
              aria-invalid={fieldErrors.eralabel ? true : undefined}
              data-testid="moment-era"
            />
            {fieldErrors.eralabel ? <p className="field__error">{fieldErrors.eralabel}</p> : null}
          </div>

          <EntityMultiPicker
            label="Who and what took part"
            hint="Anything in this universe: a character, a place, an object."
            universeId={universeId}
            value={draft.entities}
            onChange={(entities) => edit({ entities })}
            error={fieldErrors.entityids}
          />
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-moment">
            {isSaving ? 'Saving' : entry ? 'Save moment' : 'Add moment'}
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={onClose}
            data-testid="cancel-moment"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
