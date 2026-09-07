# STATE

## Current state

Phase 002 (authentication) implemented. No product domain features yet.

- Auth: ASP.NET Core Identity with a cookie session. Register, login by username or
  email, logout, `/api/auth/me`. `LorexUser` adds nothing to `IdentityUser`.
- Web: `/login`, `/register` and a protected `/app` shell behind route guards.
  Session held in a React context fed by `/api/auth/me`.
- API: `Lorex.Api` on `http://localhost:5180`, SQLite via EF Core, `/health` + `/api/health`.
- Web: `Lorex.Web` (React 19 + TS + Vite) on `http://localhost:5173`, proxies `/api`.
- Tests: 13 API integration tests, 8 Playwright tests. All green.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`. Apply to a fresh database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd` verified with auth in place.
- Tiptap installed as a dependency only. Editor not built.

## Current phase

Phase 002 complete and merged into `dev`. Current branch: `dev`.
`feat/002/authentication` still exists, not deleted.

## Immediate next step

Phase 003: Universe ownership and the core Universe system. Branch
`feat/003/universe-core` from `dev`.

## Tooling

Project-scoped plugins in `.claude/settings.json`: caveman, humanizer, frontend-design,
playwright, security-guidance.

Skills in `.claude/skills/`: `aspnet-core-guidance`, `graphify`.

Graphify 0.9.55 installed project-scoped. Advisory PreToolUse hooks, no strict mode.
Rebuild with `graphify update .` (AST only, no API cost). `graphify-out/` is gitignored.

## Blockers

None. Production deployment will need a persisted Data Protection key ring so cookie
sessions survive a restart - see `docs/architecture/decisions/0005-cookie-authentication.md`.
