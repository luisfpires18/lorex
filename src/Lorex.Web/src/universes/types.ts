/**
 * Mirrors the backend enum: the caller's effective role in a universe. Owner comes from the universe itself; the
 * others from a membership. Not a ladder - what a role may do is decided by the API, capability by capability.
 */
export const UniverseRole = {
  Owner: 0,
  Viewer: 1,
  Reviewer: 2,
  Editor: 3,
} as const

export type UniverseRoleValue = (typeof UniverseRole)[keyof typeof UniverseRole]

export interface UniverseSummary {
  id: string
  name: string
  description: string | null
  accentColor: string | null
  isArchived: boolean
  updatedAt: string
  accessRole: UniverseRoleValue
}

export interface UniverseDetail extends UniverseSummary {
  createdAt: string
}

export interface UniversePage {
  items: UniverseSummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface UniverseInput {
  name: string
  description: string | null
  accentColor: string | null
}

export interface UniverseQuery {
  search: string
  includeArchived: boolean
  page: number
}
