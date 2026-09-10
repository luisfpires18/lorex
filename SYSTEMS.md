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
| `STATE.md` | Operational state only: roadmap position, blockers, deferred decisions. |
| `graphify-out/` | Generated knowledge graph. Gitignored, manual-only; rebuild with `python -m graphify update .`. |
| `docs/tooling/` | Agent tooling trial notes (RTK and Graphify evaluation). |

## `.claude` - session tooling

| Path | Responsibility |
| --- | --- |
| `CLAUDE.md` | Tooling rules (Graphify and RTK usage) kept out of the root router. |
| `settings.json` | Project-scoped plugins, the RTK `PreToolUse` hook, and `ask` rules for push/force-push/merge/branch-delete/remote/PR. Graphify stays manual-only. |
| `hooks/rtk-safe-hook.ps1` | Permission-neutral wrapper around `rtk hook claude`: keeps the rewrite, strips every permission decision. |
| `skills/aspnet-core-guidance/` | Backend conventions for `src/Lorex.Api`. |
| `skills/graphify/` | Graphify skill and references. |
| `skills/phase-workflow/` | How a meaningful change is run: plan, validate, wrap up. |

## `src/Lorex.Api` - ASP.NET Core host

| Path | Responsibility |
| --- | --- |
| `Program.cs` | Composition root and pipeline. |
| `Data/LorexDbContext.cs` | Single EF Core context; applies feature entity configurations. |
| `Data/DatabaseSetup.cs` | SQLite registration, data-source path resolution, dev migrations. |
| `Data/Migrations/` | EF Core migrations. |
| `Features/Health/HealthEndpoints.cs` | `/health` and `/api/health`. |
| `Features/Auth/AuthSetup.cs` | Identity registration and cookie session configuration. |
| `Features/Auth/AuthEndpoints.cs` | Register, login, logout and current-user endpoints. |
| `Features/Auth/AuthContracts.cs` | Request and response records for the auth surface. |
| `Features/Auth/LorexUser.cs` | Application user on top of `IdentityUser`. |
| `Features/Auth/LorexUserConfiguration.cs` | Unique index on the normalized email. |
| `Features/Universes/Universe.cs` | Universe entity, owned by one user. |
| `Features/Universes/UniverseConfiguration.cs` | Owner FK, indexes, per-owner unique name. |
| `Features/Universes/UniverseEndpoints.cs` | Owner-scoped CRUD, search, paging, archive. |
| `Features/Universes/UniverseContracts.cs` | Request and response records for universes. |
| `Features/Lore/LoreModel.cs` | Entity, type, field, option, alias, value and tag entities, and `EntityFieldSemantic`. |
| `Features/Lore/LoreConfiguration.cs` | Lore schema: keys, indexes and delete behaviour. |
| `Features/Lore/LoreAccess.cs` | The universe-ownership gate every lore route passes. |
| `Features/Lore/EntityEndpoints.cs` | Entity CRUD, search, filters, paging, tags. |
| `Features/Lore/EntityTypeEndpoints.cs` | Entity types and their field definitions. |
| `Features/Lore/EntityTypeDefaults.cs` | Idempotent seeding of the starter types. |
| `Features/Lore/RevisionModel.cs` | `EntityRevision` and its alias, tag and value snapshot rows. |
| `Features/Lore/RevisionConfiguration.cs` | Revision schema: the per-entry version index, and where a key deliberately is not. |
| `Features/Lore/RevisionCapture.cs` | Reads the entry back after a write, compares it to the last version, records the next. |
| `Features/Lore/RevisionEndpoints.cs` | History list, one version, and the restore that replays it through the entity update. |
| `Features/Lore/RevisionContracts.cs` | Response records for history and one version. |
| `Features/Lore/LoreContent.cs` | Structural validation of the Tiptap article. |
| `Features/Lore/LoreArticleText.cs` | Reduces a Tiptap document to the prose an author wrote. |
| `Features/Lore/EntitySearchIndex.cs` | The SQLite FTS5 index: reindex, backfill, the scored query, and how typed words become an expression. |
| `Features/Lore/EntitySearchBackfill.cs` | Indexes entries that have no index row, once, at startup. |
| `Features/Lore/LoreValidation.cs` | Shared lore input checks. |
| `Features/Relationships/RelationshipModel.cs` | `RelationshipType` and `LoreRelationship`. |
| `Features/Relationships/RelationshipConfiguration.cs` | Relationship schema: keys, indexes, delete behaviour. |
| `Features/Relationships/RelationshipTypeEndpoints.cs` | Relationship-type CRUD; delete refused while in use. |
| `Features/Relationships/RelationshipEndpoints.cs` | Relationship CRUD and the per-entity, perspective-resolved list. |
| `Features/Relationships/RelationshipContracts.cs` | Request and response records for relationships. |
| `Features/Relationships/RelationshipValidation.cs` | Relationship input checks, UTC coercion, perspective labels. |
| `Features/Timeline/TimelineModel.cs` | `TimelineEntry`, its participation link, date kind and precision. |
| `Features/Timeline/TimelineConfiguration.cs` | Timeline schema: keys, the chronological index, delete behaviour. |
| `Features/Timeline/TimelineEndpoints.cs` | Timeline CRUD and the chronological, filtered, paged listing. |
| `Features/Timeline/TimelineContracts.cs` | Request and response records for the timeline. |
| `Features/Timeline/TimelineValidation.cs` | Date-kind rules and component checks. No calendar engine. |
| `Features/CanonIntegrity/CanonIntegrityModel.cs` | `CanonConflict`, its subject rows, severity, status and subject kind. |
| `Features/CanonIntegrity/CanonIntegrityConfiguration.cs` | Conflict schema: the unique fingerprint index and the review index. |
| `Features/CanonIntegrity/CanonIntegrityRule.cs` | `ICanonIntegrityRule`, the finding record and the fingerprint hash. |
| `Features/CanonIntegrity/CanonIntegrityEvaluator.cs` | Runs the rules over one universe and reconciles by fingerprint. |
| `Features/CanonIntegrity/CanonPromotionGate.cs` | Refuses a write that introduces a new High fingerprint; `JoinedTransaction`. |
| `Features/CanonIntegrity/CanonIntegritySetup.cs` | The registered rule set, evaluator and promotion gate. |
| `Features/CanonIntegrity/CanonIntegrityEndpoints.cs` | List, get, evaluate, dismiss, reopen; subject-name resolution. |
| `Features/CanonIntegrity/CanonIntegrityContracts.cs` | Response records for conflicts and evaluation. |
| `Features/CanonIntegrity/CanonRuleText.cs` | Shared wording and length fitting for rule titles and explanations. |
| `Features/CanonIntegrity/Rules/` | The six production rules: three structural, three chronological. |
| `Features/CanonIntegrity/Rules/CanonLifespan.cs` | Reads declared birth/death years and the moments comparable to them. |
| `Features/Trash/TrashEndpoints.cs` | The Trash listing and the gated restore. Entries only. |
| `Features/Trash/TrashContracts.cs` | Response records for the Trash. |
| `Features/Export/UniverseBackup.cs` | The backup format, as records. The contract a future import reads. |
| `Features/Export/UniverseBackupBuilder.cs` | Reads one universe in a single transaction and orders every collection. |
| `Features/Export/UniverseExportEndpoints.cs` | The export route, the download filename, and how a backup is written. |
| `appsettings.json` | Non-secret defaults; empty connection string. |
| `appsettings.Development.json` | Dev connection string and CORS origins. |

