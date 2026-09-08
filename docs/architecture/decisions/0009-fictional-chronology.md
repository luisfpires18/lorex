# ADR 0009 - Fictional chronology is stored as signed integer components

Status: accepted (2026-09-08)

## Context

A timeline entry places a moment in a universe: "Year 3018 - Frodo leaves the Shire".
The universes Lorex is for do not run on the Gregorian calendar. Their years may count
down to a reckoning and back up again, run past any real range, and belong to named eras
that do not line up with each other. Authors also rarely know the whole date: a year on
its own, a rough year, or a span is often all there is, and sometimes there is nothing
but the certainty that it happened.

`DateTime` and `DateTimeOffset` cannot hold any of that. They pin a value to a real
calendar, refuse years outside 1 to 9999, and imply a precision the author never claimed.
A JSON blob would hold anything but could not be ordered, indexed or filtered in SQL.

## Decision

Chronology is a small set of nullable, signed integer columns on `TimelineEntry`:
`StartYear`, `StartMonth`, `StartDay`, `EndYear`, `EndMonth`, `EndDay`, plus a
`DateKind` and an optional `EraLabel`. No `DateTime`, no JSON. UTC `DateTime` is still
used for `CreatedAt` and `UpdatedAt`, which are real timestamps about the record rather
than claims about the story.

`DateKind` says what the components mean, and is the only thing validated hard:

- `Exact` and `Approximate` require a start year and forbid any end component.
- `Range` requires both years, and the end may not sort before the start.
- `Unknown` carries no components at all.

Month and day stay optional under every kind, so a bare year is a complete claim rather
than an incomplete date. A day requires a month and a month requires a year, because the
smaller component means nothing without the larger. Months are bounded to 1-12 and days
to 1-31, and nothing further: this is deliberately not a calendar engine, and Lorex does
not decide how long a month runs in someone else's world.

Responses carry the components as numbers plus a derived `TimelineDatePrecision`
(`None`, `Year`, `Month`, `Day`), so a client formats what it wants without ever parsing
a string back into parts.

## Consequences

- Ordering, filtering and paging all happen in SQL, on a real index over
  `(UniverseId, DateKind, StartYear, StartMonth, StartDay)`.
- The chronological listing is deterministic. Unknown dates go last as one block, because
  they are placed in the story but not in time and sorting them into year zero would be
  arbitrary. Within a year, an absent month counts as zero, so an entry known only to its
  year comes before any dated moment inside it. Title then id break the remaining ties, so
  two entries never swap places between one page and the next.
- **Cross-era ordering is not solved.** `EraLabel` is display metadata in Phase 008 and
  takes no part in the sort, so entries under different eras still order by their raw year
  numbers. A Second Age 3441 sorts after a Third Age 3018 even though it is earlier in the
  story. That fallback is deterministic, not correct. Making it correct needs eras to be
  first-class rows with an order and an offset, which is a later phase.
- Negative years work, so a calendar may count down to its own zero.
- Two entries can claim the same moment. Nothing detects that they contradict each other;
  Canon Integrity is deferred.
- A date cannot yet be written the way its own calendar names it ("mid-Afteryule"). The
  components are numbers, and naming months is a display concern for a later phase.
