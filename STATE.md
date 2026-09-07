# STATE

## Current state

Phase 005 (relationship domain) implemented. Backend only: no relationship UI yet.

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
  editing, `/types` for custom types and fields. No relationship screens yet.
- Universes: create, read, update, archive, unarchive, delete once archived.
- Auth: ASP.NET Core Identity with a cookie session.
- Tests: 100 API integration tests (24 new for relationships), 17 Playwright tests.
  Backend all green in Release; Playwright not re-run, no frontend code changed.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`, `AddUniverses`,
  `AddLoreEntities`, `AddRelationships`. Verified against a fresh SQLite database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd` verified.

## Current phase

Phase 005 complete on `dev`. Merged from `feat/005/relationship-domain`, 3 commits.
Feature branch retained.

## Immediate next step

Phase 006: relationship UI. Branch `feat/006/relationship-ui` from `dev`.
Entity-page relationship display, a relationship-type editor, and Playwright coverage.

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

- Full relationship security audit deferred to integration/hardening phase. Phase 005
  did a focused manual check only: IDOR, cross-universe ids, overposting, ownership
  filters. Not a blocker.

## Blockers

None. Follow-up, not blocking: the lore article is not searched. Name, aliases and
summary are. Full-text search over the Tiptap document needs SQLite FTS rather than a
LIKE over editor JSON. Production deployment will need a persisted Data Protection key
ring so cookie sessions survive a restart - see
`docs/architecture/decisions/0005-cookie-authentication.md`.
