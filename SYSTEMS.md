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
| `Data/DatabaseFailures.cs` | Whether a `DbUpdateException` was the constraint an endpoint refuses on, or an unrelated database failure. |
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
| `Features/Universes/UniverseEndpoints.cs` | Owner-scoped CRUD, search, paging, archive; a delete that releases the universe's ideas first, in one transaction; the name rule a restore shares. |
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
| `Features/Lore/EntityEndpoints.cs` | Entity CRUD, search, filters, paging, tags; an entry write that still carries the article refused whole. |
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
| `Features/Lore/EntitySearchIndex.cs` | The lore FTS5 index: reindex (excerpt markers written as spaces), backfill, the scored query, a result page's article excerpts, how typed words become an expression; and for the universe search, the field-aware match, field excerpts and the shared snippet and column-filter rules. |
| `Features/Lore/EntitySearchBackfill.cs` | Indexes entries that have no index row, once, at startup. |
| `Features/Lore/LoreValidation.cs` | Shared lore input checks. |
| `Features/Relationships/RelationshipModel.cs` | `RelationshipType` with its Canon constraints and its family meaning, `RelationshipAgeOrder`, `RelationshipFamilySemantic`, and `LoreRelationship`. |
| `Features/Relationships/RelationshipConfiguration.cs` | Relationship schema: keys, indexes, delete behaviour. |
| `Features/Relationships/RelationshipTypeEndpoints.cs` | Relationship-type CRUD; delete refused while in use. |
| `Features/Relationships/RelationshipEndpoints.cs` | Relationship CRUD and the per-entity, perspective-resolved list; the exact-duplicate refusal - same kind, same two ends, same way round, or either way round for a symmetric kind - as 409 `relationship_already_exists`, on creates and edits alike, and why no unique index. |
| `Features/Relationships/RelationshipContracts.cs` | Request and response records for relationships. |
| `Features/Relationships/RelationshipValidation.cs` | Relationship and Canon constraint input checks, UTC coercion, perspective labels. |
| `Features/FamilyTrees/FamilyTreeContracts.cs` | What one family tree answers: its nodes, its parent links, each relative with the paths that make it one, and the circles it found. |
| `Features/FamilyTrees/FamilyTreeDerivation.cs` | Family positions derived from parent links by id alone - parents, grandparents, siblings, children, grandchildren - and the circles among them, found without recursion; links saying the same thing collapse first, so a duplicate an older database holds is drawn once and deletes nothing. |
| `Features/FamilyTrees/FamilyTreeEndpoints.cs` | `GET .../family-tree/{entityId}`: ownership and a live focal entry first, then the bounded walk in at most five queries. Writes nothing. |
| `Features/Timeline/TimelineModel.cs` | `TimelineEntry`, its participation link, date kind and precision, and its optional validation details. |
| `Features/Timeline/TimelineConfiguration.cs` | Timeline schema: keys, the chronological index, delete behaviour. |
| `Features/Timeline/TimelineEndpoints.cs` | Timeline CRUD and the chronological, filtered, paged listing; a moment's validation details kept, replaced or removed with its save. |
| `Features/Timeline/TimelineContracts.cs` | Request and response records for the timeline, validation details included. |
| `Features/Timeline/TimelineValidation.cs` | Date-kind rules, component checks, and years written in the universe's reckoning. No calendar engine. |
| `Features/CanonIntegrity/CanonIntegrityModel.cs` | `CanonConflict`, its subject rows, severity, status and subject kind. |
| `Features/CanonIntegrity/CanonIntegrityConfiguration.cs` | Conflict schema: the unique fingerprint index and the review index. |
| `Features/CanonIntegrity/CanonIntegrityRule.cs` | `ICanonIntegrityRule`, the finding record with the ids its fingerprint hashes (and where they become a set), and the fingerprint hash. |
| `Features/CanonIntegrity/CanonIntegrityEvaluator.cs` | Runs the rules over one universe and reconciles by fingerprint. |
| `Features/CanonIntegrity/CanonPromotionGate.cs` | Refuses a write that introduces a new High fingerprint; `JoinedTransaction`. |
| `Features/CanonIntegrity/CanonIntegritySetup.cs` | The registered rule set, evaluator and promotion gate. |
| `Features/CanonIntegrity/CanonIntegrityEndpoints.cs` | List, get, evaluate, dismiss, reopen; subject-name resolution. |
| `Features/CanonIntegrity/CanonIntegrityContracts.cs` | Response records for conflicts and evaluation. |
| `Features/CanonIntegrity/CanonRuleText.cs` | Shared wording and length fitting for rule titles and explanations. |
| `Features/CanonIntegrity/Rules/` | The ten production rules: three structural, three chronological, two relationship constraints, one world rule check, one family circle. |
| `Features/CanonIntegrity/Rules/CanonFamilyLoopRule.cs` | `CANON-FAMILY-001`: Canon parent links that go round in a circle, one Medium finding per circle, fingerprinted over its links as a set. |
| `Features/CanonIntegrity/Rules/CanonWorldRuleOccurrenceRule.cs` | `CANON-WORLD-001`: a participant over a world rule check's limit, one Medium finding per rule and participant, fingerprinted over the counted moments as a set. |
| `Features/CanonIntegrity/Rules/CanonLifespan.cs` | Reads declared birth/death years and the moments comparable to them, placed as chronology points. |
| `Features/CanonIntegrity/Rules/CanonRelationshipAge.cs` | Reads Canon relationships whose type carries an age constraint, with both ends' birth years placed. |
| `Features/Stories/StoryModel.cs` | `Story`, `StoryStatus`, `Chapter` (optional grouping, no stored number), `Scene` (chapter or Unchaptered, order in it, point of view, chronology) and `SceneEntityLink`; the Trash marker on the first three. Narrative, not lore. |
| `Features/Stories/StoryConfiguration.cs` | Story schema: the chapter order and the two per-container scene orders, unique among live rows; the foreign-key indexes beside them; the delete actions of each reference; and `StoryLimits` - the manuscript's bound among them. |
| `Features/Stories/StoryContracts.cs` | Request and response records for stories, chapters, scenes, lore references, both orders and a scene's position. |
| `Features/Stories/StoryValidation.cs` | Story, chapter, scene, arc, beat and manuscript input checks. Structural only; nothing compares a scene or a beat with the lore or with another, and nothing reads prose. |
| `Features/Stories/StoryOrder.cs` | The per-container live scene query, and park-then-place for both orders, across two containers at once. |
| `Features/Stories/StoryLoreReferences.cs` | The one lore-reference projection scenes and beats share: loading the entries named, and listing them by name. |
| `Features/Stories/StoryEndpoints.cs` | Story CRUD, owner-scoped, ungated, live stories only; the delete that moves a story to the Trash; the story read with its live chapters and scenes, in a fixed number of queries. |
| `Features/Stories/ChapterEndpoints.cs` | Chapter CRUD, append, the whole-order reorder, and the delete that moves a chapter's scenes to Unchaptered first and the chapter, holding none, to the Trash. |
| `Features/Stories/SceneEndpoints.cs` | Scene CRUD, append and gap-closing per container, the one-container reorder, the position move, the edit that moves, the delete that moves a scene to the Trash, reference checks including the Trash, and the batched read in reading order. |
| `Features/Stories/PlotModel.cs` | `PlotArc` (story-owned), `PlotBeat` (arc-owned), both with the Trash marker, and the `PlotBeatScene` and `PlotBeatEntity` references. Planning, not structure and not lore. |
| `Features/Stories/PlotConfiguration.cs` | Plot schema: the arc and beat orders unique among live rows, the foreign-key indexes beside them, the pair keys, and why every link cascades from both sides. |
| `Features/Stories/PlotContracts.cs` | Request and response records for arcs, beats and both orders. |
| `Features/Stories/PlotOrder.cs` | Park-then-place for arc order and beat order, across two arcs at once for a move. |
| `Features/Stories/PlotArcEndpoints.cs` | Arc CRUD, append, the whole-order reorder, the delete that moves an arc and its beats to the Trash and nothing else, and the plot read of live arcs and beats in a fixed number of queries. |
| `Features/Stories/PlotBeatEndpoints.cs` | Beat CRUD, append and gap-closing per arc, the one-arc reorder, the edit that moves between arcs, the delete that moves a beat to the Trash, same-story and same-universe link checks including the Trash, links to scenes in the Trash kept and hidden, and the batched beat read. |
| `Features/Stories/SceneManuscriptModel.cs` | `SceneManuscript`: one scene's plain prose, keyed by the scene, with no navigation back from `Scene`; `SceneManuscriptRevision` and its kind: every saved version. |
| `Features/Stories/SceneManuscriptConfiguration.cs` | Manuscript schema: the scene's id as key and foreign key, long text, deleted with the scene; its versions, numbered uniquely per scene, deleted with it too. |
| `Features/Stories/SceneManuscriptContracts.cs` | The manuscript request (text and the `updatedAt` it was written over) and response; the restore request, and a version's summary and detail. |
| `Features/Stories/SceneManuscriptEndpoints.cs` | Read and save one live scene's prose, owner-scoped; its saved versions listed, read and restored; the stale-save 409; nothing written for a save that changes nothing; the story's `UpdatedAt`. The only routes that carry prose. |
| `Features/Trash/TrashEndpoints.cs` | The Trash listing of every kind - entries, story content and world rules - newest first with where each was, and the gated entry restore; maps each kind's restore route. |
| `Features/Trash/StoryContentRestore.cs` | Restoring a story, chapter, scene, arc or beat: appended to its order, refused while its story or arc is in the Trash, owner-scoped through the universe. |
| `Features/Trash/TrashContracts.cs` | The Trash row, its kind and what it waits for, the page, and what a story-content restore answers. |
| `Features/Ideas/IdeaModel.cs` | `Idea`: an account-owned possibility with an optional universe, a title, a plain body and the Trash marker; `IdeaReferenceKind`; the five reference rows (entry, story, scene, arc, beat). Never lore. |
| `Features/Ideas/IdeaConfiguration.cs` | Idea schema: owner cascade, universe `SET NULL`, the account and universe list indexes, the reference keys cascading from both sides; `IdeaLimits`. |
| `Features/Ideas/IdeaContracts.cs` | The idea save (title, body, universe, references by kind and id, the `updatedAt` it was written over), list row with excerpt, page, detail and resolved reference. |
| `Features/Ideas/IdeaReferences.cs` | References read in one place: resolving them by name inside the idea's universe, a picker's live targets, the stored set and its replacement, and releasing a universe's ideas before it is deleted. |
| `Features/Ideas/IdeaEndpoints.cs` | Account-scoped list, filters, search and paging; create, read, whole save with the stale-save 409, delete to Recently deleted and restore; the reference checks - own universe, explicit kind, nothing newly chosen from the Trash; the picker route. No lore write anywhere. |
| `Features/WorldRules/WorldRuleModel.cs` | `WorldRule`: a universe-owned title and plain description with the Trash marker, and its optional check. Its words are never read for meaning. |
| `Features/WorldRules/WorldRuleConfiguration.cs` | Rule schema: the universe cascade, the (universe, Trash marker) index; `WorldRuleLimits`. |
| `Features/WorldRules/WorldRuleContracts.cs` | The rule save (title, description, the `updatedAt` it was written over, the check), the list row with its excerpt and `hasCheck`, the page and the detail with its check and check state. |
| `Features/WorldRules/WorldRuleEndpoints.cs` | Universe-scoped list by title, create, read, whole save with the stale-save 409 and nothing written for an unchanged save, delete into the Trash, and the restore the Trash maps. Canon reconciled only for a rule that has or gets a check; no lore, story or idea write. |
| `Features/RuleValidation/RuleValidationModel.cs` | `ValidationTerm` (an event kind or a method, by id), `WorldRuleValidation` (a rule's one check) and `TimelineEntryValidation` (a moment's details), with their kinds. |
| `Features/RuleValidation/RuleValidationConfiguration.cs` | Schema for the three: the universe cascade and unique normalized name per kind, the `NO ACTION` term references, the participant's `SET NULL`; `RuleValidationLimits`. |
| `Features/RuleValidation/RuleValidationContracts.cs` | Term requests and rows, a check's request and response, a moment's details, and a check's derived state: outcome, counts, uncounted moments and why. |
| `Features/RuleValidation/RuleValidationInput.cs` | Checking and applying a rule's check and a moment's details: every id resolved inside the universe by its kind, the same words for foreign and made-up ids, a trashed participant kept but never newly chosen. |
| `Features/RuleValidation/WorldRuleOccurrences.cs` | The count one check needs, for a universe or one rule, in two queries: explicit ids only, Canon only, what cannot be counted and why, over-limit participants; and the check state it reads as. |
| `Features/RuleValidation/ValidationTermEndpoints.cs` | `/validation-terms`: list with usage counts, create, rename (Canon reconciled for its wording) and delete refused while anything names the term. |
| `Features/Search/UniverseSearchContracts.cs` | The universe search's result kinds, where words were found, one result with its context and excerpt, and the response. |
| `Features/Search/UniverseSearchIndex.cs` | The FTS5 indexes for story planning text, manuscripts, ideas and world rules (kept in step by the migrations' triggers): the field-aware match per kind and the excerpts. The only file that queries them. |
| `Features/Search/UniverseSearchEndpoints.cs` | `GET .../search`: ownership first, one bounded query per kind over live content only, excerpts per index, and the merge by title, planning text and prose. |
| `Features/Profile/ProfileImageModel.cs` | `ProfileImage`: the one photo an account may have, keyed by the account. |
| `Features/Profile/ProfileImageConfiguration.cs` | Profile photo schema: the user's id as both key and foreign key. |
| `Features/Profile/ProfileImageKeys.cs` | The `users/{userId}/profile/...` object-key convention, and the guard on the one segment Lorex did not mint. |
| `Features/Profile/ProfileImageEndpoints.cs` | Read, set, reframe and remove the account's photo; ownership from the session alone; storage failures as 503. |
| `Features/Profile/ProfileContracts.cs` | Response and request records for the profile photo. |
| `Features/Export/UniverseBackup.cs` | The backup format, as records. The contract the restore reads. |
| `Features/Export/UniverseBackupArchive.cs` | Archive layout, the media list, and the deterministic ZIP writer. |
| `Features/Export/UniverseBackupBuilder.cs` | Reads one universe and its media in a single transaction, and orders every collection. |
| `Features/Export/UniverseExportEndpoints.cs` | The export route, the download filename, and the one failure a backup can have. |
| `Features/Restore/BackupRestoreEndpoints.cs` | `PUT /api/backups/validate` (the raw archive streamed to staging, validated, a preview and a token), `POST /api/backups/restore` (token and name, validated again, restored), `DELETE` of a waiting upload; refusals as problem codes and issues; DI registration. |
| `Features/Restore/BackupRestoreContracts.cs` | The preview, its server-counted totals, the validation answer and the restore request. |
| `Features/Restore/BackupRestoreLimits.cs` | Every bound on an upload: file, decompressed, document, picture, entries, rows, JSON depth, staging lifetime and budget. |
| `Features/Restore/BackupIssues.cs` | A refusal's kind, its stable codes, the one exception reading throws, and the capped list of problems. |
| `Features/Restore/BackupArchiveReader.cs` | Opening an upload as hostile input: ZIP or version 1-2 JSON by its bytes, the end record counted first, safe names, no links or doubles, bounded exact-size reads, the envelope's version before the payload; the supported version range. |
| `Features/Restore/BackupValidation.cs` | Structural validation of a parsed backup - ids, references in the file, enums, column bounds, unique indexes, orders, article documents, pictures decoded by the upload gate - with no write. |
| `Features/Restore/BackupNormalization.cs` | Reading a payload as its version defines it, and normalizing versions 1-12 into the current shape as each migration did. |
| `Features/Restore/BackupRestoreStaging.cs` | Validated uploads waiting for their restore: random tokens, one per account, a shared budget, expiry, cleanup. |
| `Features/Restore/UniverseRestore.cs` | The new ids for everything in a backup, and writing it as a new universe: pictures first under new keys, then one transaction of rows, the lore index, Canon with dismissals re-applied; sweeping on failure. |
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
| `src/App.tsx` | Routes and providers, held by a data router with one catch-all route so history moves can be guarded. Every page route is a `lazy` import behind its own keyed `Suspense`; a story's three views and an entry's three views share one key each, so moving between them keeps the page. |
| `src/styles.css` | Design tokens (the contract's section 9.3 sheet: surfaces, ink, lines, washes, shadows, radii, type and space scales, control heights, motion, layers, gutters), then the shared patterns, then each screen, the narrow-screen and touch layers. |
| `src/lib/api.ts` | Same-origin fetch wrapper and `ApiError`. |
| `src/lib/imageCrop.ts` | The crop shape, the accepted formats and the size ceiling, shared by both pictures. |
| `src/lib/upload.ts` | The one `XMLHttpRequest` in Lorex: an upload - a picture's form or a backup file - that reports byte progress, failing as the same `ApiError`. |
| `src/lib/leaveGuard.ts` | `useLeaveGuard`: asks before unsaved work is left by a same-origin link or by leaving the page, and runs the editor's `onLeave` when the author chooses to leave; `confirmLeaving` for Sign out; `HistoryLeaveGuard`, the one router blocker, for the browser's Back and Forward. |
| `src/lib/localDrafts.ts` | Recovery copies of unsaved writing in the browser's IndexedDB: keyed by account, universe (or none, for an idea), kind and id; one ordered queue per copy; every failure a rejected promise. Never sent anywhere. |
| `src/lib/useLocalDraft.ts` | One editor's recovery copy: the copy found on opening (bounded wait), kept after typing pauses and on hide or unmount, forgotten once the writing is saved again, discarded by choice; `sameSave`. |
| `src/lib/returnFocus.ts` | `useReturnFocus`: hands the focus back to whatever opened a story drawer once it closes. |
| `src/auth/` | Session context, `useAuth`, and the route guards. |
| `src/universes/` | Universe API client and types, and `sections.ts`: a universe's sections, grouped, with their icons and one-line purposes - the sidebar, the phone sheet and the Overview's contents all read it. |
| `src/profile/` | Profile photo API client and DTO types, the address of one stored variant, and the provider every avatar reads so they cannot disagree. |
| `src/lore/` | Lore API client, shared types, document and field helpers, the revision client, the article client and its bound (`article.ts`), the image client that composes an asset's URL, and `typeIcons.ts` (the built-in type icon keys and their glyphs). |
| `src/export/` | Backup download: the request, the server's filename, and handing the archive to the browser. |
| `src/backups/` | Backup restore API client and types: the upload to validate, the restore, discarding a waiting upload, the file ceiling, and reading a refusal's issues. |
| `src/search/` | Universe search API client and DTO types: what is sent for what was typed, each kind's and field's words, where a result opens and how its place reads. |
| `src/ideas/` | Ideas API client and DTO types: the list, the whole save, delete and restore, the reference picker's targets, every universe the account owns, where a reference opens and how its place reads, the kind labels and the bounds. |
| `src/worldRules/` | World rules API client and DTO types: the list, create, whole save, delete into the Trash, the stale-save code and the bounds. |
| `src/ruleValidation/` | World rule checks: event kind and method API client, types and bounds, a rule's check and check state, a moment's details, the draft a rule's check is edited as (`checkDraft.ts`), and the hook a form reads the terms through. |
| `src/trash/` | Trash API client and DTO types: every kind, its label, what a row waits for, each kind's restore route, and where a restored row lives. |
| `src/relationships/` | Relationship API client, DTO types, the family meanings a kind may carry and their wording, and the both-readings helper. |
| `src/familyTree/` | Family tree API client and DTO types, the positions a relative may hold, and `reading.ts`: the words a derived path is shown in, and one link as a sentence. |
| `src/chronology/` | Chronology API client and types, and `format.ts`: the one formatter every date on screen is written through. |
| `src/stories/` | Story, chapter, scene, plot, manuscript and manuscript history API client, DTO types and the manuscript bound, the scene date, count, chapter and arc labels (`format.ts`), and a container's scenes, the story's reading order and which beats point at each scene (`structure.ts`). |
| `src/timeline/` | Timeline API client, DTO types, date stamps and year grouping on top of the chronology formatter. |
| `src/canon/` | Canon Integrity API client, DTO types, and the reader for the promotion gate's 409. |
| `src/lib/dates.ts` | Timestamp formatting, date-input round trips, and spans. |
| `src/components/` | `AuthLayout`, `Wordmark` (the drawn "Lore X", spoken "Lorex"), `Field`, `UniverseCard`, `UniverseForm`, `EntityCard` (with a search result's article excerpt), `NameList` (names an author wrote, listed inside a sentence of Lorex's own - "also known as …" - each in its own `<bdi>`; and `Quoted`, one such name in “…”), `ContainerName` ("Chapter 3 — …" or "Unchaptered", the title isolated), `EntityArticle` (an entry's article at `#article`: reading, writing with Save and Ctrl+S, the stale-save choice, the leave guard, the recovered draft offer, and its own history), `UniverseSearch` (the universe's persistent search bar: a combobox listing results as they are typed, the keyboard, only the current query's answer, and the leave question before a result is opened), `RecoveredDraft` (the offer of a recovery copy: when it was kept, whether the text was saved since, show, recover, discard), `EntityPortrait` (the card's picture, or its monogram), `EntityImageField` (pick, frame, replace, edit thumbnail, remove), `ImageCropDialog` (the cropper, and `CroppedPicture` for unsaved previews), `BrandMark` (the Lorex symbol, decorative, beside the wordmark), `Avatar` (the account's photo or its monogram, wherever one is drawn), `AccountMenu` (the one account dropdown: the rail's and the header's, on `ActionMenu`), `ActionMenu` (the one menu behaviour: a disclosure of links and buttons, arrows, Home, End, Escape back to the trigger, a press or Tab outside closes; an ellipsis `.iconbutton` unless given a trigger), `PageHeader` (a screen's crumb, its one `h1`, lede, actions and a local-nav slot - structure only), `StatusBadge` (a status as a drawn glyph and its word: Idea/Draft/Canon, Planning/Drafting/Complete), `EmptyState` (a line, a hint, one action), `SkipLink` ("Skip to main content", once, above the routes; `MAIN_CONTENT_ID` is every layout's `main`), `ProfileAvatar` (the Profile screen's circle, and upload, reframe, replace and remove), `TypeIcon`, `TypeIconPicker`, `TypeFilterBar` (the Lore browser's type chips), `ActionIcon` (the decorative icon beside an action's label), `FieldInputs`, `TokenInput`, `LoreEditor`, `EntityPicker` (single and multi, one shared search), `EntityHistory`, `RelationshipSection`, `RelationshipTypeManager` (a kind's wording, its Canon constraints and its family meaning), `FamilyTreeView` (a family drawn as generations, with its lines measured from the cards and every connection written out in words beside them), `FamilyLinkForm` (one family connection added from the tree, written as an ordinary relationship), `TimelineEntryForm` (with its folded validation details), `ValidationTermSelect` (one event kind or method chosen by id, or added in place), `ValidationTermManager` (the Types screen's event kinds and methods: usage, rename, delete when unused), `WorldRuleCheckSection` (a rule's optional timeline check and, in words, what the saved check finds), `ChronologyPointFields` (the one era, year, month and day row, shared by the timeline and scene forms), `StoryForm`, `ChapterForm`, `ChapterSection` (a chapter's heading, summary, tools and scenes), `SceneForm` (with its Chapter field), `SceneCard` (a scene, Write, its lore and Plot rows, Move up/down and the Move to… disclosure), `SceneContext` (a scene's date, point of view, lore and beats, drawn the same on its card and on its manuscript page), `LoreReference` (a lore chip or point-of-view portrait, on a scene or a beat), `PlotPanel` (a story's Plot view: arcs, beats, reorder, delete), `PlotArcSection`, `PlotBeatItem` (a beat, its scene and lore chips, Move up/down), `PlotArcForm`, `PlotBeatForm` (with its Arc field), `SceneReferencePicker` (a story's scenes by chapter, filtered, as checkboxes), `ManuscriptPanel` (a story's Manuscript view: the outline, and the open scene), `ManuscriptEditor` (one scene's prose: plain text, Save and Ctrl+S, the stale-save choice, the leave guard, the recovered draft offer, and the scene's planning beside it with Edit scene, Show in Scenes and Manuscript history), `ManuscriptHistory` (a scene's saved versions: newest first, viewed in place, restored when nothing is unsaved), `ChronologySettings` (name, order and turn a universe's eras, with a preview), `ConflictEntry` (a finding, linking its entry, rule and moments), `CanonBlockNotice` (the one refused-write presentation, shared by every gated form), `IdeasBrowser` (a list of ideas, global or one universe's: filters in the address, Recently deleted and Restore), `IdeaEditor` (one idea, new or saved: title, plain body, universe, references, Save and Ctrl+S, the stale-save choice, the leave guard, the recovered draft offer, Delete; inside a universe it opens only that universe's ideas), `IdeaReferencePicker` (the drawer that offers one kind of live content of the idea's universe), `WorldRuleEditor` (one world rule, new or saved: title, plain description, its optional check, Save and Ctrl+S, the stale-save choice, the leave guard, Delete into the Trash; no recovery copy), `RestoreBackup` (restoring a backup as a new universe: the file, upload and checking progress, the refusal with its problems, the preview and the name, restoring). |
| `src/pages/` | Login, Register, Universes browser (with Restore backup), Profile, Ideas and an idea (globally in the account frame, and inside a universe), and the workspace: Overview, Lore, entry page, Family Tree (one entry's family, the entry in focus in the address), Timeline (a moment's editor opened by `?moment=`), World Rules and a rule, Stories, a story (its Scenes, Plot and Manuscript views, one header, one page per story), Canon, Types, Trash and Settings. `UniverseWorkspace` also owns the collapsing narrow-screen navigation and the search bar above every screen of a universe; an entry page has three views under one header - Article at the entry's own address, Relations at `/relations` and History at `/history` - and its article lands on `#article`. |
| Visual system | `docs/design/LOREX_VISUAL_REFACTOR.md` is the contract. **Ink fill means act; accent wash means here**: a filled `.button` is an action and never marks where you are; a current section or view (routed, `aria-current`) or a chosen value (`aria-pressed`) takes the accent wash or the accent rule. Buttons are classes on native `<button>` and `<a>` - `.button` (primary), `.button--secondary` (`.button--quiet` its denser alias until Task 007), `.button--text`, `.button--danger`, `.iconbutton` - never a React component; a link dressed as one is never underlined. Routed views of one object are `.views` links (NavLink, `aria-current`), not tabs; a choice on the page is `.segmented` (`aria-pressed`). Every screen's title is its one `h1` - through `PageHeader` where the screen has moved to it. What can be opened sits on `--raised` and rises lighter in both schemes; controls are bounded by `--border-control` (3:1). No Card, Surface, Button or Tabs component: `.listrow`, `.callout`, `.actionbar`, `.skeleton`, `.cardgrid` are CSS patterns. |
| Authored text direction | Whatever an author titled or named is isolated in a `<bdi>` inside the element that lays it out: it reads in its own direction - Arabic, Hebrew, mixed - and Lorex's left-to-right layout around it does not move. `dir="auto"` on the element only for a title or name field, and for an element that cuts its text with an ellipsis. Never a direction on a container, and never `text-align` in its place. A name inside a sentence of Lorex's own is a `<bdi>` too (`Quoted`, `ContainerName`), never the sentence given a direction. Prose an author wrote - a summary, description, notes, an excerpt - carries the `prose` class: `unicode-bidi: plaintext`, so each paragraph reads and aligns in its own direction; every `textarea` and the article's paragraphs and headings have it already. Pinned by `text-direction.spec.ts`. |
| `vite.config.ts` | Dev server port 5173, proxy to the API, build config. |

## `tests`

| Path | Responsibility |
| --- | --- |
| `Lorex.Api.Tests/LorexApiFactory.cs` | Boots the real host over in-memory SQLite; a command fault hook, what it fails with, and a movable clock. |
| `Lorex.Api.Tests/DatabaseFailureTests.cs` | Which `DbUpdateException` is a constraint and which is not, and that a locked database never claims a name is taken. |
| `Lorex.Api.Tests/HealthEndpointTests.cs` | Backend test-infrastructure proof. |
| `Lorex.Api.Tests/HostStartupTests.cs` | Startup on a real file: migrations before queries, backfill, forwarded scheme. |
| `Lorex.Api.Tests/AuthEndpointTests.cs` | Registration, sign-in, session and logout. |
| `Lorex.Api.Tests/UniverseEndpointTests.cs` | Universe CRUD and the ownership invariant. |
| `Lorex.Api.Tests/LoreEndpointTests.cs` | Lore CRUD, field kinds, and cross-universe isolation. |
| `Lorex.Api.Tests/EntityRevisionTests.cs` | What makes a version, what a version keeps, ownership, and what a restore may do. |
| `Lorex.Api.Tests/RelationshipEndpointTests.cs` | Relationship CRUD, both perspectives, Canon constraint configuration, and cross-owner isolation. |
| `Lorex.Api.Tests/RelationshipDuplicateTests.cs` | What makes two links the same link and what keeps them different, on creates and edits; that a locked database is never reported as one; and that duplicates written before the rule are kept and drawn once. |
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
| `Lorex.Api.Tests/StoryBackupTests.cs` | Stories in the current backup: order, chapters and each scene's place in one, references, no copied lore, determinism, and version 5 and 4 files. |
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
| `Lorex.Api.Tests/SceneManuscriptRevisionTests.cs` | A manuscript's saved versions: one per changing save and none for a save that changes nothing, newest first with no text, read whole, restored as the newest, stale restores refused, ownership, the Trash, and no other read or search. |
| `Lorex.Api.Tests/StoryTrashTests.cs` | The Trash for story content: each kind out of every read and back whole, appended; a chapter holding no scene; content waiting for its story or arc; hidden beat links kept through saves; listing order and context; one universe and one owner; eras in use; search. |
| `Lorex.Api.Tests/ContentRecoveryBackupTests.cs` | Version 10: story content in the Trash marked and after the live rows, a manuscript's saved versions oldest first, a version 9 file, and no member for unsaved writing. |
| `Lorex.Api.Tests/ContentRecoveryMigrationTests.cs` | The content recovery migration over live and trashed story content on a file: the Trash discarded on rollback, prose becoming version 1, indexes and columns read back both ways, and a working upgraded file. |
| `Lorex.Api.Tests/StoryPhaseIntegrityTests.cs` | The Story phase as one product: the whole ownership graph taken apart delete by delete beside a second story, and a full story workflow changing no lore, relationship, timeline, revision, Canon finding or search result. |
| `Lorex.Api.Tests/StoryMigrationTests.cs` | The story migration down and back up over real lore on a file, with the delete actions read back from SQLite. |
| `Lorex.Api.Tests/ChapterMigrationTests.cs` | The chapter migration over real stories on a file: scenes Unchaptered in their order, both filtered indexes refusing a clash, and a rollback in reading order. |
| `Lorex.Api.Tests/TrashEndpointTests.cs` | What trashing hides, what it must not destroy, and what a restore may refuse. |
| `Lorex.Api.Tests/IdeaTestClient.cs` | The HTTP steps the idea tests share: create, save over a read idea, list, and deleting a universe. Not a test. |
| `Lorex.Api.Tests/IdeaEndpointTests.cs` | Ideas with and without a universe, read back exactly, the bounds, newest-first lists and their filters, search and excerpts, stale and unchanged saves, delete and restore, and a deleted universe's ideas kept unassigned. |
| `Lorex.Api.Tests/IdeaReferenceTests.cs` | Every kind of reference resolved by name, kinds never inferred, one universe only, no references without a universe, targets in the Trash kept and never newly chosen, the picker, another account refused alike everywhere, and no lore or story changed by anything an idea does. |
| `Lorex.Api.Tests/IdeaBackupTests.cs` | Version 11: a universe's ideas with references and deleted ones marked, no unassigned or other universe's idea, determinism, a released idea in no backup, and a version 10 file. |
| `Lorex.Api.Tests/RestoreTestClient.cs` | The steps the restore tests share: validate and restore over HTTP, a world of every kind a backup carries, a plain world every version could hold, rewriting a real archive, downgrading it to an older version, and describing a backup by meaning rather than ids. Not a test. |
| `Lorex.Api.Tests/BackupRoundTripTests.cs` | A rich world exported, validated, restored and exported again describes identically under ids it shares with nothing; the importer's version range held to the exporter's. |
| `Lorex.Api.Tests/BackupRestoreTests.cs` | A restore is always a new universe of the restoring account; twice is two; tokens per account; validation writes nothing; every reference inside the new universe; Trash, history, ideas, pictures, search and Canon; late database and picture failures leave nothing; names, spent, replaced, discarded and expired uploads; a double submit; an archived universe. |
| `Lorex.Api.Tests/BackupValidationTests.cs` | What validation refuses and how: not a backup, the bare document, newer and impossible versions, damage, duplicate ids, every dangling reference, unknown values, long text, unsafe articles, colours, tags, malformed history, orders, pictures, extra files, and the capped problem list. |
| `Lorex.Api.Tests/BackupArchiveSafetyTests.cs` | Hostile archives: escaping, absolute and odd paths, links, doubled entries, bombs, oversized pictures, too many entries, an oversized declared upload, and the safe-name rule. |
| `Lorex.Api.Tests/BackupVersionTests.cs` | Every format version 1-13 restoring with what it carried, a version 1 and 2 Trash, members newer than a file's version ignored, and pre-closed-set icons. |
| `Lorex.Api.Tests/IdeaMigrationTests.cs` | The ideas migration down and up on a file: nothing else changed, delete actions and indexes read back, and a universe row deleted outside the API leaving its idea unassigned. |
| `Lorex.Api.Tests/WorldRuleTestClient.cs` | The HTTP steps the world rule tests share: create, save over a read rule, read, list, delete and restore. Not a test. |
| `Lorex.Api.Tests/WorldRuleEndpointTests.cs` | World rules read and saved exactly, the list by title, unchanged and stale saves, the bounds in any script, another account, universe and guessed id refused alike, the Trash, a deleted universe, and no lore, story, timeline, idea or Canon change whatever a rule says. |
| `Lorex.Api.Tests/WorldRuleSearchTests.cs` | Rules in the universe search: by title and by description alone, the tiers, the Trash and restore, edits in step, universe and account boundaries, and the derived, cleaned index gone with its universe. |
| `Lorex.Api.Tests/WorldRuleBackupTests.cs` | Version 12: rules whole with the Trash marked, determinism, a restore under new ids with the Trash and search, twice is two, refused rule shapes, and a version 11 file holding no rules. |
| `Lorex.Api.Tests/WorldRuleMigrationTests.cs` | The world rules migration down and up on a file: nothing else changed, every search trigger read back, the cascade and index, search in step, and a universe row deleted outside the API taking its rules. |
| `Lorex.Api.Tests/RuleValidationTestClient.cs` | The HTTP steps the world rule check tests share: terms, checked rules, moments with details, findings, and a universe with one checked rule. Not a test. |
| `Lorex.Api.Tests/ValidationTermEndpointTests.cs` | Event kinds and methods: order, names unique per kind in any case and in any script, a rename that changes no match, deletes refused while anything names a term, and every boundary. |
| `Lorex.Api.Tests/WorldRuleValidationTests.cs` | A rule's check: words-only rules untouched, the pattern read back by id, limits and parts refused, kept, changed and removed, unchanged and stale saves, ownership, the Trash. |
| `Lorex.Api.Tests/TimelineValidationDetailsTests.cs` | A moment's details: optional part by part, kept or removed, never taken from linked entries, terms and participants of this universe only, a trashed participant kept but never newly chosen, the date and order untouched, ownership. |
| `Lorex.Api.Tests/CanonWorldRuleOccurrenceRuleTests.cs` | `CANON-WORLD-001`: the count through every case, what is never inferred, incomplete and impossible checks, the fingerprint as a set, dismissal, the lifecycle through edits, deletes and the Trash, no writes, no crossing a universe. |
| `Lorex.Api.Tests/RuleValidationBackupTests.cs` | Version 13: terms, checks and details by id and nothing derived; a restore remapping all of it with the same finding dismissed again; a version 12 file holding none; refused shapes. |
| `Lorex.Api.Tests/RuleValidationMigrationTests.cs` | The rule validation migration down and up on a file: three tables alone, every trigger read back, delete actions and the unique index, old rules words only, the upgraded file checking a rule, and a universe row taking everything with it. |
| `Lorex.Api.Tests/FamilyTreeTestClient.cs` | The HTTP steps the family tree tests share: kinds with and without a family meaning, parent links, trees and circles, and a tree described by name. Not a test. |
| `Lorex.Api.Tests/FamilySemanticTests.cs` | A kind's family meaning: none by default, given, changed and cleared, kept by a save that leaves it out, refused on a symmetric kind and for a value Lorex does not know, and never conferred by a name. |
| `Lorex.Api.Tests/FamilyTreeEndpointTests.cs` | The tree read: every position derived from parent links alone, any number of parents, the stored direction, one relative through two branches, generic links ignored, a meaning changed mid-flight, what one recorded parent does not claim, the two-generation bound, circles, the Trash, ownership, a fixed query count, and that a read writes nothing. |
| `Lorex.Api.Tests/CanonFamilyLoopRuleTests.cs` | `CANON-FAMILY-001`: circles of two and of three, adoptive links alike, a tangled family that is no circle, Canon-only, a meaning given and taken away, the Trash, dismissal, and one universe only. |
| `Lorex.Api.Tests/FamilyTreeBackupTests.cs` | Version 14: meanings written by name and nothing derived, a restore that keeps them and derives the same trees under new ids twice over, a version 13 file that acquires none, and refused shapes. |
| `Lorex.Api.Tests/FamilySemanticMigrationTests.cs` | The family meaning migration down and up on a file: kinds called parent, mother and father come back with none, triggers and indexes read back both ways, and the upgraded file deriving a tree. |
| `Lorex.Api.Tests/TestMediaObjectStore.cs` | The object store the test host runs against, and its three failure hooks. |
| `Lorex.Api.Tests/R2MediaObjectStoreTests.cs` | The R2 adapter alone: the upload flags on the request and on the wire, and SDK failures kept inside. |
| `Lorex.Api.Tests/EntityImageTests.cs` | What is stored, how a thumbnail is framed and reframed, who may touch it, and what a replace, reframe or remove leaves behind. |
| `Lorex.Api.Tests/ProfileImageTests.cs` | The account's photo: what is stored, who may touch it, what a replace, reframe or remove leaves behind, and what a backup must never hold. |
| `Lorex.Api.Tests/UniverseSearchTests.cs` | The universe search: ownership and universe boundaries, every kind by every field, live content only through the Trash, unassigned and other universes' ideas, anything typed, bounded results and excerpts, the tiered order, a fixed query count, the indexes derived, in step and rolled back, and the backup unchanged. |
| `Lorex.Api.Tests/UniverseSearchMigrationTests.cs` | The search migration down and up on a file: the indexes filled from what was written, every trigger read back by name, the lore marker rows rewritten by the backfill, and the upgraded file in step. |
| `Lorex.Api.Tests/EntitySearchTests.cs` | What full text finds, what it must never find, what keeps the index in step, and the article excerpt a result carries. |
| `Lorex.Api.Tests/ArticleTestClient.cs` | The HTTP steps the article tests share, and a sample of a real article document. Not a test. |
| `Lorex.Api.Tests/EntityArticleEndpointTests.cs` | An article read and saved exactly, empty and cleared, the bound, refused documents, stale saves, ownership and foreign ids, independence from structured edits and entry restores, entry writes still carrying the article refused whole, versions from before, its own history and restore, the Trash, universe deletion, and no article in any other payload. |
| `Lorex.Api.Tests/EntityArticleBackupTests.cs` | Articles in a version 9 backup: exact, with every version, cleared and trashed ones, no copy on entry revisions, determinism, and a version 8 file. |
| `Lorex.Api.Tests/EntityArticleMigrationTests.cs` | The article migration over lore on a file: articles moved exactly with a first version, the column dropped without a rebuild, foreign keys and the search trigger intact, versions from before still readable, and a rollback with articles. |
| `Lorex.E2E/playwright.config.ts` | Starts API + web, runs Chromium. `LOREX_E2E_DB` gives the run a database of its own; `LOREX_E2E_WORKERS` overrides the worker count. |
| `Lorex.E2E/README.md` | How to run the suite, and what was measured about the two knobs. |
| `Lorex.E2E/specs/smoke.spec.ts` | Frontend-loads smoke suite. |
| `Lorex.E2E/specs/auth.spec.ts` | Register, sign out, guard, sign back in. |
| `Lorex.E2E/specs/shell.spec.ts` | The frame every screen sits in: the skip link first in the tab order and landing on `main`, the sections as a navigation landmark with one current section and one `h1` per screen, the Overview's doorways, a menu worked by arrows, Home, End, Escape and Tab out, and the phone's section sheet reading down its columns with 44px rows. |
| `Lorex.E2E/specs/universes.spec.ts` | Create, edit, search, archive, paginate, ownership. |
| `Lorex.E2E/specs/lore.spec.ts` | Author an entry, edit it, filter, and cross-owner isolation. |
| `Lorex.E2E/specs/lore-article.spec.ts` | An entry's article written, saved by button and keyboard, kept through reloads and structured edits, found by search with an excerpt, and restored from its history; asking before unsaved text is left, including Sign out and the browser's Back and Forward, once per action; failed, stale and orphaned saves; 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/entry-views.spec.ts` | An entry's header and its three addresses: every action on the entry on screen unscrolled above a long article, Article the default, Relations and History reloadable and reachable by Back, Forward and a typed link, nothing shown on two views at once, Edit opening the form on the Article view, one leave question per departure, no empty column without a picture, a search result and a family tree landing on the article, and the duplicate relation refused from Relations and from the tree. |
| `Lorex.E2E/specs/text-direction.spec.ts` | Titles and names in Arabic, Hebrew and mixed with Latin, numbers and brackets, each in its own direction while everything of Lorex stays left to right: an entry's header on all three views, its card, aliases, relations, history and search result; a story, its chapters, scenes, arcs, beats, chips and manuscript; universes, the Trash, the timeline, the Types screen, world rules, ideas and the family tree; long titles wrapping at 390px with the bars in order and nothing scrolling sideways; a title field typed right to left, its caret, its save and its unchanged validation. |
| `Lorex.E2E/specs/relationships.spec.ts` | Both readings, relation kinds, refusals, and the universe and owner boundaries. |
| `Lorex.E2E/specs/relationship-constraints.spec.ts` | A kind's Canon constraints: configured, broken, reported, corrected, edited and cleared; the editor from 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/family-tree.spec.ts` | A kind given a family meaning on the Types screen and taken away again; parents, grandparents, siblings, children and grandchildren derived; a node taking the focus, Back, a reload and the entry page; a connection added from the tree; a circle named; a Draft connection; 390px to 1920px, light and dark, with long and right-to-left names; and a restored backup deriving the same family. |
| `Lorex.E2E/specs/timeline.spec.ts` | Date kinds through the drawer, order, filters, paging, refusals, and the owner boundary. |
| `Lorex.E2E/specs/chronology.spec.ts` | Eras named and ordered in Settings, a timeline across them, a relabel, a birth year in an era, and the screens from 390px to 1920px. |
| `Lorex.E2E/specs/stories.spec.ts` | A story told out of chronological order and kept that way; chapters created, reordered and deleted with scenes moved between them and none lost; reorder and Move to… by keyboard; a trashed reference; the screens from 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/plot.spec.ts` | A plot planned across chapters: arcs and beats created and reordered, scenes and lore linked, a scene moved and still linked, both ways between a beat and its scene, deletes that keep every scene and entry; empty states; keyboard reorder; 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/manuscript.spec.ts` | Prose written scene by scene and kept through reloads, moves, reorders and a chapter delete, gone with its scene; asking before unsaved prose is left; failed, stale and over-long saves; empty and foreign scenes; planning beside the prose; 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/story-workspace.spec.ts` | The Story workspace as one product: a new story leading to a scene, one header, one read and an address per view, Write and Show in Scenes, deep links that land focused and marked, unsaved prose kept through links and Sign out, drawers returning focus, and the work on the first screen from 390px to 1920px. |
| `Lorex.E2E/specs/history.spec.ts` | One journey: versions accumulate, an old one is read in place and put back. |
| `Lorex.E2E/specs/content-recovery.spec.ts` | Recovered drafts for articles and manuscripts through dead tabs, failed and refused saves, discard and leaving by choice, never in the API or a backup, never another account's; a manuscript's saved versions read, restored and refused when stale; a scene and a story through the Trash; 390px and 1440px, dark and light. |
| `Lorex.E2E/specs/ideas.spec.ts` | Ideas globally and in a universe: created, edited, filtered, given a universe and references by pointer and keyboard, opened through them; recovered drafts through dead tabs, failed and refused saves, never another account's; Recently deleted and restore; a deleted universe's ideas kept; asking once before unsaved writing is left; 390px and 1440px, light and dark. |
| `Lorex.E2E/specs/universe-search.spec.ts` | The universe search bar: on every universe screen and none outside one, every kind found and opened where it lives, the keyboard, only the current answer, failure and retry, the Trash, the leave question before unsaved writing, and 390px to 1920px, light and dark. |
| `Lorex.E2E/specs/world-rules.spec.ts` | World Rules: empty, created, refused without a title, edited by button and keyboard, kept at its address; stale saves; asking once before unsaved changes are left; the Trash and restore; found by the search bar by title and description; 390px and 1440px, dark and light, long and right-to-left words. |
| `Lorex.E2E/specs/rule-validation.spec.ts` | World rule checks: a check set part by part with terms added in place, refused, kept and removed; Canon finding a participant over the limit on the save, linking rule, entry and moments, and following a moment's method; a check that cannot count everything naming each moment; an ordinary moment untouched and the Types screen's vocabulary; 390px and 1440px, dark and light, long and right-to-left names. |
| `Lorex.E2E/specs/export.spec.ts` | One journey: the click produces a real archive on disk, named and readable. |
| `Lorex.E2E/specs/restore.spec.ts` | A real exported backup checked, previewed, named and restored as a new universe that opens with its article, picture, prose, plot, idea, Trash and search; the same file again beside an untouched original; refusals that create nothing; the flow on a phone, dark, by keyboard, with a right-to-left name. |
| `Lorex.E2E/specs/support/account.ts` | Opening the account menu and signing out through it, wherever it is on screen. Not a spec. |
| `Lorex.E2E/specs/support/png.ts` | Builds a real PNG, pixel by pixel, with an optional EXIF orientation. Not a spec. |
| `Lorex.E2E/specs/support/pixels.ts` | Reads colours back out of a displayed picture, and checks a crop square sits wholly on it. Not a spec. |
| `Lorex.E2E/specs/support/zip.ts` | Reads a downloaded archive's table of contents, and one entry's text. Not a spec. |
| `Lorex.E2E/specs/trash.spec.ts` | One journey: an entry and its connection leave together and one restore returns both. Story content: `content-recovery.spec.ts`. |
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
| `design/LOREX_VISUAL_REFACTOR.md` | The visual design contract for the refactor (Tasks 002-007): audit findings, principles, tokens, components, cards, actions, responsive and accessibility rules, and the task plan. |
| `testing/phase2-story-manual-test.md` | The owner's manual Phase 2 Story pass: one writing session from an empty story to a backup, in eighteen steps. |
| `testing/phase3-lore-article-manual-test.md` | The owner's manual pass over entry articles: writing, two tabs, unsaved text, history, search, Trash, phone, dark and backup, in fourteen steps. |
| `testing/phase3-ideas-manual-test.md` | The owner's manual pass over Ideas: global and universe ideas, references, two tabs, recovered drafts, two accounts, delete and restore, a deleted universe, backup, phone and dark. |
| `testing/phase3-universe-search-manual-test.md` | The owner's manual pass over the universe search bar: every screen, every kind opened, the keyboard, anything typed, one universe only, unsaved writing, the Trash, two accounts, phone and dark, and the backup. |
| `testing/phase3-backup-restore-manual-test.md` | The owner's manual pass over restoring a backup: where it lives, checking and the preview, the name, what comes back in lore, story, recovery, ideas, search and Canon, another account, refusals, the same file twice, phone and dark. |
| `testing/phase4-timeline-rule-validation-manual-test.md` | The owner's manual pass over world rule checks: a rule's check, an ordinary moment, matching moments and the Canon finding, a changed method, what cannot be counted, the Trash, Types, another account, backup and restore, phone and dark. |
| `testing/phase4-family-trees-manual-test.md` | The owner's manual pass over Family Trees: giving a kind a family meaning, the tree and what it derives, biological against adoptive, adding a connection, a name that means nothing, a circle, the Trash, another account, backup and restore, phone and dark. |
| `testing/phase4-world-rules-manual-test.md` | The owner's manual pass over World Rules: the section, creating and editing, two tabs, unsaved changes, words that sound like facts changing nothing, search, the Trash, another account, backup and restore, phone and dark. |
| `testing/phase3-content-recovery-manual-test.md` | The owner's manual pass over content recovery: recovered drafts, manuscript history, the Trash for story content, two accounts, phone and dark, and the backup. |
| `deployment/azure-dev.md` | The DEV runbook: topology, setup, deploy, limitations, troubleshooting. |
| `deployment/cloudflare-r2.md` | The R2 runbook: bucket, token, config keys, the SDK upload flags R2 needs, and what a backup does not hold. |
| `architecture/decisions/README.md` | One-line index of every ADR. |
| `architecture/decisions/` | ADRs; one small file per durable decision. |
