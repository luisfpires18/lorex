# STATE

## Current state

Phase 008 (timeline domain) implemented on `feat/008/timeline-domain`. Backend and
domain only: there is no timeline UI yet.

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
  editing, `/types` for custom types, fields and relation kinds. Nothing for the
  timeline yet.
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

Phase 008 on `feat/008/timeline-domain`, branched from `dev`. Four local commits, not
merged and not pushed. Backend only by design: no timeline UI, no visual timeline, no
custom calendar engine, no Canon Integrity conflict detection, no relationship
chronology integration.

Validation: Release build clean, all 146 backend tests green, a fresh SQLite database
applies all seven migrations, no tracked secrets, working tree clean. Playwright was not
run: nothing in the frontend changed.

A focused security check was done in the main session, not a full audit. Every timeline
route gates on `LoreAccess.OwnsUniverseAsync` before touching a row and re-filters the
entry by `UniverseId`, so there is no IDOR. Participants are re-resolved inside the
universe on create and on update, and a foreign id is refused as an unusable choice with
no name in the body. The request record is explicit, so `Id`, `UniverseId`, `CreatedAt`
and `UpdatedAt` cannot be overposted. The `entityId` list filter sits inside the
universe-scoped query, so a foreign id matches nothing rather than reporting that it is
foreign.

## Immediate next step

Phase 009: timeline UI. Branch `feat/009/timeline-ui` from `dev` once phase 008 is
merged.

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

## Deferred

- Full relationship security audit still deferred; it is not a blocker. Phase 007 did a
  focused check in the main session only, now backed by tests: a cross-owner read of a
  relationship, its type list and the per-entity list all answer 404 with nothing about
  the universe in the body; the entity picker searches one universe and cannot surface
  another; and a relationship type id, a source id or a target id from another universe
  is refused as an unusable choice rather than as someone else's row. The wider audit -
  rate limiting, header and cookie hardening, dependency review, a deliberate look at
  the auth surface - is what remains.
- Cross-era ordering is not solved. `EraLabel` is display metadata in Phase 008 and takes
  no part in the sort, so entries under different eras order by their raw year numbers: a
  Second Age 3441 sorts after a Third Age 3018 even though it is earlier in the story.
  The fallback is deterministic, not correct. Making it correct needs eras to be
  first-class rows with an order and an offset.
- Full timeline security audit deferred, as for relationships. Phase 008 did a focused
  check in the main session only, backed by tests.

## Blockers

None. Follow-up, not blocking: the lore article is not searched. Name, aliases and
summary are. Full-text search over the Tiptap document needs SQLite FTS rather than a
LIKE over editor JSON. Production deployment will need a persisted Data Protection key
ring so cookie sessions survive a restart - see
`docs/architecture/decisions/0005-cookie-authentication.md`.
