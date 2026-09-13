# STATE

Operational state only. Architecture: `docs/architecture/decisions/README.md`. Paths:
`SYSTEMS.md`. Tooling rules: `.claude/CLAUDE.md`. Trial history: `docs/tooling/agent-tooling-trial.md`.

## Roadmap position

- Phases 001-022 done and merged. Sequence log: `docs/architecture/branching.md`.
- **Phase 020** (Full-Text Search) merged into `dev`. Entity search reads the article an author
  wrote, not only the name, aliases and summary, and orders hits by relevance. Index shape,
  synchronization and query semantics: ADR 0016.
- **Phase 021** (PWA / Mobile Refinement) merged into `dev`. Lorex installs: a hand-written
  manifest, four icons, and a service worker that caches build output and refuses `/api`,
  non-`GET`, navigations and cross-origin outright - ADR 0017, which also says plainly that
  nothing works offline. Narrow-screen chrome folds into one sticky bar; desktop untouched.
- **Phase 022** (Azure DEV + CI/CD) merged into `dev`. The deployment-blocking startup bug is
  fixed, and DEV has a topology, workflows and a runbook. The owner has since created it.
  - The host no longer dies outside Development. `LorexDatabaseInitializer` migrates once per
    process in every environment, and the search-index backfill awaits it, so schema readiness is
    a dependency rather than an accident of registration order. ADR 0018.
  - DEV is **one Linux App Service** serving the API and the built client from one process, with
    SQLite and the Data Protection key ring on the site's persistent `/home` share.
  - `ci.yml` validates every pull request into `dev`; `deploy-dev.yml` calls it and then deploys,
    from `dev` only, over OIDC. No credential is stored in the repository.
  - Runbook, limitations and troubleshooting: `docs/deployment/azure-dev.md`.
- **The Lorex mark** (`feat/lorex-brand-icon`, merged into `dev`). The owner supplied the
  real icon - three interlocking red rings around a star - so the drawn stand-in is gone.
  `assets/brand/lorex-icon.png` is the one source, unaltered, and `scripts/render-icons.py` now
  resamples it into every shipped asset rather than reading geometry out of an SVG. The source has
  genuine transparency; the checkerboard a viewer shows is the viewer's.
  - **The icons keep the master's transparency** (`fix/transparent-app-icons`, **not merged, not
    pushed**). The first cut put every platform-facing asset on `--paper`, because 62% of the
    artwork is darker than luminance 40; in a dark tab strip that is a pale tile, which the owner
    saw straight away. Rendered against a browser's own tab greys, the transparent mark is
    legible at 16px anyway. The ground survives only where transparency is not a choice: the
    maskable icon, which a platform crops and fills, and the Apple touch icon, which iOS
    composites onto black. `CACHE_VERSION` is `v3`.
  - Paddings are per platform: the maskable icon keeps the mark inside the middle 62% so
    Android's circle cannot clip it, Apple gets 12%, the favicons 2-4%. `public/icon.svg` is
    deleted - tracing shaded artwork into vectors would be redrawing it - so the favicon is PNG
    at 48, 32 and 16.
  - **The rail keeps its `L`.** The symbol was tried there: at ~30px it reads as a red tangle and
    it puts the only saturated colour in the chrome above the universe accent seal. The mark is
    large on the auth plate and small beside the wordmark in the paper bars, decorative in both.
  - Same filenames, new bytes, and root static files are cached by path - hence the version
    bumps. ADR 0017 amendment.
- **Numbered implementation pauses after 022.** Current mode is **owner-led manual testing,
  stabilization and feature polish**, on unnumbered `<type>/<description>` branches.
  **Phase 023 - Production Hardening / PostgreSQL - remains deferred** and is not started; the
  next numbered phase resumes only when the owner says so.
