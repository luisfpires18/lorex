const formatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Formats an API timestamp, returning an empty string rather than "Invalid Date". */
export function formatDate(iso: string) {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? '' : formatter.format(parsed)
}
