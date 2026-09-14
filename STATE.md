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
- **Numbered implementation pauses after 022.** Work continues on unnumbered
  `<type>/<description>` branches: Phase 2 Story, and now Phase 3.
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
- **Phase 3 - Authoring, Ideas & Recovery** (owner-sequenced, unnumbered branches): 1. Lore articles - merged. 2. Content
  recovery - merged. 3. Ideas - merged. 4. Persistent top search bar - committed, **not merged, not pushed**. 5. Backup
  Import / Restore - next, and last.
- **Phase 3 - Universe search** (`feat/universe-search` from `dev` `95687ba`, committed, **not merged, not pushed**). "A search
  bar on top that allows to enter anything", scoped to the current universe. ADR 0031.
  - Searches lore (name, aliases, summary, article), stories (title, premise), chapters, scenes, arcs, beats (title, summary or
    description, notes), saved manuscripts, and the account's live ideas of that universe (title, body). Live content only - a
    child of something in the Trash is out; archived entries out as in Lore. Never unassigned ideas, other universes, the
    Trash, versions or recovered drafts. Keyword search with the lore search's tokenizing; not AI. Lore search unchanged.
  - `GET /api/universes/{id}/search?q=`: ownership 404 first; one query per kind, at most 5 each (`hasMore`), ordered by where
    the words were found (title, then planning text, then prose), merged in that tier then a fixed kind order - no score
    compared across indexes; 16-word excerpts as text runs. Thirteen queries fixed; 10-40 ms on the 25 MB dev database.
  - Indexes: lore's `EntitySearchIndex` plus three FTS5 tables (`StorySearchIndex`, `SceneManuscriptSearchIndex`,
    `IdeaSearchIndex`) kept in step by 21 SQLite triggers (plain text, every write path and cascade) and filled by the
    migration. Derived: text only, live-ness by join. U+E000/U+E001 written as spaces in every index copy - ADR 0028's marker
    limitation closed. No backup change: version 11 stands.
  - Web: `UniverseSearch` above every universe screen (a 36px row on a phone, 44px under touch), APG combobox with listbox,
    debounce and abort, results only for the current text, empty/failure/retry, leave guard before a result opens another page.
    Deep links: entry (`#article` for an article match), Scenes `#chapter-`/`#scene-`, Plot `#arc-`/`#beat-`, manuscript,
    universe idea. Story page now one per story (keyed). Sidebar's greyed "Search" removed. The manuscript's narrow-screen
    outline disclosure names the scene on one line, so its text box keeps the Phase 2 first-screen promise under the bar.
  - Owner manual pass: `docs/testing/phase3-universe-search-manual-test.md`.
