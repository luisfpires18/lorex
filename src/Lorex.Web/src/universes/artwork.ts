import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { artworkUrl } from '../publishing/api'
import type { UniverseArtworkRef } from '../publishing/types'

/** A universe's artwork as its owner reads it; nothing (204) when it has none. Owner-only: the Publish capability. */
function getArtwork(universeId: string, signal?: AbortSignal) {
  return apiFetch<UniverseArtworkRef | undefined>(`/api/universes/${universeId}/artwork`, {
    signal,
  })
}

/**
 * A universe's artwork, for drawing it as the world's atmosphere - its card, the 960-wide cut, never the original.
 *
 * Asked for only by the owner: the artwork is a publishing asset and a collaborator's role cannot read it (ADR 0041),
 * so a shared universe is never asked and shows Lorex's own atmosphere instead. Decorative throughout - while it
 * loads, when there is none, and when the read fails, the answer is null and nothing is said. The setter lets a screen
 * that has just changed the artwork (Publish) hand the new one up without a second read.
 */
export function useUniverseArtwork(universeId: string, isOwner: boolean) {
  const [held, setHeld] = useState<{ universeId: string; artwork: UniverseArtworkRef | null }>()

  useEffect(() => {
    if (!isOwner || !universeId) return
    const controller = new AbortController()
    getArtwork(universeId, controller.signal)
      .then((artwork) => setHeld({ universeId, artwork: artwork ?? null }))
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [universeId, isOwner])

  const artwork = isOwner && held?.universeId === universeId ? held.artwork : null
  const setArtwork = useCallback(
    (next: UniverseArtworkRef | null) => setHeld({ universeId, artwork: next }),
    [universeId],
  )

  return [artwork ? artworkUrl(universeId, artwork, 'card') : null, setArtwork] as const
}