- **Entry images** (`feat/entity-images-r2`, merged into `dev`). An entry may carry one picture:
  uploaded through the API, decoded and thumbnailed server-side, stored as two objects in one
  private Cloudflare R2 bucket, and served back only through an authenticated owner-scoped Lorex
  route. ADR 0019.
  - **Live-DEV fixes** (`fix/entity-image-r2-cropper`, merged into `dev`). R2 refused every
    upload (`STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented`): PutObject now sets
    `DisablePayloadSigning` and `DisableDefaultChecksumValidation`, pinned on the request and the
    wire by `R2MediaObjectStoreTests`; SDK failures are a 503 problem, never a raw exception. The
    thumbnail is now the square the author frames in a cropper (`react-easy-crop`); the browser
    sends fractions, the server cuts. "Edit thumbnail" reframes from the stored original and never
    touches it. The crop is persisted and exported as `image.crop`. ADR 0019 amendment, ADR 0014.
  - **Backup is an archive.** Format version 3: the download is `lorex-<slug>-<date>.zip`
    holding `backup.json` plus `media/entities/{entityId}/original.{ext}`. Originals only -
    thumbnails are derived and regenerated. No object key, bucket, endpoint or URL is in the
    file, so a backup does not depend on R2 surviving. A media object that cannot be read fails
    the export loudly rather than thinning it. ADR 0014.
  - **History records an image change; a restore does not put a picture back.** Superseded
    objects are still deleted, so nothing historical is retained and an old version has no bytes
    to restore. Setting, replacing and removing each write a version flagged `Image`, and the
    history screen states the limit. ADR 0013, ADR 0019.
- **Lore visual polish** (`feat/lore-visual-polish`, merged into `dev`). Two owner requests from
  live testing. The type bar's sideways scrolling caused a CI failure (`fix/type-filter-mobile-e2e`,
  merged) and is now replaced by wrapping rows (`fix/type-filter-wrap`, merged).
  - **"Fit full image" withdrawn** (`fix/thumbnail-crop-only`, merged). A
    thumbnail is one square crop again, always covered by the picture. Migration
    `RemoveEntityImageFramingMode` drops the column; a row that was fitted reads as the centred
    square, but its stored thumbnail stays letterboxed until its author uses "Edit thumbnail".
    A stale client's `framing` field and a v3 backup's `image.framing` are ignored. ADR 0019, 0014.
  - **The Lore type filter is a row of icon chips.** Data-driven from the universe's types,
    `aria-pressed`, wrapping onto as many rows as the width needs. A type's icon is the existing
    `EntityType.Icon` column, now a key from a closed set the API enforces, chosen on the Types
    screen and never inferred from a name. Starter types keep their seeded keys. New web
    dependency `lucide-react`. ADR 0020.
  - **Every workspace screen fills the content column** (`fix/lore-desktop-width`,
    `fix/lore-full-width-actions` and `fix/center-workspace-canvas` merged, then
    `fix/full-width-workspace`, **not merged, not pushed**). `.canvas` is its padding and nothing
    else: the 60rem cap, the centring that existed only for that cap, and the Lore-only
    `canvas--full` modifier with its route check are all gone. Readability is local where it
    matters - the article and editor surface at 62ch, a summary at 58ch, a settings section at
    34rem - so prose stays readable without a page-level wall. Common Lore and entry actions carry
    a decorative Lucide icon beside their unchanged label (`ActionIcon`, `.button--icon`).
- **Profile screen** (`feat/profile-page`, merged into `dev`). The signed-in account has a
  screen of its own at `/app/profile` - a user-level route beside the universe browser, not a
  section of a world - wearing the same bar. Under the circle are the username, the email, how many
  universes the account owns and the account id, and a line saying that is all Lorex keeps. The
  account is reached from the global chrome - see the account menu below.
  - **The circle holds a real photo.** `ProfileImages` is its own table keyed by the account, on
    the entry image's proven path: upload, frame a 1:1 square, edit that square from the stored
    original, replace, remove. Objects live at `users/{userId}/profile/{assetId}/...` - ids only,
    and deliberately not under `universes/`. Ownership is the session and nothing else: no route
    carries a user id, so another account's photo is not a request that can be made. No photo is
    still the monogram. ADR 0021.
  - **One upload gate now, for both pictures.** `EntityImageProcessing` moved to
    `Features/Media/ImagePreparation.cs` unchanged in behaviour, so the formats, the 8 MB ceiling,
    the orientation rule and the crop arithmetic cannot drift between a portrait and an avatar.
    `EntityImageCrop` stays as the lore wire and v3 backup shape and converts to `Media.ImageCrop`
    in a line. The same `ImageCropDialog` frames both.
  - **A universe backup still holds no account data.** Format version 3 is untouched: no `users/`
    entry, no account id, no asset id. Pinned by a test.
