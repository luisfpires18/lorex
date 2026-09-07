# STATE

## Current state

Phase 003 (core Universe system) implemented. No lore entities yet.

- Universes: private, owned by exactly one user. Create, read, update, archive,
  unarchive, and delete once archived. Name search, archived filter, deterministic
  sort, server-side paging. Every query and mutation filters on `OwnerId`; a
  cross-owner request answers 404.
- Web: `/app` universe browser (plate grid, search, filter, paging, empty and error
  states); `/app/universes/:id` workspace shell with Overview and Settings working
  and the later sections greyed out.
- Auth: ASP.NET Core Identity with a cookie session. Register, login by username or
  email, logout, `/api/auth/me`.
- API: `Lorex.Api` on `http://localhost:5180`, SQLite via EF Core, `/health` + `/api/health`.
- Web: `Lorex.Web` (React 19 + TS + Vite) on `http://localhost:5173`, proxies `/api`.
- Tests: 39 API integration tests, 13 Playwright tests. All green.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`, `AddUniverses`.
  Verified against a fresh SQLite database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd` verified.
- Tiptap installed as a dependency only. Editor not built.

## Current phase

Phase 003 on `feat/003/universe-core`, unmerged.

## Immediate next step

Phase 004: the core Entity system inside a universe (the first lore records).
Branch `feat/004/entity-core` from `dev` once 003 is merged.

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

None. Production deployment will need a persisted Data Protection key ring so cookie
sessions survive a restart - see `docs/architecture/decisions/0005-cookie-authentication.md`.
