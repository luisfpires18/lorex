# STATE

Operational state only. Architecture: `docs/architecture/decisions/README.md`. Paths:
`SYSTEMS.md`. Tooling rules: `.claude/CLAUDE.md`. Trial history: `docs/tooling/agent-tooling-trial.md`.

## Roadmap position

- Phases 001-018 done and merged. Sequence log: `docs/architecture/branching.md`.
- **Phase 018** (Export / Backup) merged into `dev`. `GET /api/universes/{id}/export` hands the
  owner one versioned JSON file holding the universe's authored data, read in a single
  transaction with every collection ordered in memory so unchanged lore exports byte-identical
  payloads. What is in a backup and what is deliberately rebuilt instead: ADR 0014. Export
  only - nothing reads a backup back in, and the Settings screen says so.
- **Now: Phase 019 - Trash / Recovery.** Not started; no branch yet.

## Baseline

- 286 API integration tests, 46 Playwright tests, green. No frontend unit runner exists; the
  web checks are `typecheck`, `lint`, `format:check` and `build`. The E2E project has no
  format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings.
- 10 migrations, latest `AddEntityRevisions`; `has-pending-model-changes` reports none. Phase
  018 changed no schema - a backup only reads.
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
  Phase 018 added no new evidence: nearly every command was piped or chained, so the wrapper
  bypassed it, and no unfiltered rerun was needed.
- Graphify unused in every task so far. Targeted `Grep` over `SYSTEMS.md`-named files has
  answered every question.

## Deferred / owner decisions

- **Full security audit.** Relationships, timeline and Canon Integrity each had a focused check
  backed by tests. Outstanding: rate limiting, header/cookie hardening, dependency review, auth.
- **Cross-era ordering** unsolved, and it bounds the chronology rules. ADR 0009, ADR 0011.
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.
- **Tooling trial verdict.** Four tasks measured, `docs/tooling/agent-tooling-trial.md`
  holds the evidence. Keep / conditional / remove is the owner's call, per tool.

## Blockers

None. Follow-ups, not blocking: the lore article body is not searched - name, aliases and
summary are - and full text needs SQLite FTS rather than a LIKE over Tiptap JSON. Production
needs a persisted Data Protection key ring so cookie sessions survive a restart - ADR 0005.
