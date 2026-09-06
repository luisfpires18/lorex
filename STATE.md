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
playwright, security-guidance. ASP.NET Core guidance lives in
`.claude/skills/aspnet-core-guidance/`.

## Blockers

- Graphify: no CLI on PATH and no plugin in any configured marketplace, so it could
  not be configured project-scoped. Manual action needed if wanted.
