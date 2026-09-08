# STATE

## Current state

Phase 009 (timeline UI) implemented on `feat/009/timeline-ui`, not merged. The timeline
now has a domain, an API and a page.

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
- Tests: 146 API integration tests (43 new for the timeline), 23 Playwright tests. The
  timeline tests cover the four date kinds, optional month and day, negative years, every
  refused date combination, canon status round-tripping, participation from none to
  several, chronological order with unknown dates last, a bare year before a dated moment
  inside it, stable paging, both filters, and the ownership boundary from both
  directions including a foreign entity slipped in through an update.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`, `AddUniverses`,
  `AddLoreEntities`, `AddRelationships`, `AddTimeline`. Verified against a fresh SQLite
  database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd` verified.

## Current phase

Phase 009 on `feat/009/timeline-ui`, branched from `dev`, 2 commits, not merged and not
pushed. Frontend only: no backend file changed, so no backend build or test run was
needed and no API defect appeared.

Out of scope by design and still absent: Playwright coverage for the timeline, Canon
Integrity, custom calendars, era mathematics, a visual graph, stories and plot, AI, and
relationship chronology integration. Entity pages still carry no timeline section.

The entity picker was widened rather than copied: `EntityPicker.tsx` holds one search
hook, one outside-click hook and one key handler, and exports both the single picker
relations use and the multi picker a moment's participants use.

Validation: typecheck, oxlint, `prettier --check` and the production Vite build all
clean; the manual flow below was driven in a browser; no tracked secrets; working tree
clean.

Manual flow, all confirmed against the running app: sidebar Timeline opens the page; a
moment of each of the four date kinds was created through the drawer; several entities
were linked to one moment; an edit changed title, month and status and the entry moved
to its new place; the status filter and the participant filter both narrowed the list;
paging showed 12 of 14 with a working second page; a delete removed one moment and
refilled the page; a reload kept everything. Adding one Second Age moment beside the
Third Age ones raised the cross-era caution, and it sorted after 3019 exactly as the
known limitation says it would.

Three defects were found by driving it and fixed in the second commit: a year's moments
split into one group each (the run key was compared against the React key built from
it), the spine broke between runs, and the drawer handed focus to its scrolling body,
which then wore a focus ring across the panel.

Visual review in dark, light and at 375px: layout holds, no horizontal overflow, the
drawer fills a narrow screen, and per-moment tools stay visible where there is no hover.

The security posture is unchanged from Phase 008: no route, contract or validation rule
was touched.

## Immediate next step

Phase 010: `test/010/timeline-e2e-hardening`. Playwright coverage for the timeline page.

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
  than folded into it.
- Full timeline security audit deferred, as for relationships. Phase 008 did a focused
  check in the main session only, backed by tests.

## Blockers

None. Follow-up, not blocking: the lore article is not searched. Name, aliases and
summary are. Full-text search over the Tiptap document needs SQLite FTS rather than a
LIKE over editor JSON. Production deployment will need a persisted Data Protection key
ring so cookie sessions survive a restart - see
`docs/architecture/decisions/0005-cookie-authentication.md`.
