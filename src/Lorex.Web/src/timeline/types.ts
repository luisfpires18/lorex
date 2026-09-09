import type { CanonStatusValue } from '../lore/types'

/** Mirrors the backend enum. What a moment actually claims about when it happened. */
export const DateKind = {
  Exact: 0,
  Approximate: 1,
  Range: 2,
  Unknown: 3,
} as const

export type DateKindValue = (typeof DateKind)[keyof typeof DateKind]

export const DATE_KIND_LABELS: Record<DateKindValue, string> = {
  [DateKind.Exact]: 'Exact',
  [DateKind.Approximate]: 'Approximate',
  [DateKind.Range]: 'Range',
  [DateKind.Unknown]: 'Unknown',
}

export const DATE_KIND_ORDER: DateKindValue[] = [
  DateKind.Exact,
  DateKind.Approximate,
  DateKind.Range,
  DateKind.Unknown,
]

/** What each kind promises the author, in the author's own words. */
export const DATE_KIND_HINTS: Record<DateKindValue, string> = {
  [DateKind.Exact]: 'A day, month or year you are sure of.',
  [DateKind.Approximate]: 'Around then. Shown with a “c.” in front.',
  [DateKind.Range]: 'A span, from one point to another.',
  [DateKind.Unknown]: 'In the story, but not yet placed in time.',
}

/** Mirrors the backend enum. How far down a set of components goes. Derived, never sent. */
export const DatePrecision = {
  None: 0,
  Year: 1,
  Month: 2,
  Day: 3,
} as const

export type DatePrecisionValue = (typeof DatePrecision)[keyof typeof DatePrecision]

/** The chronology as numbers. Never a string the client has to parse back apart. */
export interface TimelineDate {
  kind: DateKindValue
  startYear: number | null
  startMonth: number | null
  startDay: number | null
  endYear: number | null
  endMonth: number | null
  endDay: number | null
  eraLabel: string | null
  startPrecision: DatePrecisionValue
  endPrecision: DatePrecisionValue
}

/** One entity taking part, resolved by the API so a moment renders in one request. */
export interface TimelineEntityLink {
  entityId: string
  name: string
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  canonStatus: CanonStatusValue

  /**
   * The participant is in the Trash. Still reported, because the form posts a moment's whole
   * participant set back on every save and dropping it here would delete the participation.
   * Shown as unavailable and not linked; it becomes ordinary again when the entry is restored.
   */
  isTrashed: boolean
}

export interface TimelineEntry {
  id: string
  title: string
  description: string | null
  canonStatus: CanonStatusValue
  date: TimelineDate
  entities: TimelineEntityLink[]
  createdAt: string
  updatedAt: string
}

export interface TimelineEntryPage {
  items: TimelineEntry[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** Everything a client may set. Matches the backend's explicit request record. */
export interface TimelineEntryInput {
  title: string
  description: string | null
  canonStatus: CanonStatusValue
  dateKind: DateKindValue
  startYear: number | null
  startMonth: number | null
  startDay: number | null
  endYear: number | null
  endMonth: number | null
  endDay: number | null
  eraLabel: string | null
  entityIds: string[]
}

export interface TimelineQuery {
  canonStatus: CanonStatusValue | null
  entityId: string | null
  page: number
}
