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
- **Profile screen** (`feat/profile-page`, **not merged, not pushed**). The signed-in account has a
  screen of its own at `/app/profile` - a user-level route beside the universe browser, not a
  section of a world - wearing the same bar. A centred circle carries the account's initial,
  because the auth model stores no picture and this branch deliberately does not add one; under it
  are the username, the email, how many universes the account owns and the account id, and a line
  saying that is all Lorex keeps. The workspace sidebar links to it as the one entry that leaves
  the universe, marked by a Lucide `UserRound`, and the signed-in name in the home bar is now a
  link to it.

## Baseline

- **417 API integration tests, 73 Playwright tests**, green. No frontend unit runner exists;
  the web checks are `typecheck`, `lint`, `format:check` and `build`. The E2E project has no
  format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings, and
  Prettier has to be pointed at that config explicitly. CI runs all of it.
- The test host no longer migrates itself, so all 417 tests boot through the same startup path a
  deployment uses.
- Under a full parallel Playwright run, `auth.spec.ts` "rejects a wrong password" intermittently
  times out (it navigates to `/login` without awaiting sign-out), and a relationships, canon or
  universes spec can time out once; each passes alone. Known, not fixed.
- 17 migrations, latest `RemoveEntityImageFramingMode` - drops the image framing column that
  `AddEntityImageFramingMode` added; EF rebuilds `EntityImages` to do it. `RestrictEntityTypeIconKeys`
  is data only. `has-pending-model-changes` reports none. `AddEntitySearchIndex` is raw SQL - an FTS5 virtual
  table and the trigger that empties it - so no EF Core model describes it and the pending check
  cannot see it either way.
- No automated test reaches Cloudflare and none can: the API host registers an in-process object
  store, Playwright runs against `Media:Provider=InMemory`, and the R2 adapter tests answer the SDK
  from an in-process HTTP handler.
- Six rules in `src/Lorex.Api/Features/CanonIntegrity/Rules/`: three structural (Medium), three
  chronological (High). Behaviour: ADR 0010, 0011, 0012.

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
- **Cross-era ordering** unsolved, and it bounds the chronology rules. ADR 0009, ADR 0011.
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.
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
