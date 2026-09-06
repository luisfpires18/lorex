# SYSTEMS

Repository index. Paths and one-line responsibilities only.

## Root

| Path | Responsibility |
| --- | --- |
| `Lorex.slnx` | Solution file for the .NET projects. |
| `Directory.Build.props` | Shared MSBuild properties (net10.0, nullable, analyzers). |
| `Directory.Packages.props` | Central NuGet package versions. |
| `dotnet-tools.json` | Local .NET tool manifest (`dotnet-ef`). |
| `Start-Lorex.cmd` / `Stop-Lorex.cmd` | Windows entry points for the local launcher. |
| `CLAUDE.md` | Traffic controller for Claude sessions. |
| `STATE.md` | Current state, phase, next step, blockers. |
| `graphify-out/` | Generated knowledge graph. Gitignored; rebuild with `graphify update .`. |

## `.claude` - session tooling

| Path | Responsibility |
| --- | --- |
| `CLAUDE.md` | Tooling rules (Graphify usage) kept out of the root router. |
| `settings.json` | Project-scoped plugins and Graphify advisory hooks. |
| `skills/aspnet-core-guidance/` | Backend conventions for `src/Lorex.Api`. |
| `skills/graphify/` | Graphify skill and references. |

## `src/Lorex.Api` - ASP.NET Core host

| Path | Responsibility |
| --- | --- |
| `Program.cs` | Composition root and pipeline. |
| `Data/LorexDbContext.cs` | Single EF Core context; applies feature entity configurations. |
| `Data/DatabaseSetup.cs` | SQLite registration, data-source path resolution, dev migrations. |
| `Data/Migrations/` | EF Core migrations. |
| `Features/Health/HealthEndpoints.cs` | `/health` and `/api/health`. |
| `appsettings.json` | Non-secret defaults; empty connection string. |
| `appsettings.Development.json` | Dev connection string and CORS origins. |

## `src/Lorex.Web` - React client

| Path | Responsibility |
| --- | --- |
| `src/main.tsx` | React entry point. |
| `src/App.tsx` | App shell; probes `/api/health`. |
| `src/index.css` | Global styles. |
| `vite.config.ts` | Dev server port 5173, proxy to the API, build config. |

## `tests`

| Path | Responsibility |
| --- | --- |
| `Lorex.Api.Tests/LorexApiFactory.cs` | Boots the real host over in-memory SQLite. |
| `Lorex.Api.Tests/HealthEndpointTests.cs` | Backend test-infrastructure proof. |
| `Lorex.E2E/playwright.config.ts` | Starts API + web, runs Chromium. |
| `Lorex.E2E/specs/smoke.spec.ts` | Frontend-loads smoke suite. |

## `scripts`

| Path | Responsibility |
| --- | --- |
| `Lorex.Common.ps1` | Shared launcher helpers: ports, process tracking, readiness. |
| `Start-Lorex.ps1` | Starts API + web, waits, opens the browser. |
| `Stop-Lorex.ps1` | Stops launcher-owned processes. |

## `docs`

| Path | Responsibility |
| --- | --- |
| `architecture/branching.md` | Branch naming and merge rules. |
| `architecture/decisions/` | ADRs; one small file per durable decision. |
