# STATE

## Current state

Repository bootstrap complete. No product features exist.

- API: `Lorex.Api` on `http://localhost:5180`, SQLite via EF Core, `/health` + `/api/health`.
- Web: `Lorex.Web` (React 19 + TS + Vite) on `http://localhost:5173`, proxies `/api` to the API.
- Tests: 2 API integration tests, 3 Playwright smoke tests. All green.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd` verified working.
- Tiptap installed as a dependency only. Editor not built.
- Identity EF Core package referenced. No Identity wiring, no auth, no domain models.

## Current phase

Phase 001 complete and merged into `dev`. Current branch: `dev`.
`feat/001/repository-bootstrap` still exists, not deleted.

## Immediate next step

Branch `feat/002/authentication` from `dev`: derive `LorexDbContext` from
`IdentityDbContext`, add the Identity migration, add auth endpoints.
See `docs/architecture/decisions/0003-identity-foundation.md`.

## Tooling

Project-scoped plugins in `.claude/settings.json`: caveman, humanizer, frontend-design,
playwright, security-guidance.

Skills in `.claude/skills/`: `aspnet-core-guidance`, `graphify`.

Graphify 0.9.55 installed project-scoped. Advisory PreToolUse hooks, no strict mode.
Graph built: 362 nodes, 351 edges, 38 communities. Rebuild with `graphify update .`
(AST only, no API cost). `graphify-out/` is gitignored.

## Blockers

None.
