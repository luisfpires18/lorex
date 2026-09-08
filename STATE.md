# STATE

## Current state

Phase 007 (relationship end-to-end coverage and hardening) complete. The relationship
feature is finished: authored from the app, and proven from the app.

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
- Every lore and relationship route proves universe ownership first, then re-resolves
  every client id inside that universe. Cross-universe access answers 404.
- Deleting a type, field or option is refused while it still holds authored data.
- Web: `/app/universes/:id/lore` browser, `/lore/:entityId` dossier page with in-page
  editing, `/types` for custom types, fields and relation kinds.
- The entry page carries a Relations section, worded from the entry you are on. Adding
  and editing happen in a contextual panel; the kind picker offers both readings of a
  directional kind, so source and target are never named to the author. `EntityPicker`
  searches one universe through the API and is kept reusable.
- Universes: create, read, update, archive, unarchive, delete once archived.
- Auth: ASP.NET Core Identity with a cookie session.
- Tests: 103 API integration tests, 23 Playwright tests. Relationships are covered end
  to end in Chromium: a directional link authored from its source and read back inverted
  from its target, edited from that inverse side and confirmed against the API to still
  be stored one way round; a symmetric kind read identically from both ends; relation
  kind create, reword, and the refusal to delete one in use; the end-before-start refusal
  and the draft that survives it; notes rendered as text; and the universe and owner
  boundaries around the picker, the three id slots and the per-entity list.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`, `AddUniverses`,
  `AddLoreEntities`, `AddRelationships`. Verified against a fresh SQLite database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd` verified.

## Current phase

Phase 007 complete on `dev`. Merged from `test/007/relationship-e2e-hardening`, 3
commits, `--no-ff`. Feature branch retained. `dev` published to `origin/dev`.

Two defects were found and fixed. A delete refused because something still uses the
target interpolated a count into a sentence written only for the plural, so one blocker
read "1 relationships still use this type"; the relationship-type, entity-type and
field-in-use refusals now each carry a singular sentence, pinned by regression tests on
both sides of one. Running the whole Playwright suite for the first time since phase 006
also caught a regression that phase left behind: the Relation kinds section added to the
Types page made the lore spec's `getByLabel('Kind')` ambiguous, and that locator is now
exact.

Validation: frontend typecheck, lint, format check and production build clean; Release
build and all 103 backend tests green; the full Playwright suite green at 23 of 23;
launcher start, health probe and stop all clean; no tracked secrets.

## Immediate next step

Phase 008: timeline domain. Branch `feat/008/timeline-domain` from `dev`.

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

## Deferred

- Full relationship security audit still deferred; it is not a blocker. Phase 007 did a
  focused check in the main session only, now backed by tests: a cross-owner read of a
  relationship, its type list and the per-entity list all answer 404 with nothing about
  the universe in the body; the entity picker searches one universe and cannot surface
  another; and a relationship type id, a source id or a target id from another universe
  is refused as an unusable choice rather than as someone else's row. The wider audit -
  rate limiting, header and cookie hardening, dependency review, a deliberate look at
  the auth surface - is what remains.

## Blockers

None. Follow-up, not blocking: the lore article is not searched. Name, aliases and
summary are. Full-text search over the Tiptap document needs SQLite FTS rather than a
LIKE over editor JSON. Production deployment will need a persisted Data Protection key
ring so cookie sessions survive a restart - see
`docs/architecture/decisions/0005-cookie-authentication.md`.