- **Account menu and upload progress** (`fix/profile-account-menu-progress`, **not merged, not
  pushed**). Four owner notes from live DEV.
  - **The account is global chrome, not a universe section.** Profile is gone from the beige
    sidebar; one `AccountMenu` - a circular avatar opening onto the username, the email, View
    profile and Sign out - sits at the foot of the black rail, and the same component replaced the
    loose username and Sign out button in the universes header. The rail's mark and accent seal
    stay a pair, so the avatar is bottom-anchored rather than tucked under the "L"; on a narrow
    screen the rail is the sticky bar and the same node lands at its right-hand end, so there is no
    second account UI on a phone. `/app/profile` is unchanged. ADR 0021.
  - **One avatar for every place that draws one.** `ProfileImageProvider` holds the signed-in
    account's photo and every write reports its result there, so the rail, the folded bar, the
    header and the Profile screen agree without a reload and without four reads of one row. Its own
    provider, not a field on the auth context: media, not identity.
  - **A save says which half of the wait it is in.** The browser's bytes are a determinate
    progress bar with a real `aria-valuenow`; the moment the last byte is out it becomes an
    indeterminate bar plus "Processing photo…", because 100% uploaded is not saved. A reframe
    sends no file and says "Updating photo…" with no percentage. The cropper goes `inert` while a
    save is in flight and a second press cannot start a second upload. This needed
    `XMLHttpRequest` - `fetch` cannot report upload progress - so `src/lib/upload.ts` is that one
    exception, behind a helper that fails as the same `ApiError`; `apiFetch` is untouched.
  - **Both object writes now overlap, and the body is not spooled to disk.** Measured first: the
    server's own work on a 4 MB phone photo is 190-310 ms locally, and the dominant cost is moving
    the original twice over the network. So the two R2 writes that had no order between them run
    together, the post-commit sweep does too, and the form reader no longer writes the body to a
    temporary file only for the handler to read it back. Every failure guarantee is unchanged and
    both interleavings are tested, as is the overlap itself. ADR 0019 amendment. **It does not make
    a slow uplink fast** - that is what the progress bar is for.
- **Universe chronology** (`feat/universe-chronology`, merged into `dev`). Owner-requested
  feature after Phase 1 stabilization; unnumbered because numbering is paused and `023` is reserved
  (branching.md). A universe may name ordered eras, and Timeline, declared birth/death years and the
  chronology rules share one comparison. ADR 0022.
  - `ChronologyEras` rows owned by the universe: name, short label, order, direction, label position.
    No eras is the plain reckoning, unchanged in every respect. Settings replaces the whole list in
    one gated `PUT`, with a preview; an era anything is dated in cannot be removed (409).
  - Inside an era a year is whole and counts from 1 - no year 0. Plain years keep 0 and negatives.
  - Timeline entries carry start/end era ids; a birth or death year carries its era as metadata on
    the Number. `ChronologyPoint` is the one comparison, and the listing's SQL order is held to it.
  - Years written before a universe named eras are never reinterpreted: listed apart as having no
    era yet, ignored by Canon, and given one on their next save.
  - Backup format version 4 carries the eras and every era reference. ADR 0014.
- **Relationship Canon constraints** (`feat/relationship-canon-constraints`, merged into `dev`).
  Owner-requested, unnumbered. A relation kind may say which end must be older and bound
  the gap between the two birth years; Canon Integrity checks Canon links against that. Nothing is
  inferred from a kind's name. ADR 0023.
  - Typed columns on `RelationshipTypes` - `AgeOrder`, `MinAgeDifferenceYears`,
    `MaxAgeDifferenceYears` - defaulting to no rule. The API's `canonConstraints` group, left out of
    an update, keeps what is stored. A symmetric kind may bound a gap but not name an older end; a
    minimum above the maximum is refused, never swapped.
  - `CANON-REL-002` (order) and `CANON-REL-003` (gap), both Medium, so nothing is refused: a breaking
    link, a breaking birth year and a rule existing links already break are all saved and reported on
    the write. Equal years, missing or unplaced years, non-Canon ends and unmeasurable gaps stand down.
  - The gap is `UniverseChronology.YearsBetween`: the signed difference inside one era or the plain
    reckoning, `a + b - 1` from a countdown era into the ascending era after it, unknown otherwise.
  - Edited inside the relation kind form on the Types screen. Backup stays version 4, additively.
