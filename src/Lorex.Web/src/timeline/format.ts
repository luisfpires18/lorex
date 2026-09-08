import {
  DateKind,
  DatePrecision,
  type DatePrecisionValue,
  type TimelineDate,
  type TimelineEntry,
} from './types'

/**
 * A negative year gets a real minus sign, not a hyphen, so a span reads
 * "−42 – −30" rather than dissolving into a row of dashes.
 */
export function formatYear(year: number) {
  return year < 0 ? `\u2212${Math.abs(year)}` : String(year)
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/**
 * One point on the chronology, largest part first: `3018`, `3018.09`, `3018.09.22`.
 *
 * Month and day stay numeric on purpose. The calendar belongs to the author's world, so
 * naming month 9 "September" would invent a Gregorian fact the API never claimed.
 */
export function formatPoint(
  year: number | null,
  month: number | null,
  day: number | null,
  precision: DatePrecisionValue,
) {
  if (year === null || precision === DatePrecision.None) return ''
  if (precision === DatePrecision.Year || month === null) return formatYear(year)
  if (precision === DatePrecision.Month || day === null) return `${formatYear(year)}.${pad(month)}`
  return `${formatYear(year)}.${pad(month)}.${pad(day)}`
}

/** The whole date as one readable stamp, built from the components the API sent. */
export function formatTimelineDate(date: TimelineDate) {
  const start = formatPoint(date.startYear, date.startMonth, date.startDay, date.startPrecision)

  switch (date.kind) {
    case DateKind.Exact:
      return start
    case DateKind.Approximate:
      return start ? `c. ${start}` : ''
    case DateKind.Range: {
      const end = formatPoint(date.endYear, date.endMonth, date.endDay, date.endPrecision)
      return end ? `${start} \u2013 ${end}` : start
    }
    default:
      return 'Date unknown'
  }
}

/** A run of moments that share a year, and an era label when one was given. */
export interface YearGroup {
  /** Unique across the page, so React keeps two runs of the same year apart. */
  key: string
  /** The year and era the run stands for. What the next moment is measured against. */
  run: string
  year: number
  eraLabel: string | null
  entries: TimelineEntry[]
}

/** The moments placed in time, and the ones that are not. */
export interface GroupedTimeline {
  groups: YearGroup[]
  unplaced: TimelineEntry[]
  /** True when more than one reckoning is on the page, so the order cannot be trusted. */
  mixedEras: boolean
}

function groupKey(entry: TimelineEntry) {
  return `${entry.date.eraLabel ?? ''}|${entry.date.startYear}`
}

/**
 * Splits a page into year runs, in the order the API already sorted them.
 *
 * Runs are consecutive rather than gathered: the API decides the order, and pulling two
 * separated moments of year 3018 together would quietly rewrite it.
 */
export function groupTimeline(entries: TimelineEntry[]): GroupedTimeline {
  const groups: YearGroup[] = []
  const unplaced: TimelineEntry[] = []
  const eras = new Set<string | null>()

  for (const entry of entries) {
    if (entry.date.kind === DateKind.Unknown || entry.date.startYear === null) {
      unplaced.push(entry)
      continue
    }

    eras.add(entry.date.eraLabel)

    const run = groupKey(entry)
    const open = groups.at(-1)

    if (open && open.run === run) {
      open.entries.push(entry)
    } else {
      groups.push({
        key: `${run}|${groups.length}`,
        run,
        year: entry.date.startYear,
        eraLabel: entry.date.eraLabel,
        entries: [entry],
      })
    }
  }

  return { groups, unplaced, mixedEras: eras.size > 1 }
}