- **Phase 3 - Ideas** (`feat/ideas` from `dev` `33da348`, merged into `dev` at `95687ba`). Possibilities kept apart from
  lore, owned by the account. ADR 0030.
  - `Ideas`: owner (cascade), optional `UniverseId` (`SET NULL`), title 200, plain body 20,000, `DeletedAt`; no status, tag,
    folder or order - newest update first. Five reference join tables (entry, story, scene, arc, beat), cascading both sides.
    Never lore: no entry, relationship, moment, story, Canon, finding or revision write, pinned by a test (its words reach only
    the universe search's own derived index, ADR 0031).
  - `/api/ideas`: account-scoped list (`universeId` | `unassigned`, `deleted`, `search`, paged, 240-char excerpt), create,
    read, whole save with stale 409 `idea_changed` (no token is stale too), delete to Recently deleted, restore, and
    `reference-targets` for the picker. Another account's idea, universe or content is a 404 or refused in not-found words.
  - References: explicit kind, own universe only, none without a universe; changing universe and references is one save; a
    target in the Trash stays, marked, never newly chosen. No saved versions.
  - Universe delete: one transaction deletes its ideas' references, unassigns them and moves `UpdatedAt`, then deletes the
    universe. Words kept, nothing reattached.
  - Web: `/app/ideas` (from the universes bar, account frame) and the universe sidebar's Ideas section - one `IdeasBrowser` and
    one `IdeaEditor`. Picker drawer, leave guard, recovered drafts (`kind: 'idea'`; existing ideas account-scoped with no
    universe, new ideas per start place). Trash and Settings point to Recently deleted / say ideas survive.
  - Backup format version 11: `payload.ideas` for the universe's ideas, deleted marked, references by kind and id. **Unassigned
    ideas are in no universe backup** - no account export exists. ADR 0014.
  - Owner manual pass: `docs/testing/phase3-ideas-manual-test.md`.
- **Phase 3 - Content recovery** (`feat/content-recovery` from `dev` `0784fac`, merged into `dev` at `33da348`). Three
  recoveries kept apart - saved versions, a Trash for story content, recovered drafts of unsaved writing. ADR 0029.
  - Manuscript versions: `SceneManuscriptRevisions`, the whole text per changing save (`Created|Edited|Restored`); a save that
    changes nothing writes nothing (ADR 0027 amended). `.../manuscript/revisions`, `/{id}`, `/{id}/restore` naming
    `expectedUpdatedAt`, stale 409 `scene_manuscript_changed`. The migration makes each manuscript its version 1.
  - Story Trash: `DeletedAt` on stories, chapters, scenes, arcs, beats - deleting marks, superseding ADR 0024-0026's permanent
    deletes. Order indexes are partial on live rows. A chapter delete still moves its scenes to Unchaptered; a trashed chapter
    holds none and restores empty and last. Restores append; a parent in the Trash refuses with 409 `trash_parent_in_trash`,
    never attaching elsewhere. A beat keeps its hidden link to a trashed scene. One Trash lists six kinds, typed restores.
  - Recovered drafts: IndexedDB `lorex-recovery`, keyed account/universe/kind/id, article and manuscript editors only; never
    sent to the API or a backup, never destroyed by sign-out, never offered to another account. Recover loads it as unsaved
    (Save still required, stale check intact); a failed, stale or orphaned save and a closed tab keep it; a matching save,
    Discard, Done, Load the saved version and leaving by choice let it go.
  - Backup format version 10: `deletedAt` markers and `manuscript.revisions`. ADR 0014.
  - Owner manual pass: `docs/testing/phase3-content-recovery-manual-test.md`.
- **Phase 3 - Lore articles** (`feat/lore-articles`, merged into `dev` at `0784fac`). The owner authorized Phase 3;
  this is its first feature. Entries already had a Tiptap article; the owner kept that format (no plain-text conversion,
  2026-09-13) and it gained everything else. ADR 0028.
  - `EntityArticles` (one per entry; `Entities.Content` dropped) and `EntityArticleRevisions`, its own history. Own route
    `.../entities/{id}/article`, `/revisions`, `/revisions/{id}/restore`; stale save 409 `entity_article_changed`. Entry
    routes, listings, Trash and entry history carry no article.
  - **Merge-readiness fixes** (ADR 0028 amendment). An entry `POST`/`PUT` still carrying `content` - any value, any case -
    is refused whole: 400 `entity_article_moved`, after ownership, before any write. Browser Back/Forward now ask about
    unsaved writing: the app runs on a data router (one catch-all route around the unchanged routes) and
    `HistoryLeaveGuard` holds history moves while a leave question stands. The manuscript gains it too.
  - A save touches the article, its version, search and the entry's `UpdatedAt` - no Canon gate, field, relationship,
    timeline or entry revision. No status of its own: it follows the entry's Canon state.
  - Entry revisions no longer copy the article and a restore never applies it. Versions recorded before keep their copy,
    read-only and labelled; the migration makes each article version 1 of its own history.
  - Search reads the row and returns `articleExcerpt` (FTS5 snippet: 16 words, 240 characters, page ids only, article
    matches only), drawn as text with `<mark>`. Backup format version 9 (`articleUpdatedAt`, `articleRevisions`; revision
    `content` re-meant). ADR 0014, 0016, 0013 amended.
  - Entry page: an Article section - Write/Edit article, Save and Ctrl/Cmd+S (focus in the article), status, conflict
    choice, failure and gone-entry messages that keep the text, the leave guard with Sign out, Done asks; one editor at a
    time; Article history on request. A new entry writes its article once created. Search cards show the excerpt.
  - Fixed on the way: a narrow-screen `.entry__layout` `1fr` column let one long unbroken word widen the whole entry page
    past the screen (now `minmax(0, 1fr)`); the refocus after Save held Tiptap's StrictMode-destroyed instance.
  - Owner manual pass: `docs/testing/phase3-lore-article-manual-test.md`. Backup Import / Restore is Phase 3's last feature.
- **Phase 2 Story - COMPLETE** (owner-sequenced, unnumbered branches). Implemented scope: Stories, Chapters,
  Scenes, Plot Arcs / Beats, Scene Manuscript. ADR 0024-0027. Deferred Story work is listed under Deferred, apart
  from this: none of it is a Phase 2 gap.
  1. Story / Scene foundation - merged.
  2. Story chapters - merged.
  3. Plot arcs / beats - merged.
  4. Scene manuscript - merged.
  5. Story workspace integration / Phase 2 closeout - merged.
  6. Owner acceptance - owner-managed, `docs/testing/phase2-story-manual-test.md`.
- **Story workspace integration / Phase 2 closeout** (`feat/story-phase2-closeout`, merged into `dev`). Polish and hardening across the
  four features, reviewed as one product against a 24-scene story. No new subsystem, no API, schema or backup change.
  - One short header for Scenes, Plot and Manuscript: title and facts, the premise on Scenes only, and one bar holding
    the views and Edit/Delete story - icon-only below 640px, still named. At 390px the first scene and the manuscript
    text box are on the first screen; before, the header filled it.
  - Each view opens with its own tools, or with one empty state holding one way to begin: a new story leads to a scene,
    and Plot points back to Scenes. A story or story list that cannot be read says so in one wording with Try again; a
    failed re-read keeps the story on screen, marked stale, instead of unmounting prose being written.
  - Write on every scene card opens its manuscript; Show in Scenes, the manuscript's new Lore row and the plot chips lead
    back out. A link to a scene or beat scrolls to it, focuses it and marks it for a moment. Scene and beat tools say
    whose they are; story drawers hand the focus back to their opener. `SceneContext` draws a scene's date, point of
    view, lore and beats the same on its card and its manuscript page.
  - The leave guard also asks on Sign out, the one in-app way out that is a button (`confirmLeaving`). Back/Forward was
    left uncaught then; Phase 3 catches it (ADR 0028 amendment).
  - "Arc" everywhere; no "plot arc" left on screen.
  - `StoryPhaseIntegrityTests` walks the whole ownership graph in one universe and proves a full story workflow changes
    no lore, relationship, timeline, revision, Canon finding or search result. `story-workspace.spec.ts` covers the
    cross-view journey, unsaved prose, deep links, focus and the first screen from 390px to 1920px.
  - A local `has-pending-model-changes` that fails naming `wwwroot` is a stale `bin/Release` static web assets manifest
    from a local publish rehearsal, not the repository: CI's clean checkout never has it. `dotnet clean -c Release`
    clears it. Runbook troubleshooting.
- **Story & Scene foundation** (`feat/story-scene-foundation`, merged into `dev`). The first
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
    a story or scene was permanent; content recovery sends it to the Trash (ADR 0029). Year checks and the era row are
    now shared with the timeline (`ChronologyPointValidation`, `ChronologyPointFields`); an era a scene uses cannot be
    removed.
  - Backup format version 5 carries stories: a version 4 reader would drop them silently. ADR 0014.
  - The sidebar stays text-only: the Lucide icon asked for would have been the only one in it.
- **Story chapters** (`feat/story-chapters`, merged into `dev`). Optional structure between story and scene. ADR 0025.
  - `Chapters` (title, summary, notes, order) owned by the story. `Scenes.ChapterId` nullable: null is
    Unchaptered, never a fake chapter row. Scenes stay the unit; a move keeps the same row and everything
    on it.
  - Scene order is now per container - one chapter, or Unchaptered - via two filtered unique indexes
    (a unique index treats nulls as distinct, so one index would not guard Unchaptered). No story-wide
    scene order once chapters exist. Chronology still orders nothing.
  - Chapter order: append, `PUT .../chapters/order`. Scenes: `PUT .../scenes/order` names its container;
    `PUT .../scenes/{id}/position` moves within or across; an edit naming another chapter moves it last
    there. All one transaction, park-then-place.
  - Deleting a chapter moves its scenes, in order, to the end of Unchaptered, then deletes it - since content recovery,
    into the Trash (ADR 0029). FK is `NO ACTION`, so a delete that skipped the move is refused rather than corrupting
    order.
  - The number ("Chapter 3") is the position, never stored. Story read is still a fixed query count,
    pinned by a test at 10 chapters x 100 scenes.
  - Migration `AddStoryChapters`: every existing scene Unchaptered with its order untouched; rollback
    flattens into reading order and discards chapters. Backup format version 6: a v5 reader would lose
    chapter text and misread per-chapter `sortOrder`. ADR 0014.
  - Story page: Unchaptered shown only while it holds a scene; modest chapter headings; Move up/down stay
    in the container; "Move to…" disclosure; Chapter field in the scene form. No drag, no collapse.
- **Story plot** (`feat/story-plot-arcs-beats`, merged into `dev`). What the author means to develop, apart from lore (true) and
  structure (shown, in order). ADR 0026.
  - `PlotArcs` (story-owned) -> `PlotBeats` (arc-owned): title, description, notes, order. No status. Beat <-> scene
    and beat <-> entry are join rows cascading from both sides - references, so no plot delete reaches a scene,
    chapter or entry, and a deleted scene or entry row takes only its link. Same story / same universe checked on
    write, refused alike; a trashed entry stays marked and cannot be newly linked.
  - Arc order per story, beat order per arc: append, gap-close, whole-order `PUT`, park-then-place. An edit naming
    another arc moves a beat last there. No stored number. Scene order, chapters and chronology never move a beat.
  - `GET .../plot-arcs` is its own fixed-query read, pinned at 5 arcs x 10 beats x 250 links; `StoryDetail` is
    unchanged. No Canon, timeline or lore change from any plot write.
  - The story page gained a Plot view (`.../plot`) beside Scenes (`/stories/:id`), one header. Arc headings,
    beat rows with wrapping Scenes/Lore chips, a scene picker grouped by chapter with a filter, and a read-only Plot
    row on each scene card linking back. No sidebar entry; the greyed "Plot" placeholder is gone from it.
  - Backup format version 7: a v6 reader would lose arc and beat text and every link. ADR 0014.
- **Scene manuscript** (`feat/story-scene-manuscript`, merged into `dev`). The prose itself, apart from a scene's planning. ADR 0027.
  - `SceneManuscripts`: `SceneId` key and FK (cascade), `Content` unbounded text, `UpdatedAt`. No column or navigation on
    `Scene`, so reorders, moves and the story read never load prose. No row until the first save; `""` is a valid save.
  - Plain text stored exactly - no trim, Markdown or HTML. `GET`/`PUT .../scenes/{id}/manuscript` is the only route that
    carries it; a test holds story, scene, chapter and plot reads to the same length around a 400k-character save.
  - Bound 1,000,000 characters (`StoryLimits.ManuscriptMaxLength`, mirrored client-side). A save names the `updatedAt` it
    was written over; a mismatch is 409 `scene_manuscript_changed`, nothing written, and the author chooses keep or load.
  - Updates the story's `UpdatedAt`, not the scene's. No Canon, timeline, lore, plot link or search from prose.
  - Third story view, Manuscript, at `/stories/:id/manuscript/:sceneId?`: chapter-aware outline of links, plain textarea at
    46rem, explicit Save and Ctrl/Cmd+S, sticky save bar, Edit scene reuses the scene drawer. At 1100px and below the outline
    folds into a disclosure. `useLeaveGuard` asks before a link or page unload drops unsaved prose; Back/Forward too since ADR 0028's amendment.
  - Backup format version 8: a v7 reader would lose every word. ADR 0014.

## Baseline

- **798 API integration tests, 131 Playwright tests**, green. Universe search full Playwright runs (dev database grown to
  31 MB): 129/131 - the story first-screen test was a real regression from the new phone row, fixed before the next run - then
  126/131 and 128/131. Every other failure was the known contention below, `database is locked` on a commit in
  `CanonIntegrityEndpoints.TransitionAsync`, `UniverseEndpoints.SetArchivedAsync`, `StoryEndpoints.UpdateAsync`/`DeleteAsync`,
  `StoryContentRestore.RestoreStoryAsync` or `ProfileImageEndpoints.RemoveAsync` - no write the search triggers touch - and
  each passed alone (ideas: three parallel file runs 7/7). Measured trigger cost: 1-2 ms on a title or body write, ~5 ms on a
  53,000-character manuscript save. Canon alone also flakes on a large dev database (Ideas phase: `dev` failed 3 of 8 parallel
  runs on a 25 MB copy, 4 of 4 green on a fresh one). No frontend unit runner exists; the web checks are `typecheck`, `lint`, `format:check` and `build`. The E2E
  project has no format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings, and
  Prettier has to be pointed at that config explicitly. CI runs all of it.
- The test host no longer migrates itself, so every API test boots through the same startup path a
  deployment uses.
- Under a full parallel Playwright run, `auth.spec.ts` "rejects a wrong password" intermittently
  times out (it navigates to `/login` without awaiting sign-out), and a full run loses one to four of a rotating pick of
  canon, type-filter, mobile, universes, relationships or account-menu, each file green on its own. Known, not fixed. It
  is contention on the one SQLite writer, not the specs, and the content recovery run's API log shows how: a write's commit
  throws `SQLite Error 5: 'database is locked'` at once, not after the provider's retry, and is answered as a 500 - or as a
  false 409 where an endpoint maps every `DbUpdateException` to a conflict (entity type update: "name taken").
- 28 migrations, latest `AddUniverseSearchIndex` - raw SQL: three FTS5 tables filled from existing rows, 21 triggers, and the
  lore index rows holding a marker character removed for the backfill; the snapshot gains two keyless match types.
  `UniverseSearchMigrationTests` walks it down and up on a file and reads every trigger back. Before it, `AddIdeas` - additive:
  `Ideas` and five reference tables; `IdeaMigrationTests` walks it down and up and deletes a universe row under it. Before that, `AddContentRecovery` - `DeletedAt` on five story tables, their order indexes
  recreated partial on live rows, and `SceneManuscriptRevisions` with each manuscript as its version 1. Its rollback drops the columns with
  SQLite's native `DROP COLUMN`, as `AddEntityArticles` did for `Entities.Content` (EF Core's table rebuild loses what it
  cannot see, such as the FTS delete trigger), and discards the Trash, what is in it and every manuscript's history.
  `ContentRecoveryMigrationTests` walks it down and up over stories on a file; `EntityArticleMigrationTests` still walks
  the articles move.
  Every migration since `AddUniverseChronology` has a `*MigrationTests` walk on a file. `has-pending-model-changes` reports
  none. `AddEntitySearchIndex` is raw SQL - an FTS5 table and its trigger - invisible to the pending check either way.
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
- **Story work deferred past Phase 2** - later work, not Phase 2 gaps: acts and volumes, rich text, saved versions of
  anything in a story but its manuscript, drag-and-drop, collaboration, manuscript export, AI, and restoring
  a backup. Also: collapsing chapters, bulk scene moves, Story-vs-Lore checks, pre-era scene years in Settings; a plot
  status, beat chronology, editing beats from a scene, board or graph views; autosave, word counts, a "has prose" marker on
  scene cards (it needs a flag the story read can give without reading prose). ADR 0024-0027, 0029.