- **Story & Scene foundation** (`feat/story-scene-foundation`, **not merged, not pushed**). The first
  Story-layer feature; owner-requested, unnumbered. Lore is what is true; a story is how an author tells
  something with it. ADR 0024.
  - Universe -> Story (title, premise, status `Planning|Drafting|Complete`) -> Scene (title, summary,
    notes, narrative `SortOrder`, optional point of view, optional position in the world, linked
    entries through `SceneEntityLinks`). Stories sit in the universe sidebar after Timeline.
  - **Narrative order is not chronology.** Order is contiguous and unique per story: appended on
    create, closed on delete, moved only by a whole-order `PUT .../scenes/order`. A scene's
    `ChronologyValue` (era, year, month, day) is shown on it and never orders, groups or refuses
    anything. The story page reorders with Move up / Move down; focus follows the scene.
  - References, not copies: names, types and portraits are read from the lore on every request, two
    queries per story. A trashed entry stays on its scene, marked, and cannot be newly chosen. An entry
    row deleted for good clears the point of view and drops the link; nothing deletes a scene.
  - No Canon finding, timeline entry, relationship, search hit or revision comes from a story. Deleting
    a story or scene is permanent. Year checks and the era row are now shared with the timeline
    (`ChronologyPointValidation`, `ChronologyPointFields`); an era a scene uses cannot be removed.
  - Backup format version 5 carries stories: a version 4 reader would drop them silently. ADR 0014.
  - The sidebar stays text-only: the Lucide icon asked for would have been the only one in it.

## Baseline

- **624 API integration tests, 93 Playwright tests**, green. No frontend unit runner exists;
  the web checks are `typecheck`, `lint`, `format:check` and `build`. The E2E project has no
  format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings, and
  Prettier has to be pointed at that config explicitly. CI runs all of it.
- The test host no longer migrates itself, so every API test boots through the same startup path a
  deployment uses.
- Under a full parallel Playwright run, `auth.spec.ts` "rejects a wrong password" intermittently
  times out (it navigates to `/login` without awaiting sign-out), and a relationships, canon or
  universes spec can time out once; each passes alone. Known, not fixed. The five profile tests
  added load, so it now shows on most full runs - a different `canon.spec.ts` test each time, with
  the whole file green on its own, in parallel and serially. Eight more tests arrived with the
  account menu, and a full run now usually loses one or two - a rotating pick of canon, type-filter,
  mobile, universes or account-menu, each green on its own. It is contention on the one SQLite
  writer, not the specs. The story run lost one account-menu, one canon and one type-filter test,
  each green alone.
- 21 migrations, latest `AddStories` - three new tables and nothing else, walked down and back up over
  real lore by `StoryMigrationTests`, which reads each delete action back from SQLite.
  `AddRelationshipTypeCanonConstraints` is three plain columns, walked down (a table rebuild) and back
  up by `RelationshipConstraintMigrationTests`.
  `AddUniverseChronology` creates `ChronologyEras` and adds era references,
  rebuilding `TimelineEntries` and `EntityFieldValues` as SQLite requires for a foreign key. Walked
  down and back up over real lore on a file by `ChronologyMigrationTests`; rolling back discards the
  eras. `RestrictEntityTypeIconKeys` is data only. `has-pending-model-changes` reports none. `AddEntitySearchIndex` is raw SQL - an FTS5 virtual
  table and the trigger that empties it - so no EF Core model describes it and the pending check
  cannot see it either way.
- No automated test reaches Cloudflare and none can: the API host registers an in-process object
  store, Playwright runs against `Media:Provider=InMemory`, and the R2 adapter tests answer the SDK
  from an in-process HTTP handler. That covers profile photos too - they use the same store.
