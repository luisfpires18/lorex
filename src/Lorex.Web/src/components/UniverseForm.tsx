import { useId, useState, type FormEvent } from 'react'
import { Field } from './Field'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useLeaveGuard } from '../lib/leaveGuard'
import type { UniverseInput } from '../universes/types'

/** A short, deliberately unfussy palette. Worlds get an identity, not a colour picker. */
const ACCENTS = [
  { value: '#4f6bd6', label: 'Lapis' },
  { value: '#1f8f74', label: 'Verdigris' },
  { value: '#a8562c', label: 'Rust' },
  { value: '#7a4bbd', label: 'Amethyst' },
  { value: '#b3922f', label: 'Brass' },
  { value: '#3c4a57', label: 'Slate' },
]

/** The universe as a save sends it. */
function inputOf(name: string, description: string, accentColor: string): UniverseInput {
  return {
    name: name.trim(),
    description: description.trim() || null,
    accentColor: accentColor || null,
  }
}

interface UniverseFormProps {
  initial?: UniverseInput
  submitLabel: string
  busyLabel: string
  onSubmit: (input: UniverseInput) => Promise<unknown>
  onCancel?: () => void
  onDone?: () => void
}

export function UniverseForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
  onDone,
}: UniverseFormProps) {
  const groupId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [accentColor, setAccentColor] = useState(initial?.accentColor ?? '')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [isSaved, setIsSaved] = useState(false)

  // Unsaved is the universe as it would be sent against the one the form opened on, so a change put back is none. Not
  // once it is sent: a new universe opens as it is created, and the page it leaves can stay on screen until the next
  // one has loaded. A save that fails asks again.
  const [opened] = useState(() => payloadKey(inputOf(name, description, accentColor)))
  const isDirty =
    !isSubmitting && !isSaved && payloadKey(inputOf(name, description, accentColor)) !== opened
  useLeaveGuard(
    isDirty
      ? initial
        ? `“${initial.name}” has unsaved changes. Leave without saving them?`
        : 'This universe has not been created. Leave without saving it?'
      : null,
  )

  function cancel() {
    if (isDirty && !window.confirm('Close without saving your changes? They will be lost.')) return
    onCancel?.()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setFieldErrors({})
    setIsSubmitting(true)

    try {
      await onSubmit(inputOf(name, description, accentColor))
      setIsSaved(true)
      onDone?.()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        if (Object.keys(error.fieldErrors).length === 0) {
          setMessage(error.message)
        }
      } else {
        setMessage('That could not be saved. Try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {message ? (
        <p className="form__message" role="alert" data-testid="universe-error">
          {message}
        </p>
      ) : null}

      <Field
        label="Name"
        name="name"
        // Opening a new universe starts at its name; Settings opens on the page, not in a field.
        autoFocus={!initial}
        required
        maxLength={120}
        dir="auto"
        value={name}
        error={fieldErrors.name}
        onChange={(event) => setName(event.target.value)}
      />

      <div className="field">
        <label className="field__label" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          className="field__input field__input--area"
          rows={3}
          maxLength={2000}
          value={description}
          aria-invalid={fieldErrors.description ? true : undefined}
          onChange={(event) => setDescription(event.target.value)}
        />
        {fieldErrors.description ? <p className="field__error">{fieldErrors.description}</p> : null}
      </div>

      <fieldset className="swatches">
        <legend className="field__label">Colour</legend>
        <div className="swatches__row">
          <label className="swatch swatch--none">
            <input
              type="radio"
              name={groupId}
              value=""
              checked={accentColor === ''}
              onChange={() => setAccentColor('')}
            />
            <span className="swatch__dot" aria-hidden="true" />
            <span className="swatch__label">None</span>
          </label>
          {ACCENTS.map((accent) => (
            <label className="swatch" key={accent.value}>
              <input
                type="radio"
                name={groupId}
                value={accent.value}
                checked={accentColor === accent.value}
                onChange={() => setAccentColor(accent.value)}
              />
              <span
                className="swatch__dot"
                style={{ background: accent.value }}
                aria-hidden="true"
              />
              <span className="swatch__label">{accent.label}</span>
            </label>
          ))}
        </div>
        {fieldErrors.accentcolor ? <p className="field__error">{fieldErrors.accentcolor}</p> : null}
      </fieldset>

      <div className="form__actions">
        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? busyLabel : submitLabel}
        </button>
        {onCancel ? (
          <button className="button button--secondary" type="button" onClick={cancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
