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
| `assets/brand/lorex-icon.png` | The Lorex mark, as the owner supplied it. The one source every icon is derived from; not shipped. |
| `.github/workflows/` | CI on pull requests, and the DEV deployment from `dev`. |
| `infra/main.bicep` | The two DEV Azure resources: the Linux App Service plan and the site. |
| `infra/main.parameters.json` | Deployment parameters. Placeholder name; no secret. |

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
| `Data/DatabaseSetup.cs` | SQLite registration, data-source path resolution, startup-step wiring. |
| `Data/LorexDatabaseInitializer.cs` | Migrates once per process, and what other startup work awaits. |
| `Data/Migrations/` | EF Core migrations. |
| `Hosting/FrontendHosting.cs` | Serving the built client from `wwwroot`, its cache headers and its fallback. |
| `Hosting/ProxyHeaders.cs` | Honouring `X-Forwarded-Proto` behind a TLS-terminating proxy. |
| `Features/Health/HealthEndpoints.cs` | `/health` and `/api/health`. |
| `Features/Auth/AuthSetup.cs` | Identity registration and cookie session configuration. |
| `Features/Auth/DataProtectionSetup.cs` | Where the key ring lives, when a path is configured. |
| `Features/Auth/AuthEndpoints.cs` | Register, login, logout and current-user endpoints. |
| `Features/Auth/AuthContracts.cs` | Request and response records for the auth surface. |
| `Features/Auth/LorexUser.cs` | Application user on top of `IdentityUser`. |
| `Features/Auth/LorexUserConfiguration.cs` | Unique index on the normalized email. |
| `Features/Universes/Universe.cs` | Universe entity, owned by one user. |
| `Features/Universes/UniverseConfiguration.cs` | Owner FK, indexes, per-owner unique name. |
| `Features/Universes/UniverseEndpoints.cs` | Owner-scoped CRUD, search, paging, archive. |
| `Features/Universes/UniverseContracts.cs` | Request and response records for universes. |
| `Features/Chronology/ChronologyModel.cs` | `ChronologyEra`, its direction and label position. |
| `Features/Chronology/ChronologyConfiguration.cs` | Era schema: the per-universe unique position, and the limits. |
| `Features/Chronology/ChronologyPoint.cs` | The one date comparison: era rank, direction-signed year, month, day. The year-zero rule. |
| `Features/Chronology/UniverseChronology.cs` | A universe's loaded reckoning: placing a stored year, the years between two where the configuration defines it, and writing one out. |
| `Features/Chronology/ChronologyEndpoints.cs` | Read and replace the eras; the gate, the in-use refusal, and the unplaced counts. |
| `Features/Chronology/ChronologyContracts.cs` | Request and response records for the chronology. |
| `Features/Chronology/ChronologyValidation.cs` | Era shape checks: names, labels, enums, the bound. |
| `Features/Chronology/ChronologyPointValidation.cs` | Checks for one stored point - month and day shape, the era a year needs, years from 1 in an era. Shared by timeline entries and scenes. |
| `Features/Lore/LoreModel.cs` | Entity, type, field, option, alias, value and tag entities, and `EntityFieldSemantic`. No article. |
| `Features/Lore/EntityArticleModel.cs` | `EntityArticle`: one entry's Tiptap article, keyed by the entry, no navigation back; `EntityArticleRevision`: its own saved versions. |
| `Features/Lore/EntityArticleConfiguration.cs` | Article schema: the entry's id as key and foreign key, version numbers unique per entry, both deleted with the entry. |
| `Features/Lore/EntityArticleContracts.cs` | The article save (document and the `updatedAt` it was written over), read, restore and version records. |
| `Features/Lore/EntityArticleEndpoints.cs` | Read, save and restore an entry's article and read its history; live entries of the owner's universe only; the stale-save 409; the entry's `UpdatedAt` and search kept in step. The only route that carries an article. |
| `Features/Lore/LoreConfiguration.cs` | Lore schema: keys, indexes and delete behaviour. |
| `Features/Lore/LoreAccess.cs` | The universe-ownership gate every lore route passes. |
| `Features/Lore/EntityEndpoints.cs` | Entity CRUD, search, filters, paging, tags. |
| `Features/Lore/EntityTypeEndpoints.cs` | Entity types and their field definitions. |
| `Features/Lore/EntityTypeDefaults.cs` | Idempotent seeding of the starter types, each with its icon key as data. |
| `Features/Lore/EntityTypeIcons.cs` | The closed set of icon keys a type may carry; mirrored by the web client. |
| `Features/Lore/EntityImageModel.cs` | `EntityImage`: the one primary image an entry may have. |
| `Features/Lore/EntityImageConfiguration.cs` | Image schema: the entry's id as both key and foreign key. |
| `Features/Lore/EntityImageKeys.cs` | The object-key convention (a thumbnail id per framing), and the lengths the columns allow. |
| `Features/Lore/EntityImageEndpoints.cs` | Set, reframe, read and remove the image; the replace, reframe and cleanup ordering; storage failures as 503. |
| `Features/Media/ImagePreparation.cs` | The one upload gate: what is accepted as an image, the orientation rule, placing a crop on pixels, cutting the square. Shared by entry pictures and profile photos. |
| `Features/Media/ImageCrop.cs` | The crop as four fractions, and the column lengths a stored image needs. |
| `Features/Media/MediaObjectWrites.cs` | Writing a pair of objects at once and sweeping a set at once, and why that is safe. |
| `Features/Media/MediaObjectStore.cs` | `IMediaObjectStore`, its two failure exceptions, and what is registered when nothing is configured. |
| `Features/Media/R2MediaObjectStore.cs` | Cloudflare R2 over its S3-compatible API: the two upload flags R2 needs, and SDK failures kept inside. |
| `Features/Media/InMemoryMediaObjectStore.cs` | Objects in a dictionary, for local development and Playwright. |
| `Features/Media/MediaSetup.cs` | Which store this host runs against, from `Media:Provider`. |
| `Features/Lore/RevisionModel.cs` | `EntityRevision` and its alias, tag and value snapshot rows; the article copy only versions from before ADR 0028 hold. |
| `Features/Lore/RevisionConfiguration.cs` | Revision schema: the per-entry version index, and where a key deliberately is not. |
| `Features/Lore/RevisionCapture.cs` | Reads the structured entry back after a write, compares it to the last version, records the next. Never the article. |
| `Features/Lore/RevisionEndpoints.cs` | History list, one version, and the restore that replays it through the entity update. |
| `Features/Lore/RevisionContracts.cs` | Response records for history and one version. |
| `Features/Lore/LoreContent.cs` | Structural validation of the Tiptap article. |
| `Features/Lore/LoreArticleText.cs` | Reduces a Tiptap document to the prose an author wrote. |
| `Features/Lore/EntitySearchIndex.cs` | The SQLite FTS5 index: reindex, backfill, the scored query, a result page's article excerpts, and how typed words become an expression. |
| `Features/Lore/EntitySearchBackfill.cs` | Indexes entries that have no index row, once, at startup. |
| `Features/Lore/LoreValidation.cs` | Shared lore input checks. |
| `Features/Relationships/RelationshipModel.cs` | `RelationshipType` with its Canon constraints, `RelationshipAgeOrder`, and `LoreRelationship`. |
| `Features/Relationships/RelationshipConfiguration.cs` | Relationship schema: keys, indexes, delete behaviour. |
| `Features/Relationships/RelationshipTypeEndpoints.cs` | Relationship-type CRUD; delete refused while in use. |
| `Features/Relationships/RelationshipEndpoints.cs` | Relationship CRUD and the per-entity, perspective-resolved list. |
| `Features/Relationships/RelationshipContracts.cs` | Request and response records for relationships. |
| `Features/Relationships/RelationshipValidation.cs` | Relationship and Canon constraint input checks, UTC coercion, perspective labels. |
| `Features/Timeline/TimelineModel.cs` | `TimelineEntry`, its participation link, date kind and precision. |
| `Features/Timeline/TimelineConfiguration.cs` | Timeline schema: keys, the chronological index, delete behaviour. |
| `Features/Timeline/TimelineEndpoints.cs` | Timeline CRUD and the chronological, filtered, paged listing. |
| `Features/Timeline/TimelineContracts.cs` | Request and response records for the timeline. |
| `Features/Timeline/TimelineValidation.cs` | Date-kind rules, component checks, and years written in the universe's reckoning. No calendar engine. |
| `Features/CanonIntegrity/CanonIntegrityModel.cs` | `CanonConflict`, its subject rows, severity, status and subject kind. |
| `Features/CanonIntegrity/CanonIntegrityConfiguration.cs` | Conflict schema: the unique fingerprint index and the review index. |
| `Features/CanonIntegrity/CanonIntegrityRule.cs` | `ICanonIntegrityRule`, the finding record and the fingerprint hash. |
| `Features/CanonIntegrity/CanonIntegrityEvaluator.cs` | Runs the rules over one universe and reconciles by fingerprint. |
| `Features/CanonIntegrity/CanonPromotionGate.cs` | Refuses a write that introduces a new High fingerprint; `JoinedTransaction`. |
| `Features/CanonIntegrity/CanonIntegritySetup.cs` | The registered rule set, evaluator and promotion gate. |
| `Features/CanonIntegrity/CanonIntegrityEndpoints.cs` | List, get, evaluate, dismiss, reopen; subject-name resolution. |
| `Features/CanonIntegrity/CanonIntegrityContracts.cs` | Response records for conflicts and evaluation. |
| `Features/CanonIntegrity/CanonRuleText.cs` | Shared wording and length fitting for rule titles and explanations. |
| `Features/CanonIntegrity/Rules/` | The eight production rules: three structural, three chronological, two relationship constraints. |
| `Features/CanonIntegrity/Rules/CanonLifespan.cs` | Reads declared birth/death years and the moments comparable to them, placed as chronology points. |
| `Features/CanonIntegrity/Rules/CanonRelationshipAge.cs` | Reads Canon relationships whose type carries an age constraint, with both ends' birth years placed. |
| `Features/Stories/StoryModel.cs` | `Story`, `StoryStatus`, `Chapter` (optional grouping, no stored number), `Scene` (chapter or Unchaptered, order in it, point of view, chronology) and `SceneEntityLink`. Narrative, not lore. |
| `Features/Stories/StoryConfiguration.cs` | Story schema: the unique chapter order, the two filtered per-container scene orders, the delete actions of each reference, and `StoryLimits` - the manuscript's bound among them. |
| `Features/Stories/StoryContracts.cs` | Request and response records for stories, chapters, scenes, lore references, both orders and a scene's position. |
| `Features/Stories/StoryValidation.cs` | Story, chapter, scene, arc, beat and manuscript input checks. Structural only; nothing compares a scene or a beat with the lore or with another, and nothing reads prose. |
| `Features/Stories/StoryOrder.cs` | The per-container scene query, and park-then-place for both orders, across two containers at once. |
| `Features/Stories/StoryLoreReferences.cs` | The one lore-reference projection scenes and beats share: loading the entries named, and listing them by name. |
| `Features/Stories/StoryEndpoints.cs` | Story CRUD, owner-scoped, ungated; the story read with its chapters and every scene, in a fixed number of queries. |
| `Features/Stories/ChapterEndpoints.cs` | Chapter CRUD, append, the whole-order reorder, and the delete that moves a chapter's scenes to Unchaptered first. |
| `Features/Stories/SceneEndpoints.cs` | Scene CRUD, append and gap-closing per container, the one-container reorder, the position move, the edit that moves, reference checks including the Trash, and the batched read in reading order. |
| `Features/Stories/PlotModel.cs` | `PlotArc` (story-owned), `PlotBeat` (arc-owned), and the `PlotBeatScene` and `PlotBeatEntity` references. Planning, not structure and not lore. |
| `Features/Stories/PlotConfiguration.cs` | Plot schema: the unique arc and beat orders, the pair keys, and why every link cascades from both sides. |
| `Features/Stories/PlotContracts.cs` | Request and response records for arcs, beats and both orders. |
| `Features/Stories/PlotOrder.cs` | Park-then-place for arc order and beat order, across two arcs at once for a move. |
| `Features/Stories/PlotArcEndpoints.cs` | Arc CRUD, append, the whole-order reorder, the delete that takes beats and nothing else, and the plot read in a fixed number of queries. |
| `Features/Stories/PlotBeatEndpoints.cs` | Beat CRUD, append and gap-closing per arc, the one-arc reorder, the edit that moves between arcs, same-story and same-universe link checks including the Trash, and the batched beat read. |
| `Features/Stories/SceneManuscriptModel.cs` | `SceneManuscript`: one scene's plain prose, keyed by the scene, with no navigation back from `Scene`. |
| `Features/Stories/SceneManuscriptConfiguration.cs` | Manuscript schema: the scene's id as key and foreign key, long text, deleted with the scene. |
| `Features/Stories/SceneManuscriptContracts.cs` | The manuscript request (text and the `updatedAt` it was written over) and response. |
| `Features/Stories/SceneManuscriptEndpoints.cs` | Read and save one scene's prose, owner-scoped; the stale-save 409; the story's `UpdatedAt`. The only route that carries prose. |
| `Features/Trash/TrashEndpoints.cs` | The Trash listing and the gated restore. Entries only. |
| `Features/Trash/TrashContracts.cs` | Response records for the Trash. |
| `Features/Profile/ProfileImageModel.cs` | `ProfileImage`: the one photo an account may have, keyed by the account. |
| `Features/Profile/ProfileImageConfiguration.cs` | Profile photo schema: the user's id as both key and foreign key. |
| `Features/Profile/ProfileImageKeys.cs` | The `users/{userId}/profile/...` object-key convention, and the guard on the one segment Lorex did not mint. |
| `Features/Profile/ProfileImageEndpoints.cs` | Read, set, reframe and remove the account's photo; ownership from the session alone; storage failures as 503. |
| `Features/Profile/ProfileContracts.cs` | Response and request records for the profile photo. |
| `Features/Export/UniverseBackup.cs` | The backup format, as records. The contract a future import reads. |
| `Features/Export/UniverseBackupArchive.cs` | Archive layout, the media list, and the deterministic ZIP writer. |
| `Features/Export/UniverseBackupBuilder.cs` | Reads one universe and its media in a single transaction, and orders every collection. |
| `Features/Export/UniverseExportEndpoints.cs` | The export route, the download filename, and the one failure a backup can have. |
| `appsettings.json` | Non-secret defaults; empty connection string. |
| `appsettings.Development.json` | Dev connection string and CORS origins. |
| `appsettings.AzureDev.json` | Azure DEV paths, forwarded headers and log levels. No secret. |

