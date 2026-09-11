import { apiFetch } from '../lib/api'
import { ImageFraming, type EntityImageRef, type ThumbnailFraming } from './types'

/** What an author may pick in the file dialog. The API decides again by decoding the bytes. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

/** Mirrors the API's own ceiling, so an obviously oversized file is refused without a round trip. */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024

function base(universeId: string, entityId: string) {
  return `/api/universes/${universeId}/entities/${entityId}/image`
}

/**
 * Where one variant of one asset is served from.
 *
 * Same-origin and authenticated: the session cookie the browser already holds is what proves
 * the image may be read, and no URL anywhere points at the bucket. The asset id is in both paths
 * and the thumbnail's own id is in its path, and both are minted fresh - on every upload, and on
 * every new framing - so an address always names the same bytes. That is why neither a
 * replacement nor a reframing needs a cache-busting trick, and neither can flash the picture it
 * replaced.
 *
 * It is also under `/api`, which the service worker refuses outright (ADR 0017), so a private
 * picture never lands in the app-shell cache.
 */
export function entityImageUrl(
  universeId: string,
  entityId: string,
  image: EntityImageRef,
  variant: 'original' | 'thumbnail',
) {
  return variant === 'original'
    ? `${base(universeId, entityId)}/${image.assetId}/original`
    : `${base(universeId, entityId)}/${image.assetId}/thumbnail/${image.thumbnailId}`
}

/**
 * Sets the entry's primary image, replacing whatever it had, framed the way the author chose.
 *
 * The file and its framing travel in one request, so nothing is uploaded until the author has
 * confirmed the framing. The framing is only a request: the server makes the thumbnail itself. A
 * crop is sent only for a cropped thumbnail; a fitted one has no square to send.
 *
 * PUT, not POST: the session cookie is `SameSite=Strict` and a scripted cross-site PUT is forced
 * through a CORS preflight, so neither an HTML form nor a fetch from another site can reach this.
 */
export function setEntityImage(
  universeId: string,
  entityId: string,
  file: File,
  choice: ThumbnailFraming,
) {
  const body = new FormData()
  body.append('file', file)
  body.append('framing', String(choice.framing))
  if (choice.framing === ImageFraming.Crop && choice.crop) {
    body.append('crop', JSON.stringify(choice.crop))
  }

  return apiFetch<EntityImageRef>(base(universeId, entityId), { method: 'PUT', body })
}

/**
 * Makes a new thumbnail from the picture the entry already has - a different square, or a switch
 * between a square and the whole picture. Nothing is uploaded and the original is not touched.
 * `assetId` is the picture the author framed, so a framing chosen for a picture that has since been
 * replaced is refused rather than applied to the new one.
 */
export function setEntityThumbnail(
  universeId: string,
  entityId: string,
  assetId: string,
  choice: ThumbnailFraming,
) {
  return apiFetch<EntityImageRef>(`${base(universeId, entityId)}/thumbnail`, {
    method: 'PUT',
    body: JSON.stringify({
      assetId,
      framing: choice.framing,
      crop: choice.framing === ImageFraming.Crop ? choice.crop : null,
    }),
  })
}

export function removeEntityImage(universeId: string, entityId: string) {
  return apiFetch<void>(base(universeId, entityId), { method: 'DELETE' })
}
