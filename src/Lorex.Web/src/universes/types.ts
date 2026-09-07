export interface UniverseSummary {
  id: string
  name: string
  description: string | null
  accentColor: string | null
  isArchived: boolean
  updatedAt: string
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
