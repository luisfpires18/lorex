# STATE

## Current state

Phase 009 (timeline UI) complete and merged into `dev`. The timeline now has a domain, an
API and a page.

- Timeline: a `TimelineEntry` is a chronology record, not a lore entity. It is a moment
  in one universe that may name any number of entities, and participation never requires
  an Event entity to exist. Links live in a `TimelineEntryLinks` join table, one row per
  entity, never a JSON list of ids. Deleting an entity drops its participation and
  leaves the moment standing.
- Chronology is signed integer components, not `DateTime` and not JSON: `StartYear`,
  `StartMonth`, `StartDay`, `EndYear`, `EndMonth`, `EndDay`, a `DateKind` and an optional
  `EraLabel`. Exact and Approximate take a start only, Range takes both ends and may not
  end before it starts, Unknown takes nothing. Month and day stay optional, a day needs a
  month and a month needs a year, and years may be negative. UTC `DateTime` is still used
  for `CreatedAt` and `UpdatedAt` only. See
  `docs/architecture/decisions/0009-fictional-chronology.md`.
- Timeline API: list, get, create, update, delete under
  `/api/universes/{universeId}/timeline`. The listing orders chronologically in SQL so
  paging is stable, filters by canon status and by a participating entity, and returns
  the chronology as numbers plus a derived precision so no client parses date strings.
- Relationships: one `LoreRelationship` row per link, with a universe-scoped
  `RelationshipType` that carries the forward name, the inverse name, and a symmetric
  flag. The reverse reading is derived at read time, never stored twice. Listing an
  entity's relationships returns the label and related entity already resolved for that
  entity's perspective. Optional UTC dates (`EndDate` may not precede `StartDate`),
  optional notes, Idea/Draft/Canon status. A type cannot be deleted while in use.
  See `docs/architecture/decisions/0008-relationship-direction.md`.
- Lore: one generic `LoreEntity` per universe. Its kind comes from an `EntityType` the
  author owns, its fields from `EntityFieldDefinition` rows on that type. Values are
  stored in typed columns, never JSON. Eight field kinds, including select,
  multi-select and an intra-universe entity reference.
- Idea, Draft and Canon status; aliases; universe-scoped tags. Search covers name,
  aliases and summary. Type, status and paging filters.
- Article content is a Tiptap document, validated structurally; link schemes are
  limited to http, https and mailto on both sides.
- Every lore, relationship and timeline route proves universe ownership first, then
  re-resolves every client id inside that universe. Cross-universe access answers 404.
- Deleting a type, field or option is refused while it still holds authored data.
- Web: `/app/universes/:id/lore` browser, `/lore/:entityId` dossier page with in-page
  editing, `/types` for custom types, fields and relation kinds, `/timeline` for the
  chronology. The sidebar Timeline item is a real link now.
- Timeline UI: a vertical spine, not a table. The year stands in the margin and sticks to
  its run; the marker on the rule encodes the kind (filled point, hollow point, bar for a
  span); undated moments hang below a broken rule instead of claiming a year. Runs are
  consecutive, never gathered, so the API's order is never rewritten by the grouping. The
  client formats from the numeric components and the precision the API sends, never from
  a string: `3018`, `3018.09`, `3018.09.22`, `c. 3018`, `3018.03 – 3021.05`,
  `Date unknown`. Month and day stay numeric because the calendar belongs to the author's
  world. A moment known only to its run's year drops the restated stamp. Create, edit and
  delete run through one drawer (`<dialog>` `showModal`) that reveals only the components
  the chosen kind allows and clears the ones it forbids. Status and participant filters,
  paging at 12.
- Universes: create, read, update, archive, unarchive, delete once archived.
- Auth: ASP.NET Core Identity with a cookie session.
- Tests: 146 API integration tests (43 for the timeline), 38 Playwright tests (15 for the
  timeline). The API tests cover the four date kinds, optional month and day, negative
  years, every refused date combination, canon status round-tripping, participation from
  none to several, chronological order with unknown dates last, a bare year before a dated
  moment inside it, stable paging, both filters, and the ownership boundary from both
  directions including a foreign entity slipped in through an update.
  `tests/Lorex.E2E/specs/timeline.spec.ts` drives the same ground through the page: each
  kind written in the drawer and read back, year zero and signed years, unknown moments
  apart from the placed ones, participation from none to several, an edit that moves a
  moment, canon status across a reload, both filters, paging across two pages with a
  delete from each, the drawer's refusals and its three ways out, mixed eras raising the
  caution, run grouping, an entity's deletion dropping its participation, hostile text
  rendered as text, a narrow viewport, and the universe and owner boundaries.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`, `AddUniverses`,
  `AddLoreEntities`, `AddRelationships`, `AddTimeline`. Verified against a fresh SQLite
  database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd` verified.

## Current phase

Phase 010 complete on `test/010/timeline-e2e-hardening`, branched from `dev`. Two
commits. Not merged, not pushed. The timeline is now complete through end-to-end
coverage.

