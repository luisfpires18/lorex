# STATE

Operational state only. Architecture: `docs/architecture/decisions/README.md`. Paths:
`SYSTEMS.md`. Tooling rules: `.claude/CLAUDE.md`. Trial history: `docs/tooling/agent-tooling-trial.md`.

## Roadmap position

- Phases 001-019 done and merged. Sequence log: `docs/architecture/branching.md`.
- **Phase 018** (Export / Backup) merged into `dev`. `GET /api/universes/{id}/export` hands the
  owner one versioned JSON file holding the universe's authored data, read in a single
  transaction with every collection ordered in memory so unchanged lore exports byte-identical
  payloads. What is in a backup and what is deliberately rebuilt instead: ADR 0014. Export
  only - nothing reads a backup back in, and the Settings screen says so.
- **Phase 019** (Trash / Recovery) merged into `dev`. `DELETE` on an entry sets `DeletedAt`
  instead of removing the row, so nothing that pointed at it is destroyed;
  `GET /api/universes/{id}/trash` lists what was thrown away and
  `POST .../trash/{entityId}/restore` puts one back under the promotion gate. Entries are the
  only trashable thing. Semantics: ADR 0015. The backup format is at version 2 because a backup
  now carries the Trash - ADR 0014 argues the bump.
- **Phase 020** (Full-Text Search) on `feat/020/full-text-search`, not merged. Entity search now
  reads the article an author wrote, not only the name, aliases and summary, and orders hits by
  relevance instead of recency. `GET /api/universes/{id}/entities` is unchanged apart from what
  `search` means. Index shape, synchronization and query semantics: ADR 0016.

## Baseline

- 328 API integration tests, 47 Playwright tests, green. No frontend unit runner exists; the
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

- RTK works in the `Bash` tool. `rtk gain` ~21.8%, drifting down as more work runs through
  chained or piped commands the wrapper bypasses by design. Correctness record still clean;
  the one recorded diagnostic loss remains `rtk npm run dev` swallowing Vite's startup banner.
  Phase 020 measured 20.1%: `rtk grep`, `git status`, `git diff` and a passing `dotnet build`
  were rewritten and filtered, everything piped or chained was bypassed by design, and no
  unfiltered rerun was needed.
- Graphify unused in every task so far. Targeted `Grep` over `SYSTEMS.md`-named files has
  answered every question.

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