- **Lore article work deferred** - later, not gaps: plain text or Markdown, wiki links and backlinks, version diffs and
  pruning, restoring article text held in pre-ADR-0028 entry versions from the screen, autosave, word counts. ADR 0028.
- **Ideas deferred** - not gaps: promoting an idea (AI proposals are Phase 5), statuses, tags, collections, rich text, wiki
  links, saved versions, cross-universe references, permanent delete, an account export for unassigned ideas, importing ideas
  (Backup Import / Restore). ADR 0030.
- **Universe search deferred** - not gaps: **account-wide search is an unsettled owner decision**; unassigned ideas in any bar;
  AI, semantic or fuzzy search, substring matching; a command palette, results page, filters, saved searches, history; timeline,
  Canon, types and Trash search; highlighting the match inside an opened article or manuscript; a pinned bar. ADR 0031.
- **Content recovery deferred** - not gaps: recovered drafts for forms, drafts synced across browsers or devices, merging a
  draft into a newer save, a restored chapter taking back the scenes it held. ADR 0029.
- **Relationship life-state constraints** (an end alive at the link's date) wait for dated
  relationships: `StartDate`/`EndDate` are real-world timestamps, not chronology points. A birth-year
  gap across eras of unrecorded length waits for era lengths. ADR 0023.
- **Tooling trial verdict.** `docs/tooling/agent-tooling-trial.md` holds the evidence. Keep /
  conditional / remove is the owner's call, per tool.
- **ImageSharp's licence.** `SixLabors.ImageSharp` is under the Six Labors Split License - free
  for personal use and for organisations under $1M revenue, which is true of Lorex today. Worth
  revisiting if that ever stops being true. ADR 0019.
- **Permanent deletion.** Deferred by Phase 019, so nothing removes an entry - or, since content recovery, a story,
  chapter, scene, arc or beat - for good short of deleting the universe. Two dead ends follow: a type used only by trashed
  entries cannot be deleted until the entry is restored, moved to another type and trashed again (ADR 0015), and an era a
  trashed scene is dated in cannot be removed until the scene is restored and re-dated (ADR 0029).

## Blockers

None. Follow-ups, not blocking:

- Search - lore and universe alike - matches whole words and prefixes, so the substring hits `LIKE` used to give are gone -
  ADR 0016 argues the trade. Search is SQLite-only (FTS5 tables and triggers) and will be redesigned when PostgreSQL
  arrives (ADR 0031). A migration that rebuilds a story, manuscript or idea table must recreate its search triggers;
  `UniverseSearchMigrationTests` fails if one is missing.
- Orphaned media objects are swept best-effort and never retried. A delete that fails after the
  database has committed logs a warning naming the key and leaves the object; the entry is
  correct either way. ADR 0019 argues the trade.
- Ideas with no universe have no file-level backup: a universe backup cannot truthfully hold them and no account export
  exists. The database is their only copy. ADR 0030.
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
