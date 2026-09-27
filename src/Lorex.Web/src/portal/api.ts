import { apiFetch } from '../lib/api'
import type { CategoryValue, GenreValue } from '../publishing/types'

/**
 * A public universe, exactly as the anonymous API gives it: an allow-list of eight members, none of them
 * ever null. No id, no account, nothing inside the universe (ADR 0036).
 */
export interface PublicUniverse {
  slug: string
  name: string
  publicSummary: string
  category: CategoryValue
  genres: GenreValue[]
  authorDisplayName: string
  /** Same-origin, and answered only while the universe is public. */
  cardImageUrl: string
  publishedAt: string
}

export interface PublicUniversePage {
  items: PublicUniverse[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

const BASE = '/api/public/universes'

/** Public universes, most recently published first. Works signed in or out; sends nothing about the session. */
export function listPublicUniverses(page: number, signal?: AbortSignal) {
  return apiFetch<PublicUniversePage>(`${BASE}?page=${page}`, { signal })
}

/** One public universe by its address. A private or missing one is the same 404. */
export function getPublicUniverse(slug: string, signal?: AbortSignal) {
  return apiFetch<PublicUniverse>(`${BASE}/${encodeURIComponent(slug)}`, { signal })
}

/** The page a public universe lives at. */
export function worldPath(slug: string) {
  return `/worlds/${slug}`
}
