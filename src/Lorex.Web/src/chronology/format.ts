import {
  EraDirection,
  EraLabelPosition,
  type Chronology,
  type ChronologyEra,
  type EraDirectionValue,
  type EraLabelPositionValue,
  type EraWriting,
} from './types'

/**
 * The one place the client writes a year out. Timeline stamps and headings, a birth year on an
 * entry, an old version in its history and the Settings preview all come through here, so a
 * universe's dates read the same way everywhere and "{year} {era}" is never assembled by hand.
 *
 * It follows the API's `UniverseChronology.FormatYear`: the era's short label, or its name when
 * there is none, on the side of the year the era asks for. Nothing here orders anything - the
 * API sorts, and the client never compares formatted dates.
 */

/** True once the author has named at least one era. */
export function namesEras(chronology: Chronology) {
  return chronology.eras.length > 0
}

export function findEra(
  chronology: Chronology,
  eraId: string | null | undefined,
): ChronologyEra | null {
  if (!eraId) return null
  return chronology.eras.find((era) => era.id === eraId) ?? null
}

/** What is written beside a year: the short label, or the full name when there is none. */
export function eraLabel(era: Pick<EraWriting, 'name' | 'abbreviation'>) {
  return era.abbreviation ?? era.name
}

/**
 * A plain signed year. A negative one gets a real minus sign, not a hyphen, so a span reads
 * "−42 – −30" rather than dissolving into a row of dashes.
 */
export function formatSignedYear(year: number) {
  return year < 0 ? `−${Math.abs(year)}` : String(year)
}

/**
 * A date's text with an era label on the side its era asks for. Low level: reach for it directly
 * only where all that is left of an era is a remembered label, as in an old version whose era
 * has since been removed.
 */
export function withEraLabel(text: string, label: string, position: EraLabelPositionValue) {
  return position === EraLabelPosition.AfterYear ? `${text} ${label}` : `${label} ${text}`
}

/**
 * Whether a stored year is on this universe's line at all: a plain year on a universe with no
 * eras, or a year in one of its eras. A year written before the eras existed is neither, and the
 * client shows it apart rather than guessing which era it meant.
 */
export function isPlaced(chronology: Chronology, eraId: string | null) {
  return namesEras(chronology) ? findEra(chronology, eraId) !== null : eraId === null
}

/** A year the way this universe writes it: "3441", "−42", "BF 10", "10 Third Age". */
export function formatChronologyYear(chronology: Chronology, year: number, eraId: string | null) {
  return formatChronologyPoint(chronology, { year, month: null, day: null, eraId })
}

/** One point on a universe's line, down to whatever it states. */
export interface ChronologyPointParts {
  year: number
  month: number | null
  day: number | null
  eraId: string | null
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/**
 * A point, largest part first: `3018`, `3018.09`, `BF 10.09.22`.
 *
 * Month and day stay numeric on purpose. The calendar belongs to the author's world, so naming
 * month 9 "September" would invent a Gregorian fact the API never claimed. When month names
 * arrive they belong here, in the one formatter, and nowhere else.
 */
export function formatChronologyPoint(chronology: Chronology, point: ChronologyPointParts) {
  let text = formatSignedYear(point.year)
  if (point.month !== null) {
    text += `.${pad(point.month)}`
    if (point.day !== null) text += `.${pad(point.day)}`
  }

  const era = findEra(chronology, point.eraId)
  return era ? withEraLabel(text, eraLabel(era), era.labelPosition) : text
}

/** The eras a preview is drawn for: what they are called, and how their years run. */
export interface PreviewEra extends Pick<EraWriting, 'name' | 'abbreviation' | 'labelPosition'> {
  direction: EraDirectionValue
}

/**
 * A handful of years in order, earliest first, exactly as the configured eras would place and
 * write them: "BF 120, BF 1, AF 1, AF 120". Built from the order and the directions alone, so it
 * shows the author what their configuration means before any of it is saved.
 */
export function previewYears(eras: PreviewEra[], sample: [number, number] = [120, 1]) {
  const [far, near] = sample

  return eras.flatMap((era) => {
    const label = eraLabel(era).trim() || 'Era'
    const years = era.direction === EraDirection.Descending ? [far, near] : [near, far]
    return years.map((year) => withEraLabel(String(year), label, era.labelPosition))
  })
}
