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
  fixed, and DEV has a topology, workflows and a runbook - but nothing exists in Azure yet,
  because the owner has to create it.
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
- **Entry images** (`feat/entity-images-r2`, unnumbered, **not merged, not pushed**). An entry
  may carry one picture: uploaded through the API, decoded and thumbnailed server-side, stored
  as two objects in one private Cloudflare R2 bucket, and served back only through an
  authenticated owner-scoped Lorex route. ADR 0019.
  - **No Cloudflare resource exists yet**, and none was created. See Deferred.
  - Two decisions the feature deliberately did **not** take - backup and revision semantics -
    are open and waiting on the owner. See Deferred.

## Baseline

- **361 API integration tests, 60 Playwright tests**, green. No frontend unit runner exists;
  the web checks are `typecheck`, `lint`, `format:check` and `build`. The E2E project has no
  format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings, and
  Prettier has to be pointed at that config explicitly. CI runs all of it.
- The test host no longer migrates itself, so all 361 tests boot through the same startup path a
  deployment uses.
- 13 migrations, latest `AddEntityImages` - one `CREATE TABLE`, no table rebuild.
  `has-pending-model-changes` reports none. `AddEntitySearchIndex` is raw SQL - an FTS5 virtual
  table and the trigger that empties it - so no EF Core model describes it and the pending check
  cannot see it either way.
- No automated test reaches Cloudflare and none can: the API host registers an in-process object
  store, and Playwright runs against `Media:Provider=InMemory`.
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
- **Azure DEV does not exist yet.** Phase 022 wrote the topology, the workflows and the runbook
  but created nothing. Before the first deploy the owner has to: deploy `infra/main.bicep` into a
  resource group; create an Entra app registration with a federated credential for the `dev`
  GitHub environment and Contributor on that group; create the `dev` GitHub environment and the
  four variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
  `AZURE_WEBAPP_NAME`. Exact steps: `docs/deployment/azure-dev.md`.
- **Full security audit.** Relationships, timeline and Canon Integrity each had a focused check
  backed by tests. Outstanding: rate limiting, header/cookie hardening, dependency review, auth.
- **Cross-era ordering** unsolved, and it bounds the chronology rules. ADR 0009, ADR 0011.
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.
- **Tooling trial verdict.** `docs/tooling/agent-tooling-trial.md` holds the evidence. Keep /
  conditional / remove is the owner's call, per tool.
- **DECISION OWED - what a backup does about images.** ADR 0014 argued for one JSON file partly
  because "media is not in the product". It now is, and the export was deliberately left
  untouched: `formatVersion` stays 2 and carries no image metadata and no bytes. So a backup is
  no longer lossless, and that is said out loud rather than allowed to happen quietly. Three
  models, none of them chosen:
  1. **Metadata-only JSON** - carry asset id, object keys, content type and dimensions; bump to
     `formatVersion` 3. Small change, no new format, and a restore into the same bucket would
     reconnect. Honest, but the guarantee is explicitly reduced: the file alone is not a world.
  2. **An archive** - a zip holding `backup.json` plus the media, which is what "lossless"
     actually requires. Changes the download, the browser handling, the export test's
     byte-for-byte determinism check, and everything a future import will read. Largest change,
     and the only one that keeps ADR 0014's original promise.
  3. **Defer, with the contract versioned and the gap documented** - what the branch does today.
     Costs nothing now, and the second backup format change becomes the price later.
  Recommendation: **1 now, 2 when an import exists.** Metadata is what makes a future archive
  possible and a restore reconnectable, and it is a two-line change to the payload; turning a
  download into an archive is worth doing once, alongside the importer that reads it.
- **DECISION OWED - whether history can restore an old image.** Revisions do not track the image
  at all today, which puts it alongside relationships and timeline participation in ADR 0013's
  list of entry state a snapshot does not hold. Restoring an old version leaves the current
  picture alone. It is the honest interim, because a replacement deletes the objects it
  supersedes, so an old revision could not restore bytes that no longer exist. Three models:
  1. **Leave it out**, and say so in the history UI. Free, and no storage grows. An author who
     restores a version does not get the picture that version had.
  2. **Record the image on a revision but do not restore it** - history reads "the image
     changed" and shows what it was called. Cheap, honest, and still cannot put it back.
  3. **Retain historical originals** - a replacement stops deleting the superseded pair, so every
     version's image survives. The only model where restore is complete. It also means storage
     grows with every replacement and never shrinks, needs a cleanup story tied to revision
     pruning that ADR 0013 does not have, and needs the object lifecycle rewritten.
  Recommendation: **2.** It makes history truthful about what changed without committing to an
  unbounded, uncollected pile of superseded images - and 3 is a decision worth taking with a
  history-pruning design, not ahead of one.
- **Cloudflare R2 does not exist yet.** No bucket, no token, no App Service setting, and nothing
  in this repository creates any of them. Until the owner does it, every image route answers 503
  and nothing else is affected. Exact steps: `docs/deployment/cloudflare-r2.md`.
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
- The DEV topology's accepted costs, all in ADR 0018 and the runbook: SQLite lives on an SMB
  share with one writer, a redeploy is a short outage, Data Protection keys are unencrypted at
  rest, there is no automated backup, and a rollback cannot undo a migration. Production needs a
  real key store and a real database story; neither is Phase 022's business.