One file added, `tests/Lorex.E2E/specs/timeline.spec.ts`. No production code changed:
the tests found no reproducible defect to fix, so none was invented. The three real ones
were caught in Phase 009 by driving the page, and the tests now hold them: a year's
moments stay one run, two runs of the same year under different reckonings stay apart,
and the drawer opens on its title.

Each test registers its own account and builds its own universe, so the suite runs
fully parallel. The drawer is driven as an author would; the API is used directly only
to seed the thirteen moments a paging test needs and to probe refusals the UI cannot
build.

One expectation was corrected rather than the code: a month with no year breaks two
rules, and the kind rule is checked last, so the API answers "Give the year this
happened in." rather than the component-level message. That is the better message and
the test now records why.

Validation: frontend typecheck, oxlint, `prettier --check` and the production Vite build
all clean; the E2E project typechecks against its own tsconfig and is Prettier-clean;
the full Playwright suite passes 38 of 38; `Start-Lorex.cmd -NoBrowser -Force` brought
both servers up and `Stop-Lorex.cmd` took them down; no tracked secrets; working tree
clean. No backend file changed, so no backend build or test run was needed.

Focused security check, main session only, now backed by the E2E suite: a second account
gets 404 with an empty body from list, get, update and delete of the first account's
moment, and the page shows the missing-universe empty state; a participant id from
another universe is refused on create and on update; a filter carrying a foreign entity
id matches nothing rather than reaching across; the drawer's picker searches one universe
only; extra fields on the request body (`id`, `universeId`, `createdAt`) are ignored, so
the row keeps the universe of its route and the id the server minted; and title and
description are rendered as text by React, with a hostile string surviving a reload
without executing.

Out of scope by design and still absent: Canon Integrity, custom calendars, era
mathematics, a visual graph, stories and plot, AI, and relationship chronology
integration. Entity pages still carry no timeline section.

Graphify was not used in Phase 010. Targeted reads of the timeline page, its drawer, the
picker and the endpoints were sufficient.

## Immediate next step

Phase 011: `feat/011/canon-integrity-domain`, branched from `dev`.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` is published and
tracks `origin/dev`; `dev` is the GitHub default branch.

`master` is reconciled and published. GitHub's unrelated root commit was joined to the
Lorex root with `--allow-unrelated-histories`; both roots are reachable from `master`,
and `dev` -> `master` merges are ordinary from here.

## Tooling

Project-scoped plugins in `.claude/settings.json`: caveman, humanizer, frontend-design,
playwright, security-guidance.

Skills in `.claude/skills/`: `aspnet-core-guidance`, `graphify`.

Graphify is installed under the WindowsApps Python, not on `PATH` as `graphify`. Run it
as `python -m graphify update .` (AST only, no API cost). `graphify-out/` is gitignored.
The two advisory `PreToolUse` hooks in `.claude/settings.json` call `python -m graphify`
for the same reason; as bare `graphify` they failed silently and never ran.

Graphify stays installed, but it is no longer the mandatory or default first step for
repository exploration. Phase 008 used it once and got no measurable benefit: the answer
came back truncated and mostly noise, and targeted reads of the neighbouring feature did
the real work. Reach for it when a question is genuinely broad; prefer a targeted read
otherwise. Reassess as the repository grows.

## Deferred

- Full relationship security audit still deferred; it is not a blocker. Phase 007 did a
  focused check in the main session only, now backed by tests: a cross-owner read of a
  relationship, its type list and the per-entity list all answer 404 with nothing about
  the universe in the body; the entity picker searches one universe and cannot surface
  another; and a relationship type id, a source id or a target id from another universe
  is refused as an unusable choice rather than as someone else's row. The wider audit -
  rate limiting, header and cookie hardening, dependency review, a deliberate look at
  the auth surface - is what remains.
- Cross-era ordering is not solved. `EraLabel` is display metadata and takes no part in
  the sort, so entries under different eras order by their raw year numbers: a Second Age
  3441 sorts after a Third Age 3018 even though it is earlier in the story. The fallback
  is deterministic, not correct. Making it correct needs eras to be first-class rows with
  an order and an offset. Phase 009 does not hide this: a page carrying more than one
  reckoning says so above the stream, and the era label is shown beside the year rather
  than folded into it. Phase 010 pins that behaviour in Playwright, so a change to the
  ordering cannot pass unnoticed.
- Full timeline security audit deferred, as for relationships. Phase 008 did a focused
  check in the main session only and Phase 010 repeated it end to end; both are backed by
  tests. What remains is the wider audit listed above, not anything timeline-specific.

## Blockers

None. Follow-up, not blocking: the lore article is not searched. Name, aliases and
summary are. Full-text search over the Tiptap document needs SQLite FTS rather than a
LIKE over editor JSON. Production deployment will need a persisted Data Protection key
ring so cookie sessions survive a restart - see
`docs/architecture/decisions/0005-cookie-authentication.md`.