- Eight rules in `src/Lorex.Api/Features/CanonIntegrity/Rules/`: three structural (Medium), three
  chronological (High), which compare across named eras, and two relationship constraints (Medium).
  Behaviour: ADR 0010, 0011, 0012, 0022, 0023.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev` and is
the GitHub default branch. `master` is reconciled and published; `dev` -> `master` merges happen
only when the owner asks.

## Tooling trial

Four tasks measured; the agreed number is complete and **the verdict is owed** - see Deferred.
RTK and Graphify judged independently. Nothing since Phase 022 was a trial task, and neither
tool has changed the picture.

- RTK: `rtk gain` 18.9%, drifting slightly down. The pattern is unchanged and now well evidenced:
  almost every command is compound, piped or a heredoc, which the wrapper bypasses by design, so
  only `git status`, `git diff` and a handful of `rtk grep` calls ever reach the filter. The one
  category that filters well - a passing `dotnet build`, 87% - is also the one whose output was
  never worth much. Correctness record still clean; no `rtk proxy` rerun has been needed, ever.
- Graphify: unused again. Targeted `Grep` and `Read` over `SYSTEMS.md`-named files answered every
  question, including for a feature that touched nine new files across two features.

## Deferred / owner decisions

- **Phase 023 - Production Hardening / PostgreSQL.** Deferred, not scheduled. It owns the
  production key store, a real database and backup story, and the search rewrite SQLite-only
  FTS5 forces (ADR 0016). ADR 0018 lists what the DEV topology deliberately does not solve.
- **Azure DEV and R2 are owner-created and live** - live DEV testing is what found the R2 upload
  bug. Nothing in this repository creates or changes either. Steps:
  `docs/deployment/azure-dev.md`, `docs/deployment/cloudflare-r2.md`.
- **Full security audit.** Relationships, timeline and Canon Integrity each had a focused check
  backed by tests. Outstanding: rate limiting, header/cookie hardening, dependency review, auth.
- **Era tooling.** Cross-era order is solved only for a universe that names its eras; free-text
  labels on the plain reckoning still order nothing and still stand the rules down. Years written
  before eras are given one entry by entry - no bulk assignment - and removing an era needs its
  dates moved first, with no reassignment tool. Month names, calendars and conversion: not started.
  ADR 0022.
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.
- **Stories beyond the foundation.** Chapters/acts/beats, prose, story history, story search, a Trash
  for stories, drag-and-drop, Story-vs-Lore checks, and counting pre-era scene years in Settings are all
  deferred. ADR 0024.
- **Relationship life-state constraints** (an end alive at the link's date) wait for dated
  relationships: `StartDate`/`EndDate` are real-world timestamps, not chronology points. A birth-year
  gap across eras of unrecorded length waits for era lengths. ADR 0023.
- **Tooling trial verdict.** `docs/tooling/agent-tooling-trial.md` holds the evidence. Keep /
  conditional / remove is the owner's call, per tool.
- **ImageSharp's licence.** `SixLabors.ImageSharp` is under the Six Labors Split License - free
  for personal use and for organisations under $1M revenue, which is true of Lorex today. Worth
  revisiting if that ever stops being true. ADR 0019.
- **Permanent deletion.** Deferred by Phase 019, so nothing removes an entry for good short of
  deleting the universe. One consequence is a dead end: a type used only by trashed entries
  cannot be deleted, and the only way to free it is to restore the entry, move it to another type
  and trash it again. ADR 0015 records the tradeoff.

## Blockers

None. Follow-ups, not blocking:

- Search matches whole words and prefixes, so the substring hits `LIKE` used to give are gone -
  ADR 0016 argues the trade. Search is SQLite-only and will be redesigned when PostgreSQL
  arrives.
- Orphaned media objects are swept best-effort and never retried. A delete that fails after the
  database has committed logs a warning naming the key and leaves the object; the entry is
  correct either way. ADR 0019 argues the trade.
- A backup archive is assembled whole in memory before it is sent, so that a missing image can be
  refused rather than truncated. Bounded by 8 MB per picture; worth revisiting only if a world
  ever holds enough media to matter. ADR 0014.
- Restoring a revision does not put back the picture that version had, and cannot: the objects
  were deleted when it was superseded. History records the change and the screen says so.
  ADR 0013.
- The DEV topology's accepted costs, all in ADR 0018 and the runbook: SQLite lives on an SMB
  share with one writer, a redeploy is a short outage, Data Protection keys are unencrypted at
  rest, there is no automated backup, and a rollback cannot undo a migration. Production needs a
  real key store and a real database story; neither is Phase 022's business.
