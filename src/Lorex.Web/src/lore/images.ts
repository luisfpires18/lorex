import { apiFetch } from '../lib/api'
import type { EntityImageRef } from './types'

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
 * the image may be read, and no URL anywhere points at the bucket. The asset id is in the path
 * and is minted fresh for every upload, so an address always names the same bytes - which is why
 * a replacement needs no cache-busting trick and cannot flash the picture it replaced.
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
  return `${base(universeId, entityId)}/${image.assetId}/${variant}`
}

/**
 * Sets the entry's primary image, replacing whatever it had.
 *
 * PUT, not POST: the session cookie is `SameSite=Strict` and a scripted cross-site PUT is forced
 * through a CORS preflight, so neither an HTML form nor a fetch from another site can reach this.
 */
export function setEntityImage(universeId: string, entityId: string, file: File) {
  const body = new FormData()
  body.append('file', file)

  return apiFetch<EntityImageRef>(base(universeId, entityId), { method: 'PUT', body })
}

export function removeEntityImage(universeId: string, entityId: string) {
  return apiFetch<void>(base(universeId, entityId), { method: 'DELETE' })
}