## `src/Lorex.Web` - React client

| Path | Responsibility |
| --- | --- |
| `src/main.tsx` | React entry point. |
| `src/App.tsx` | Routes and providers. |
| `src/styles.css` | Design tokens and all component styles. |
| `src/lib/api.ts` | Same-origin fetch wrapper and `ApiError`. |
| `src/auth/` | Session context, `useAuth`, and the route guards. |
| `src/universes/` | Universe API client and types. |
| `src/lore/` | Lore API client, shared types, document and field helpers, and the revision client. |
| `src/export/` | Backup download: the request, the server's filename, and handing the blob to the browser. |
| `src/trash/` | Trash API client and DTO types. |
| `src/relationships/` | Relationship API client, DTO types, and both-readings helper. |
| `src/timeline/` | Timeline API client, DTO types, date formatting and year grouping. |
| `src/canon/` | Canon Integrity API client, DTO types, and the reader for the promotion gate's 409. |
| `src/lib/dates.ts` | Timestamp formatting, date-input round trips, and spans. |
| `src/components/` | `AuthLayout`, `Field`, `UniverseCard`, `UniverseForm`, `EntityCard`, `FieldInputs`, `TokenInput`, `LoreEditor`, `EntityPicker` (single and multi, one shared search), `EntityHistory`, `RelationshipSection`, `RelationshipTypeManager`, `TimelineEntryForm`, `ConflictEntry`, `CanonBlockNotice` (the one refused-write presentation, shared by every gated form). |
| `src/pages/` | Login, Register, Universes browser, and the workspace: Overview, Lore, entry page, Timeline, Canon, Types, Trash and Settings. |
| `vite.config.ts` | Dev server port 5173, proxy to the API, build config. |

