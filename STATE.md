# STATE

Operational state only. Architecture: `docs/architecture/decisions/README.md`. Paths:
`SYSTEMS.md`. Tooling rules: `.claude/CLAUDE.md`. Trial history: `docs/tooling/agent-tooling-trial.md`.

## Roadmap position

- Phases 001-021 done and merged. Sequence log: `docs/architecture/branching.md`.
- **Phase 020** (Full-Text Search) merged into `dev`. Entity search now reads the article an
  author wrote, not only the name, aliases and summary, and orders hits by relevance instead
  of recency. `GET /api/universes/{id}/entities` is unchanged apart from what
  `search` means. Index shape, synchronization and query semantics: ADR 0016.
- **Phase 021** (PWA / Mobile Refinement) merged into `dev`. Lorex installs: a hand-written
  manifest, four icons drawn from the wordmark, and a service worker that caches build output
  and refuses `/api`, non-`GET`, navigations and cross-origin outright - ADR 0017 owns the
  caching, update and privacy policy, and says plainly that nothing works offline. On a narrow
  screen the workspace chrome folds from ~290px of permanent nav into one sticky bar with a
  labelled disclosure; the dossier and editor footers stick to the bottom edge so Edit and Save
  stay in reach; history stacks; hit areas grow only where the pointer is coarse, so the
  desktop layout is untouched. No backend change.
- **Now: Phase 022 - Azure DEV environment and CI/CD.** Not started; no branch yet. The two
  items under Blockers are the ones it has to answer first.

## Baseline

- 328 API integration tests, 54 Playwright tests, green. No frontend unit runner exists; the
  web checks are `typecheck`, `lint`, `format:check` and `build`. The E2E project has no
  format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings, and
  Prettier has to be pointed at that config explicitly when run from `tests/Lorex.E2E`.
- 12 migrations, latest `AddEntitySearchIndex`; `has-pending-model-changes` reports none. That
  one is raw SQL - an FTS5 virtual table and the trigger that empties it - so no EF Core model
  describes it and the pending check cannot see it either way. Verified against a fresh SQLite
  file and against an existing one, where the startup backfill indexes what predates it.
- Six rules in `src/Lorex.Api/Features/CanonIntegrity/Rules/`: three structural (Medium),
  three chronological (High). Behaviour: ADR 0010, 0011, 0012.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev` and
is the GitHub default branch. `master` is reconciled and published; `dev` -> `master` merges
happen only when the owner asks.

## Tooling trial

Task 4 of 3-4 done. The agreed number of tasks is complete and **the verdict is owed** -
see Deferred. RTK and Graphify judged independently.

- RTK works in the `Bash` tool. `rtk gain` now 19.4%, down from ~21.8% and from Phase 020's
  20.1%, and the drift has one cause: the share of work running through chained, piped or
  heredoc commands the wrapper bypasses by design keeps rising. Correctness record still
  clean; the one recorded diagnostic loss remains `rtk npm run dev` swallowing Vite's startup
  banner. Phase 021 filtered `rtk grep` (18 calls, 38.6% average), `git status` (10),
  `git diff` in five shapes (8), a passing `dotnet build` (3, 87%) and `ls` (2); everything
  else - every `cd … && …`, every pipe to `tail` or `grep`, every heredoc - was bypassed, and
  no `rtk proxy` rerun was needed.
- Graphify unused in every task so far, Phase 021 included. Targeted `Grep` over
  `SYSTEMS.md`-named files has answered every question, and no dependency question came up
  that a graph would have answered faster.

## Deferred / owner decisions

- **Full security audit.** Relationships, timeline and Canon Integrity each had a focused check
  backed by tests. Outstanding: rate limiting, header/cookie hardening, dependency review, auth.
- **Cross-era ordering** unsolved, and it bounds the chronology rules. ADR 0009, ADR 0011.
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.
- **Tooling trial verdict.** Four tasks measured, `docs/tooling/agent-tooling-trial.md`
  holds the evidence. Keep / conditional / remove is the owner's call, per tool.
- **Permanent deletion.** Deferred by Phase 019, so nothing removes an entry for good short of
  deleting the universe. One consequence is a dead end: a type used only by trashed entries
  cannot be deleted, and the only way to free it is to restore the entry, move it to another
  type and trash it again. ADR 0015 records the tradeoff.

## Blockers

None. Follow-ups, not blocking: search matches whole words and prefixes, so the substring hits
`LIKE` used to give are gone - ADR 0016 argues the trade. Search is SQLite-only and will be
redesigned when PostgreSQL arrives. Production needs a persisted Data Protection key ring so
cookie sessions survive a restart - ADR 0005.

Two for Phase 022 to answer, both found while starting the API by hand in Phase 021 and
neither blocking anything today:

- **The host dies at startup outside Development.** `DatabaseSetup` only migrates in
  Development, so with `ASPNETCORE_ENVIRONMENT` unset `EntitySearchBackfill` runs against a
  schema that is not there and throws `SQLite Error 1: 'no such table: Entities'` out of
  `Program.Main`. Reproduced on a fresh data source; harmless today because every path that
  runs the API sets Development. Whatever deploys has to decide who applies migrations.
- **Installability needs a secure context.** It works on `localhost`; the deployed origin has
  to be HTTPS or no browser will offer the install. Nothing in the app changes for it - ADR 0017.
