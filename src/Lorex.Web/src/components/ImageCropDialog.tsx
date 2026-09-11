import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { ApiError } from '../lib/api'
import {
  ImageFraming,
  type EntityImageCrop,
  type ImageFramingValue,
  type ThumbnailFraming,
} from '../lore/types'

/** How far the author may zoom in. Past this a thumbnail is cut from too few pixels to be worth it. */
const MAX_ZOOM = 4

/** Pixels the square moves per arrow key; Shift moves a fifth of that, which the cropper handles. */
const KEYBOARD_STEP = 8

const HINTS: Record<ImageFramingValue, string> = {
  [ImageFraming.Crop]:
    'Drag the picture to place the square, or select it and use the arrow keys. The whole picture is kept; the square is what cards show.',
  [ImageFraming.Fit]:
    'The whole picture sits inside the square, with nothing cut off or stretched. The original is kept exactly as it is; cards show it like this.',
}

/**
 * The framing dialog: the whole picture, and the choice of what the thumbnail cards show - a square
 * of it, or all of it fitted inside the square.
 *
 * It only ever *chooses*. What it hands back is the framing and, for a crop, four fractions of the
 * picture worked out from whole pixels of the picture's own size - never a canvas, never a blob,
 * never a position on this screen - and the server makes the thumbnail from the original itself.
 * The same choice therefore comes out whatever size the dialog was drawn at, and a browser cannot
 * hand the API a thumbnail that does not match the picture.
 *
 * Switching to "Fit full image" lays a preview of the fitted square over the cropper and makes the
 * cropper inert, rather than taking it away: the square the author had placed, and the zoom, are
 * exactly where they were when they switch back.
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
  initial,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  /** An object URL for a file not yet uploaded, or the stored original's own address. */
  source: string
  /** Where the dialog starts. A crop of null starts on the centred square. */
  initial: ThumbnailFraming
  title: string
  confirmLabel: string
  /** Resolves once the choice is kept; throws to keep the dialog open with the reason shown. */
  onConfirm: (choice: ThumbnailFraming) => Promise<void>
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const hintId = useId()
  const zoomId = useId()
  const framingName = useId()

  const [framing, setFraming] = useState<ImageFramingValue>(initial.framing)
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
    initial.crop
      ? {
          x: initial.crop.x * 100,
          y: initial.crop.y * 100,
          width: initial.crop.width * 100,
          height: initial.crop.height * 100,
        }
      : undefined,
  )

  const crop = useMemo(
    () => (pixels && natural ? fractionsOf(pixels, natural) : null),
    [pixels, natural],
  )

  const fitting = framing === ImageFraming.Fit
  const loading = !natural && !loadFailed

  // A fit needs only the picture; a crop needs the square placed on it.
  const choice: ThumbnailFraming | null = fitting
    ? natural
      ? { framing: ImageFraming.Fit, crop: null }
      : null
    : crop
      ? { framing: ImageFraming.Crop, crop }
      : null

  async function confirm() {
    if (!choice || saving) return

    setSaving(true)
    setError(null)
    try {
      await onConfirm(choice)
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.file ??
              failure.fieldErrors.crop ??
              failure.fieldErrors.framing ??
              failure.message)
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

          <fieldset className="framing" disabled={saving} data-testid="image-framing">
            <legend className="framing__legend">Thumbnail framing</legend>
            <label className="framing__option">
              <input
                className="framing__input"
                type="radio"
                name={framingName}
                checked={!fitting}
                onChange={() => setFraming(ImageFraming.Crop)}
                data-testid="image-framing-crop"
              />
              <span className="framing__label">Crop</span>
            </label>
            <label className="framing__option">
              <input
                className="framing__input"
                type="radio"
                name={framingName}
                checked={fitting}
                onChange={() => setFraming(ImageFraming.Fit)}
                data-testid="image-framing-fit"
              />
              <span className="framing__label">Fit full image</span>
            </label>
          </fieldset>

          <p className="cropper__hint" id={hintId} aria-live="polite">
            {HINTS[framing]}
          </p>
        </header>

        <div
          className="cropper__stage"
          data-framing={fitting ? 'fit' : 'crop'}
          data-testid="image-crop-stage"
        >
          {loadFailed ? (
            <p className="cropper__status" role="alert">
              That picture could not be loaded.
            </p>
          ) : (
            <>
              {/* Inert rather than unmounted while fitting, so the square survives a round trip. */}
              <div className="cropper__crop" inert={fitting}>
                <Cropper
                  image={source}
                  crop={position}
                  zoom={zoom}
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
              </div>

              {fitting ? (
                <div className="cropper__fit" data-testid="image-fit-stage">
                  <FittedPicture className="cropper__fitsquare" source={source} />
                </div>
              ) : null}
            </>
          )}

          {loading ? (
            <p className="cropper__status" aria-live="polite">
              Loading the picture
            </p>
          ) : null}
        </div>

        <div className="cropper__controls">
          {fitting ? null : (
            <div className="cropper__zoom">
              <label className="field__label" htmlFor={zoomId}>
                Zoom
              </label>
              <input
                id={zoomId}
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                disabled={loading || loadFailed || saving}
                onChange={(event) => setZoom(Number(event.target.value))}
                data-testid="image-crop-zoom"
              />
            </div>
          )}

          <div className="cropper__previews" aria-hidden="true">
            <FramedPicture
              className="cropper__preview"
              source={source}
              choice={{ framing, crop }}
              testId="image-crop-preview"
            />
            <FramedPicture
              className="cropper__preview cropper__preview--round"
              source={source}
              choice={{ framing, crop }}
            />
            <span className="cropper__caption">
              {fitting ? 'Thumbnail preview · whole picture' : 'Thumbnail preview'}
            </span>
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
            disabled={!choice || saving}
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
 * A preview of a framing that has not been saved: the chosen square, or the whole picture fitted
 * inside the square. Used in the dialog and in the editor for a picture that is waiting for its
 * entry to exist. A stored picture has a real thumbnail and uses that instead.
 */
export function FramedPicture({
  source,
  choice,
  className,
  testId,
}: {
  source: string
  choice: ThumbnailFraming
  className: string
  testId?: string
}) {
  return choice.framing === ImageFraming.Fit ? (
    <FittedPicture className={className} source={source} testId={testId} />
  ) : (
    <CroppedPicture className={className} source={source} crop={choice.crop} testId={testId} />
  )
}

/**
 * A square window onto part of a picture, drawn by the browser rather than rendered to a canvas.
 */
function CroppedPicture({
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
    <span className={`${className} cropped`} data-framing="crop" data-testid={testId}>
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
 * The whole picture inside a square window, centred, with the rest of the window left to whatever
 * is behind it - the same thing the server's fitted thumbnail is, drawn by the browser.
 */
function FittedPicture({
  source,
  className,
  testId,
}: {
  source: string
  className: string
  testId?: string
}) {
  return (
    <span className={`${className} fitted`} data-framing="fit" data-testid={testId}>
      <img className="fitted__image" src={source} alt="" />
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
