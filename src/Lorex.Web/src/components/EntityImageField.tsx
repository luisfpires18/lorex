import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  entityImageUrl,
  removeEntityImage,
  setEntityImage,
} from '../lore/images'
import type { EntityImageRef } from '../lore/types'

/**
 * The editor's image control: pick one, replace it, take it away.
 *
 * It behaves differently either side of the entry existing, because the object keys are built
 * from the entry's id and there is no id until the entry is saved.
 *
 * - An entry that exists uploads on the spot. The write is its own request, so the picture is
 *   stored whether or not the author goes on to save the rest of the form.
 * - A new entry only *holds* the file, and shows it from a local object URL. `EntityPage`
 *   uploads it once the create call has come back with an id. Nothing is written to the bucket
 *   before there is an entry for it to belong to, so an abandoned form leaves nothing behind.
 */
export function EntityImageField({
  universeId,
  entityId,
  image,
  pending,
  onPending,
  onChanged,
  disabled,
}: {
  universeId: string
  entityId: string | null
  image: EntityImageRef | null
  pending: File | null
  onPending: (file: File | null) => void
  onChanged: (image: EntityImageRef | null) => void
  disabled: boolean
}) {
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A held file is shown from the browser's own copy of it, so nothing is uploaded to preview
  // it. The URL is derived from the file rather than stored in state - it is a value, not an
  // event - and it holds memory until it is revoked, which is what the effect below is for.
  const preview = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending])

  useEffect(() => {
    if (!preview) return

    return () => {
      URL.revokeObjectURL(preview)
    }
  }, [preview])

  const shown =
    preview ?? (image ? entityImageUrl(universeId, entityId!, image, 'thumbnail') : null)
  const busyOrDisabled = busy || disabled

  async function choose(file: File | undefined) {
    // The picker is reset either way, so choosing the same file twice after a failure still
    // fires a change event.
    if (input.current) input.current.value = ''
    if (!file) return

    setError(null)

    if (file.size > IMAGE_MAX_BYTES) {
      setError(`Images must be ${IMAGE_MAX_BYTES / (1024 * 1024)} MB or smaller.`)
      return
    }

    if (!entityId) {
      onPending(file)
      return
    }

    setBusy(true)
    try {
      onChanged(await setEntityImage(universeId, entityId, file))
    } catch (failure: unknown) {
      // The API's own sentence, because it is the one that says which rule the file broke.
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.file ?? failure.message)
          : 'That image could not be uploaded.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setError(null)

    if (pending) {
      onPending(null)
      return
    }

    if (!entityId || !image) return

    setBusy(true)
    try {
      await removeEntityImage(universeId, entityId)
      onChanged(null)
    } catch {
      setError('That image could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rail__block imagefield" data-testid="entity-image-field">
      <h3 className="rail__heading">Image</h3>

      <div className="imagefield__row">
        {shown ? (
          <img className="portrait" src={shown} alt="" data-testid="entity-image-preview" />
        ) : (
          <span className="portrait portrait--blank" aria-hidden="true">
            —
          </span>
        )}

        <div className="imagefield__actions">
          {/* The input comes first so the label can be styled from its state - focus and
              disabled both travel forwards through a sibling selector and not backwards. */}
          <input
            ref={input}
            id={inputId}
            className="imagefield__input"
            type="file"
            accept={IMAGE_ACCEPT}
            disabled={busyOrDisabled}
            onChange={(event) => void choose(event.target.files?.[0])}
            data-testid="entity-image-input"
          />

          <label className="button button--quiet imagefield__pick" htmlFor={inputId}>
            {busy ? 'Uploading' : shown ? 'Replace' : 'Add image'}
          </label>

          {shown ? (
            <button
              className="button button--quiet"
              type="button"
              disabled={busyOrDisabled}
              onClick={() => void remove()}
              data-testid="entity-image-remove"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <p className="imagefield__hint">
        {pending
          ? 'Added when this entry is created.'
          : 'One picture. JPEG, PNG or WebP, up to 8 MB.'}
      </p>

      {error ? (
        <p className="field__error" role="alert" data-testid="entity-image-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