## `src/Lorex.Web` - React client

| Path | Responsibility |
| --- | --- |
| `index.html` | Document shell: manifest link, PNG favicons and the apple touch icon, theme colours, viewport. |
| `public/manifest.webmanifest` | Web app manifest: name, start URL, display mode, colours, icons. |
| `public/sw.js` | Service worker: caches build output only, and what it refuses to touch. |
| `public/icon-*.png` + `apple-touch-icon.png` + `favicon-*.png` | The install and tab icons: the Lorex mark, transparent except where a platform fills transparency (maskable, Apple), at the padding each one needs. All rendered from `assets/brand/lorex-icon.png` by `scripts/render-icons.py`. |
| `public/brand-mark.png` | The same mark, transparent, for use inside the product. |
| `src/main.tsx` | React entry point. |
| `src/pwa.ts` | Registers the service worker, in production builds only. |
| `src/App.tsx` | Routes and providers. |
| `src/styles.css` | Design tokens, all component styles, and the narrow-screen and touch layers. |
| `src/lib/api.ts` | Same-origin fetch wrapper and `ApiError`. |
| `src/lib/imageCrop.ts` | The crop shape, the accepted formats and the size ceiling, shared by both pictures. |
| `src/lib/upload.ts` | The one `XMLHttpRequest` in Lorex: a multipart upload that reports byte progress, failing as the same `ApiError`. |
| `src/lib/leaveGuard.ts` | `useLeaveGuard`: asks before unsaved work is left by a same-origin link or by leaving the page, and `confirmLeaving` for Sign out. Not the Back button. |
| `src/lib/returnFocus.ts` | `useReturnFocus`: hands the focus back to whatever opened a story drawer once it closes. |
| `src/auth/` | Session context, `useAuth`, and the route guards. |
| `src/universes/` | Universe API client and types. |
| `src/profile/` | Profile photo API client and DTO types, the address of one stored variant, and the provider every avatar reads so they cannot disagree. |
| `src/lore/` | Lore API client, shared types, document and field helpers, the revision client, the article client and its bound (`article.ts`), the image client that composes an asset's URL, and `typeIcons.ts` (the built-in type icon keys and their glyphs). |
| `src/export/` | Backup download: the request, the server's filename, and handing the archive to the browser. |
| `src/trash/` | Trash API client and DTO types. |
| `src/relationships/` | Relationship API client, DTO types, and both-readings helper. |
| `src/chronology/` | Chronology API client and types, and `format.ts`: the one formatter every date on screen is written through. |
| `src/stories/` | Story, chapter, scene, plot and manuscript API client, DTO types and the manuscript bound, the scene date, count, chapter and arc labels (`format.ts`), and a container's scenes, the story's reading order and which beats point at each scene (`structure.ts`). |
| `src/timeline/` | Timeline API client, DTO types, date stamps and year grouping on top of the chronology formatter. |
| `src/canon/` | Canon Integrity API client, DTO types, and the reader for the promotion gate's 409. |
| `src/lib/dates.ts` | Timestamp formatting, date-input round trips, and spans. |
| `src/components/` | `AuthLayout`, `Wordmark` (the drawn "Lore X", spoken "Lorex"), `Field`, `UniverseCard`, `UniverseForm`, `EntityCard` (with a search result's article excerpt), `EntityArticle` (an entry's article: reading, writing with Save and Ctrl+S, the stale-save choice, the leave guard, and its own history), `EntityPortrait` (the card's picture, or its monogram), `EntityImageField` (pick, frame, replace, edit thumbnail, remove), `ImageCropDialog` (the cropper, and `CroppedPicture` for unsaved previews), `BrandMark` (the Lorex symbol, decorative, beside the wordmark), `Avatar` (the account's photo or its monogram, wherever one is drawn), `AccountMenu` (the one account dropdown: the rail's and the header's), `ProfileAvatar` (the Profile screen's circle, and upload, reframe, replace and remove), `TypeIcon`, `TypeIconPicker`, `TypeFilterBar` (the Lore browser's type chips), `ActionIcon` (the decorative icon beside an action's label), `FieldInputs`, `TokenInput`, `LoreEditor`, `EntityPicker` (single and multi, one shared search), `EntityHistory`, `RelationshipSection`, `RelationshipTypeManager`, `TimelineEntryForm`, `ChronologyPointFields` (the one era, year, month and day row, shared by the timeline and scene forms), `StoryForm`, `ChapterForm`, `ChapterSection` (a chapter's heading, summary, tools and scenes), `SceneForm` (with its Chapter field), `SceneCard` (a scene, Write, its lore and Plot rows, Move up/down and the Move to… disclosure), `SceneContext` (a scene's date, point of view, lore and beats, drawn the same on its card and on its manuscript page), `LoreReference` (a lore chip or point-of-view portrait, on a scene or a beat), `PlotPanel` (a story's Plot view: arcs, beats, reorder, delete), `PlotArcSection`, `PlotBeatItem` (a beat, its scene and lore chips, Move up/down), `PlotArcForm`, `PlotBeatForm` (with its Arc field), `SceneReferencePicker` (a story's scenes by chapter, filtered, as checkboxes), `ManuscriptPanel` (a story's Manuscript view: the outline, and the open scene), `ManuscriptEditor` (one scene's prose: plain text, Save and Ctrl+S, the stale-save choice, the leave guard, and the scene's planning beside it with Edit scene and Show in Scenes), `ChronologySettings` (name, order and turn a universe's eras, with a preview), `ConflictEntry`, `CanonBlockNotice` (the one refused-write presentation, shared by every gated form). |
| `src/pages/` | Login, Register, Universes browser, Profile, and the workspace: Overview, Lore, entry page, Timeline, Stories, a story (its Scenes, Plot and Manuscript views, one header), Canon, Types, Trash and Settings. `UniverseWorkspace` also owns the collapsing narrow-screen navigation, and lets the Lore browser alone fill the workspace column. |
| `vite.config.ts` | Dev server port 5173, proxy to the API, build config. |

## `tests`

| Path | Responsibility |
| --- | --- |
| `Lorex.Api.Tests/LorexApiFactory.cs` | Boots the real host over in-memory SQLite. |
| `Lorex.Api.Tests/HealthEndpointTests.cs` | Backend test-infrastructure proof. |
| `Lorex.Api.Tests/HostStartupTests.cs` | Startup on a real file: migrations before queries, backfill, forwarded scheme. |
| `Lorex.Api.Tests/AuthEndpointTests.cs` | Registration, sign-in, session and logout. |
| `Lorex.Api.Tests/UniverseEndpointTests.cs` | Universe CRUD and the ownership invariant. |
| `Lorex.Api.Tests/LoreEndpointTests.cs` | Lore CRUD, field kinds, and cross-universe isolation. |
| `Lorex.Api.Tests/EntityRevisionTests.cs` | What makes a version, what a version keeps, ownership, and what a restore may do. |
| `Lorex.Api.Tests/RelationshipEndpointTests.cs` | Relationship CRUD, both perspectives, Canon constraint configuration, and cross-owner isolation. |
| `Lorex.Api.Tests/CanonRelationshipAgeRuleTests.cs` | The two relationship constraint rules: order and gap, across eras, every case they stand down on, and that nothing is refused. |
| `Lorex.Api.Tests/RelationshipConstraintMigrationTests.cs` | The constraint migration down and back up over real lore on a file. |
| `Lorex.Api.Tests/TimelineEndpointTests.cs` | Date kinds, participation, ordering, paging, and ownership, on the plain reckoning. |
| `Lorex.Api.Tests/TimelineChronologyTests.cs` | Years in eras: order across eras, paging, precision, refusals, years written before the eras, and the listing held to the comparer. |
| `Lorex.Api.Tests/ChronologyPointTests.cs` | The comparison alone: directions, several eras, the order from configuration, year zero. |
| `Lorex.Api.Tests/ChronologyYearsBetweenTests.cs` | The year distance alone: one era, the countdown boundary, and every span with no answer. |
| `Lorex.Api.Tests/ChronologyEndpointTests.cs` | Writing the eras, what an era in use refuses, bad shapes, ownership, counts, and the gate. |
| `Lorex.Api.Tests/ChronologyMigrationTests.cs` | The chronology migration down and back up over real lore on a file. |
| `Lorex.Api.Tests/CanonIntegrityEndpointTests.cs` | Conflict lifecycle, fingerprinting, the structural rules, filters and ownership. |
| `Lorex.Api.Tests/CanonChronologyRuleTests.cs` | Semantic field assignment, the three chronology rules and every case they must stay quiet on. |
| `Lorex.Api.Tests/CanonPromotionGateTests.cs` | What the gate refuses, what a refusal leaves behind, and what it must never block. |
| `Lorex.Api.Tests/UniverseExportTests.cs` | What a backup holds, what it must never hold, its coherence and its determinism. |
| `Lorex.Api.Tests/StoryEndpointTests.cs` | Story CRUD, what deleting a story or a universe takes, ownership, that a story changes no lore, timeline or Canon, and the story read's fixed query count. |
| `Lorex.Api.Tests/SceneEndpointTests.cs` | Narrative order against chronology, reorder refusals, scene chronology, lore references, the Trash, delete actions and ownership. |
| `Lorex.Api.Tests/ChapterEndpointTests.cs` | Chapter CRUD, order and reorder refusals, the number that is only a position, the delete that keeps every scene, what deleting a story, universe or entry takes, and ownership. |
| `Lorex.Api.Tests/SceneChapterTests.cs` | Scenes per container: create, reorder one container, moves in every direction with nothing lost, the edit that moves, foreign chapters refused. |
| `Lorex.Api.Tests/StoryBackupTests.cs` | Stories in the current (version 9) backup: order, chapters and each scene's place in one, references, no copied lore, determinism, and version 5 and 4 files. |
| `Lorex.Api.Tests/CommandCounter.cs` | Counts the database commands a request runs, for every read that promises a fixed query count. |
| `Lorex.Api.Tests/PlotTestClient.cs` | The HTTP steps the plot tests share, and reading a backup back. Not a test. |
| `Lorex.Api.Tests/PlotArcEndpointTests.cs` | Arc CRUD, order and refusals, what deleting an arc, story or universe takes and never takes, no Canon, the plot read's fixed query count, and ownership. |
| `Lorex.Api.Tests/PlotBeatEndpointTests.cs` | Beat CRUD, order per arc, moves between arcs, scene and lore links through scene moves, deletes and the Trash, foreign ids refused alike, and ownership. |
| `Lorex.Api.Tests/PlotBackupTests.cs` | Plot in the backup since version 7: order, text, sorted link ids, nothing derived, references resolving, determinism, and a version 6 file. |
| `Lorex.Api.Tests/PlotMigrationTests.cs` | The plot migration over a story in chapters on a file: nothing else changed, delete actions, indexes and keys read back, uniqueness in SQLite, and a rollback with a plot. |
| `Lorex.Api.Tests/ManuscriptTestClient.cs` | The HTTP steps the manuscript tests share, and a sample of real-world prose. Not a test. |
| `Lorex.Api.Tests/SceneManuscriptEndpointTests.cs` | Prose read and saved exactly, empty and cleared, the bound, stale saves, ownership and foreign ids, what it lives and dies with, no Canon or search, and no prose in any story, scene, chapter or plot read. |
| `Lorex.Api.Tests/SceneManuscriptBackupTests.cs` | Prose in the backup since version 8: exact, beside its scene, once, deterministic, and a version 7 file. |
| `Lorex.Api.Tests/SceneManuscriptMigrationTests.cs` | The manuscript migration over a story in chapters with a plot on a file: key, columns and cascade read back, prose through structural changes, and a rollback with prose. |
| `Lorex.Api.Tests/StoryPhaseIntegrityTests.cs` | The Story phase as one product: the whole ownership graph taken apart delete by delete beside a second story, and a full story workflow changing no lore, relationship, timeline, revision, Canon finding or search result. |
| `Lorex.Api.Tests/StoryMigrationTests.cs` | The story migration down and back up over real lore on a file, with the delete actions read back from SQLite. |
| `Lorex.Api.Tests/ChapterMigrationTests.cs` | The chapter migration over real stories on a file: scenes Unchaptered in their order, both filtered indexes refusing a clash, and a rollback in reading order. |
| `Lorex.Api.Tests/TrashEndpointTests.cs` | What trashing hides, what it must not destroy, and what a restore may refuse. |
| `Lorex.Api.Tests/TestMediaObjectStore.cs` | The object store the test host runs against, and its three failure hooks. |
| `Lorex.Api.Tests/R2MediaObjectStoreTests.cs` | The R2 adapter alone: the upload flags on the request and on the wire, and SDK failures kept inside. |
| `Lorex.Api.Tests/EntityImageTests.cs` | What is stored, how a thumbnail is framed and reframed, who may touch it, and what a replace, reframe or remove leaves behind. |
| `Lorex.Api.Tests/ProfileImageTests.cs` | The account's photo: what is stored, who may touch it, what a replace, reframe or remove leaves behind, and what a backup must never hold. |
| `Lorex.Api.Tests/EntitySearchTests.cs` | What full text finds, what it must never find, what keeps the index in step, and the article excerpt a result carries. |
| `Lorex.Api.Tests/ArticleTestClient.cs` | The HTTP steps the article tests share, and a sample of a real article document. Not a test. |
| `Lorex.Api.Tests/EntityArticleEndpointTests.cs` | An article read and saved exactly, empty and cleared, the bound, refused documents, stale saves, ownership and foreign ids, independence from structured edits and entry restores, versions from before, its own history and restore, the Trash, universe deletion, and no article in any other payload. |
| `Lorex.Api.Tests/EntityArticleBackupTests.cs` | Articles in a version 9 backup: exact, with every version, cleared and trashed ones, no copy on entry revisions, determinism, and a version 8 file. |
| `Lorex.Api.Tests/EntityArticleMigrationTests.cs` | The article migration over lore on a file: articles moved exactly with a first version, the column dropped without a rebuild, foreign keys and the search trigger intact, versions from before still readable, and a rollback with articles. |
| `Lorex.E2E/playwright.config.ts` | Starts API + web, runs Chromium. |
| `Lorex.E2E/specs/smoke.spec.ts` | Frontend-loads smoke suite. |
| `Lorex.E2E/specs/auth.spec.ts` | Register, sign out, guard, sign back in. |
| `Lorex.E2E/specs/universes.spec.ts` | Create, edit, search, archive, paginate, ownership. |
| `Lorex.E2E/specs/lore.spec.ts` | Author an entry, edit it, filter, and cross-owner isolation. |
| `Lorex.E2E/specs/lore-article.spec.ts` | An entry's article written, saved by button and keyboard, kept through reloads and structured edits, found by search with an excerpt, and restored from its history; asking before unsaved text is left, including Sign out; failed, stale and orphaned saves; 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/relationships.spec.ts` | Both readings, relation kinds, refusals, and the universe and owner boundaries. |
| `Lorex.E2E/specs/relationship-constraints.spec.ts` | A kind's Canon constraints: configured, broken, reported, corrected, edited and cleared; the editor from 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/timeline.spec.ts` | Date kinds through the drawer, order, filters, paging, refusals, and the owner boundary. |
| `Lorex.E2E/specs/chronology.spec.ts` | Eras named and ordered in Settings, a timeline across them, a relabel, a birth year in an era, and the screens from 390px to 1920px. |
| `Lorex.E2E/specs/stories.spec.ts` | A story told out of chronological order and kept that way; chapters created, reordered and deleted with scenes moved between them and none lost; reorder and Move to… by keyboard; a trashed reference; the screens from 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/plot.spec.ts` | A plot planned across chapters: arcs and beats created and reordered, scenes and lore linked, a scene moved and still linked, both ways between a beat and its scene, deletes that keep every scene and entry; empty states; keyboard reorder; 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/manuscript.spec.ts` | Prose written scene by scene and kept through reloads, moves, reorders and a chapter delete, gone with its scene; asking before unsaved prose is left; failed, stale and over-long saves; empty and foreign scenes; planning beside the prose; 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/story-workspace.spec.ts` | The Story workspace as one product: a new story leading to a scene, one header, one read and an address per view, Write and Show in Scenes, deep links that land focused and marked, unsaved prose kept through links and Sign out, drawers returning focus, and the work on the first screen from 390px to 1920px. |
| `Lorex.E2E/specs/history.spec.ts` | One journey: versions accumulate, an old one is read in place and put back. |
| `Lorex.E2E/specs/export.spec.ts` | One journey: the click produces a real archive on disk, named and readable. |
| `Lorex.E2E/specs/support/account.ts` | Opening the account menu and signing out through it, wherever it is on screen. Not a spec. |
| `Lorex.E2E/specs/support/png.ts` | Builds a real PNG, pixel by pixel, with an optional EXIF orientation. Not a spec. |
| `Lorex.E2E/specs/support/pixels.ts` | Reads colours back out of a displayed picture, and checks a crop square sits wholly on it. Not a spec. |
| `Lorex.E2E/specs/support/zip.ts` | Reads a downloaded archive's table of contents. Not a spec. |
| `Lorex.E2E/specs/trash.spec.ts` | One journey: an entry and its connection leave together and one restore returns both. |
| `Lorex.E2E/specs/canon.spec.ts` | The review screen, conflict identity across runs, the promotion gate's refusals, reconciliation on write, and the universe and owner boundaries. |
| `Lorex.E2E/specs/mobile.spec.ts` | One journey at 390px: navigation, authoring, a reachable action, the drawer picker, and no sideways scroll. |
| `Lorex.E2E/specs/entity-image.spec.ts` | Add, replace and remove a picture; framing and reframing read back from the card; one square crop the picture always covers; a sideways photo; the cropper and layout on a phone; history; backup; the worker. |
| `Lorex.E2E/specs/type-filter.spec.ts` | Type icons chosen and removed on the Types screen; the Lore type bar with search, Trash and keyboard; the bar on a phone; the Lore browser filling a desktop's workspace column. |
| `Lorex.E2E/specs/profile.spec.ts` | The account screen: reached from a universe, what it prints, the guard, the photo added, framed, reframed, replaced and removed, the two stages of a save, and the circle on a phone. |
| `Lorex.E2E/specs/account-menu.spec.ts` | The one account menu: on the global rail and not in a universe's sidebar, the same in the universes header, the avatar agreeing everywhere, the keyboard, and a phone. |
| `Lorex.E2E/specs/pwa.spec.ts` | Manifest, icons and metadata, and what the service worker is never allowed to cache. |

## `scripts`

| Path | Responsibility |
| --- | --- |
| `Lorex.Common.ps1` | Shared launcher helpers: ports, process tracking, readiness. |
| `Start-Lorex.ps1` | Starts API + web, waits, opens the browser. |
| `Stop-Lorex.ps1` | Stops launcher-owned processes. |
| `render-icons.py` | Renders every icon and favicon from `assets/brand/lorex-icon.png`: trim, pad, area-average, write. Standard library only. |

## `docs`

| Path | Responsibility |
| --- | --- |
| `architecture/branching.md` | Branch naming and merge rules. |
| `testing/phase2-story-manual-test.md` | The owner's manual Phase 2 Story pass: one writing session from an empty story to a backup, in eighteen steps. |
| `testing/phase3-lore-article-manual-test.md` | The owner's manual pass over entry articles: writing, two tabs, unsaved text, history, search, Trash, phone, dark and backup, in fourteen steps. |
| `deployment/azure-dev.md` | The DEV runbook: topology, setup, deploy, limitations, troubleshooting. |
| `deployment/cloudflare-r2.md` | The R2 runbook: bucket, token, config keys, the SDK upload flags R2 needs, and what a backup does not hold. |
| `architecture/decisions/README.md` | One-line index of every ADR. |
| `architecture/decisions/` | ADRs; one small file per durable decision. |