## `tests`

| Path | Responsibility |
| --- | --- |
| `Lorex.Api.Tests/LorexApiFactory.cs` | Boots the real host over in-memory SQLite. |
| `Lorex.Api.Tests/HealthEndpointTests.cs` | Backend test-infrastructure proof. |
| `Lorex.Api.Tests/AuthEndpointTests.cs` | Registration, sign-in, session and logout. |
| `Lorex.Api.Tests/UniverseEndpointTests.cs` | Universe CRUD and the ownership invariant. |
| `Lorex.Api.Tests/LoreEndpointTests.cs` | Lore CRUD, field kinds, and cross-universe isolation. |
| `Lorex.Api.Tests/EntityRevisionTests.cs` | What makes a version, what a version keeps, ownership, and what a restore may do. |
| `Lorex.Api.Tests/RelationshipEndpointTests.cs` | Relationship CRUD, both perspectives, and cross-owner isolation. |
| `Lorex.Api.Tests/TimelineEndpointTests.cs` | Date kinds, participation, ordering, paging, and ownership. |
| `Lorex.Api.Tests/CanonIntegrityEndpointTests.cs` | Conflict lifecycle, fingerprinting, the structural rules, filters and ownership. |
| `Lorex.Api.Tests/CanonChronologyRuleTests.cs` | Semantic field assignment, the three chronology rules and every case they must stay quiet on. |
| `Lorex.Api.Tests/CanonPromotionGateTests.cs` | What the gate refuses, what a refusal leaves behind, and what it must never block. |
| `Lorex.Api.Tests/UniverseExportTests.cs` | What a backup holds, what it must never hold, its coherence and its determinism. |
| `Lorex.Api.Tests/TrashEndpointTests.cs` | What trashing hides, what it must not destroy, and what a restore may refuse. |
| `Lorex.Api.Tests/EntitySearchTests.cs` | What full text finds, what it must never find, and what keeps the index in step. |
| `Lorex.E2E/playwright.config.ts` | Starts API + web, runs Chromium. |
| `Lorex.E2E/specs/smoke.spec.ts` | Frontend-loads smoke suite. |
| `Lorex.E2E/specs/auth.spec.ts` | Register, sign out, guard, sign back in. |
| `Lorex.E2E/specs/universes.spec.ts` | Create, edit, search, archive, paginate, ownership. |
| `Lorex.E2E/specs/lore.spec.ts` | Author an entry, edit it, filter, and cross-owner isolation. |
| `Lorex.E2E/specs/relationships.spec.ts` | Both readings, relation kinds, refusals, and the universe and owner boundaries. |
| `Lorex.E2E/specs/timeline.spec.ts` | Date kinds through the drawer, order, filters, paging, refusals, and the owner boundary. |
| `Lorex.E2E/specs/history.spec.ts` | One journey: versions accumulate, an old one is read in place and put back. |
| `Lorex.E2E/specs/export.spec.ts` | One journey: the click produces a real file on disk, named and readable. |
| `Lorex.E2E/specs/trash.spec.ts` | One journey: an entry and its connection leave together and one restore returns both. |
| `Lorex.E2E/specs/canon.spec.ts` | The review screen, conflict identity across runs, the promotion gate's refusals, reconciliation on write, and the universe and owner boundaries. |

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
| `architecture/decisions/README.md` | One-line index of every ADR. |
| `architecture/decisions/` | ADRs; one small file per durable decision. |
