import type { CanonStatusValue } from '../lore/types'

/**
 * One entry in the Trash. Deliberately thinner than an `EntitySummary`: the Trash answers
 * what was thrown away and when, and everything else about the entry is readable again the
 * moment it comes back.
 */
export interface TrashedEntity {
  id: string
  name: string
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  canonStatus: CanonStatusValue
  trashedAt: string
}

export interface TrashPage {
  items: TrashedEntity[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}
