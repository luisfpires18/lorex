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

`feat/001/repository-bootstrap` - done, unmerged, on branch.

## Immediate next step

Decide phase 002. Likely `feat/002/authentication`: wire ASP.NET Core Identity onto
`LorexDbContext`, add the Identity migration, add auth endpoints.

## Tooling

Project-scoped plugins in `.claude/settings.json`: caveman, humanizer, frontend-design,
playwright, security-guidance.

Skills in `.claude/skills/`: `aspnet-core-guidance`, `graphify`.

Graphify 0.9.55 installed project-scoped. Advisory PreToolUse hooks, no strict mode.
Graph built: 362 nodes, 351 edges, 38 communities. Rebuild with `graphify update .`
(AST only, no API cost). `graphify-out/` is gitignored.

## Blockers

None.
