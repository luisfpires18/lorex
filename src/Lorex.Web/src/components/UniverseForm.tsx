import { useId, useState, type FormEvent } from 'react'
import { Field } from './Field'
import { ApiError } from '../lib/api'
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setFieldErrors({})
    setIsSubmitting(true)

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        accentColor: accentColor || null,
      })
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
        autoFocus
        required
        maxLength={120}
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
          <button className="button button--quiet" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
