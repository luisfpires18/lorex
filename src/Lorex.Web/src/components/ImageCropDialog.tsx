import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { ApiError } from '../lib/api'
import type { EntityImageCrop } from '../lore/types'

/**
 * How far the author may zoom out: to the picture exactly covering the square, and no further. With
 * the position kept inside the picture as well, the square can never hold an empty corner, so a
 * thumbnail is always picture edge to edge.
 */
const MIN_ZOOM = 1

/** How far the author may zoom in. Past this a thumbnail is cut from too few pixels to be worth it. */
const MAX_ZOOM = 4

/** Pixels the square moves per arrow key; Shift moves a fifth of that, which the cropper handles. */
const KEYBOARD_STEP = 8

/**
 * The cropper: the whole picture, a square over it, and the choice of which part the thumbnail
 * shows.
 *
 * It only ever *chooses*. What it hands back is four fractions of the picture, worked out from
 * whole pixels of the picture's own size - never a canvas, never a blob, never a position on this
 * screen - and the server cuts the thumbnail from the original itself. The same square therefore
 * comes out whatever size the cropper was drawn at, and a browser cannot hand the API a thumbnail
 * that does not match the picture.
 *
 * The picture is drawn by the browser the way every other `img` in Lorex draws it, EXIF
 * orientation included, and the fractions are of that picture - which is the one the server
 * measures against too.
 *
 * Cancel, Escape and a failed confirm all leave everything as it was. A click on the backdrop does
 * nothing, deliberately: a drag that ends outside the picture would otherwise read as one.
 */
export function ImageCropDialog({
  source,
  initialCrop,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  /** An object URL for a file not yet uploaded, or the stored original's own address. */
  source: string
  /** Where the square starts. Null starts on the centred square. */
  initialCrop: EntityImageCrop | null
  title: string
  confirmLabel: string
  /** Resolves once the choice is kept; throws to keep the dialog open with the reason shown. */
  onConfirm: (crop: EntityImageCrop) => Promise<void>
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const hintId = useId()
  const zoomId = useId()

  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // showModal, not the open attribute: it brings the focus trap, the backdrop and Escape.
    dialog.current?.showModal()
  }, [])

  // Read once, on mount: the cropper only consults its starting square when the picture loads.
  const [startingArea] = useState(() =>
    initialCrop
      ? {
          x: initialCrop.x * 100,
          y: initialCrop.y * 100,
          width: initialCrop.width * 100,
          height: initialCrop.height * 100,
        }
      : undefined,
  )

  const crop = useMemo(
    () => (pixels && natural ? fractionsOf(pixels, natural) : null),
    [pixels, natural],
  )

  const loading = !natural && !loadFailed

  async function confirm() {
    if (!crop || saving) return

    setSaving(true)
    setError(null)
    try {
      await onConfirm(crop)
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.file ?? failure.fieldErrors.crop ?? failure.message)
          : 'That could not be saved. Try again.',
      )
      setSaving(false)
    }
  }

  function cancel() {
    if (!saving) onCancel()
  }

  return (
    <dialog
      className="cropper"
      ref={dialog}
      aria-labelledby={headingId}
      aria-describedby={hintId}
      onCancel={(event) => {
        event.preventDefault()
        cancel()
      }}
      data-testid="image-crop-dialog"
    >
      <div className="cropper__panel">
        <header className="cropper__head">
          <h2 className="cropper__title" id={headingId}>
            {title}
          </h2>
          <p className="cropper__hint" id={hintId}>
            Drag the picture to place the square, or select it and use the arrow keys. The whole
            picture is kept; the square is what cards show.
          </p>
        </header>

        <div className="cropper__stage" data-testid="image-crop-stage">
          {loadFailed ? (
            <p className="cropper__status" role="alert">
              That picture could not be loaded.
            </p>
          ) : (
            <Cropper
              image={source}
              crop={position}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              aspect={1}
              keyboardStep={KEYBOARD_STEP}
              showGrid={false}
              restrictPosition
              disableAutomaticStylesInjection
              onCropChange={setPosition}
              onZoomChange={setZoom}
              onCropAreaChange={(_, areaPixels) => setPixels(areaPixels)}
              onMediaLoaded={(size) =>
                setNatural({ width: size.naturalWidth, height: size.naturalHeight })
              }
              initialCroppedAreaPercentages={startingArea}
              mediaProps={{ alt: '', onError: () => setLoadFailed(true) }}
              cropperProps={{
                role: 'group',
                'aria-label': 'Thumbnail square',
                'aria-describedby': hintId,
              }}
            />
          )}

          {loading ? (
            <p className="cropper__status" aria-live="polite">
              Loading the picture
            </p>
          ) : null}
        </div>

        <div className="cropper__controls">
          <div className="cropper__zoom">
            <label className="field__label" htmlFor={zoomId}>
              Zoom
            </label>
            <input
              id={zoomId}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={loading || loadFailed || saving}
              onChange={(event) => setZoom(Number(event.target.value))}
              data-testid="image-crop-zoom"
            />
          </div>

          <div className="cropper__previews" aria-hidden="true">
            <CroppedPicture
              className="cropper__preview"
              source={source}
              crop={crop}
              testId="image-crop-preview"
            />
            <CroppedPicture
              className="cropper__preview cropper__preview--round"
              source={source}
              crop={crop}
            />
            <span className="cropper__caption">Thumbnail preview</span>
          </div>

          {error ? (
            <p className="field__error" role="alert" data-testid="image-crop-error">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="cropper__actions">
          <button
            className="button"
            type="button"
            disabled={!crop || saving}
            onClick={() => void confirm()}
            data-testid="image-crop-confirm"
          >
            {saving ? 'Saving' : confirmLabel}
          </button>
          <button
            className="button button--quiet"
            type="button"
            disabled={saving}
            onClick={cancel}
            data-testid="image-crop-cancel"
          >
            Cancel
          </button>
        </footer>
      </div>
    </dialog>
  )
}

/**
 * A square window onto part of a picture, drawn by the browser rather than rendered to a canvas.
 *
 * Used for previews of a choice that has not been saved - in the cropper, and in the editor for a
 * picture that is waiting for its entry to exist. A stored picture has a real thumbnail and uses
 * that instead.
 */
export function CroppedPicture({
  source,
  crop,
  className,
  testId,
}: {
  source: string
  crop: EntityImageCrop | null
  className: string
  testId?: string
}) {
  return (
    <span className={`${className} cropped`} data-testid={testId}>
      {crop ? (
        <img
          className="cropped__image"
          src={source}
          alt=""
          // The picture is scaled so the square fills the window, then shifted so the square is
          // what shows. Percentages of the window, so the same crop fits any window size.
          style={{
            width: `${100 / crop.width}%`,
            height: `${100 / crop.height}%`,
            left: `${(-crop.x / crop.width) * 100}%`,
            top: `${(-crop.y / crop.height) * 100}%`,
          }}
        />
      ) : null}
    </span>
  )
}

/**
 * The cropper's square, in whole pixels of the picture, as fractions of that same picture. Whole
 * pixels in, so the server rounds each edge straight back onto them; clamped, so floating-point
 * noise can never push an edge past the picture.
 */
function fractionsOf(area: Area, natural: { width: number; height: number }): EntityImageCrop {
  const x = clamp(area.x / natural.width)
  const y = clamp(area.y / natural.height)

  return {
    x,
    y,
    width: Math.min(area.width / natural.width, 1 - x),
    height: Math.min(area.height / natural.height, 1 - y),
  }
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}
