# STATE

## Current state

Phase 004 (core entity system) implemented. No relationships, timeline or stories yet.

- Lore: one generic `LoreEntity` per universe. Its kind comes from an `EntityType` the
  author owns, its fields from `EntityFieldDefinition` rows on that type. Values are
  stored in typed columns, never JSON. Eight field kinds, including select,
  multi-select and an intra-universe entity reference.
- Idea, Draft and Canon status; aliases; universe-scoped tags. Search covers name,
  aliases and summary. Type, status and paging filters.
- Article content is a Tiptap document, validated structurally; link schemes are
  limited to http, https and mailto on both sides.
- Every lore route proves universe ownership first, then re-resolves every client id
  inside that universe. Cross-universe access answers 404.
- Deleting a type, field or option is refused while it still holds authored data.
- Web: `/app/universes/:id/lore` browser, `/lore/:entityId` dossier page with in-page
  editing, `/types` for custom types and fields.
- Universes: create, read, update, archive, unarchive, delete once archived.
- Auth: ASP.NET Core Identity with a cookie session.
- Tests: 76 API integration tests, 17 Playwright tests. All green.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`, `AddUniverses`,
  `AddLoreEntities`. Verified against a fresh SQLite database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd` verified.

## Current phase

Phase 004 on `feat/004/entity-core`, unmerged.

## Immediate next step

Phase 005: relationships between entities. Branch `feat/005/relationships` from `dev`
once 004 is merged.

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

Graphify 0.9.55 installed project-scoped. Advisory PreToolUse hooks, no strict mode.
Rebuild with `graphify update .` (AST only, no API cost). `graphify-out/` is gitignored.

## Blockers

None. Follow-up, not blocking: the lore article is not searched. Name, aliases and
summary are. Full-text search over the Tiptap document needs SQLite FTS rather than a
LIKE over editor JSON. Production deployment will need a persisted Data Protection key ring so cookie
sessions survive a restart - see `docs/architecture/decisions/0005-cookie-authentication.md`.
