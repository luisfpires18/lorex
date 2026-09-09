# STATE

Operational state only. Architecture: `docs/architecture/decisions/README.md`. Paths:
`SYSTEMS.md`. Tooling rules: `.claude/CLAUDE.md`. Trial history: `docs/tooling/agent-tooling-trial.md`.

## Roadmap position

- Phases 001-014 done. Sequence log: `docs/architecture/branching.md`.
- **Phase 015** (Canon Integrity UI) implemented on `feat/015/canon-integrity-ui`,
  **not merged**. Frontend only. Canon Integrity now has a review screen at
  `/app/universes/:id/canon` and the gate's 409 is presented as a refusal rather than a
  save failure, on entity and timeline saves.
- **Next: Phase 016 - hardening.** Owns the E2E coverage this phase deliberately did not
  add, and whatever the security follow-ups below turn into.

## Baseline

- 246 API integration tests, 38 Playwright tests, green on Release. No frontend unit runner
  exists; the web checks are `typecheck`, `lint`, `format:check` and `build`.
- 9 migrations, latest `AddEntityFieldSemantics`; `has-pending-model-changes` reports none.
- Six rules in `src/Lorex.Api/Features/CanonIntegrity/Rules/`: three structural (Medium),
  three chronological (High). Behaviour: ADR 0010, 0011, 0012.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev` and
is the GitHub default branch. `master` is reconciled and published; `dev` -> `master` merges
happen only when the owner asks.

## Tooling trial

Task 3 of 3-4 done, **no verdict yet**. RTK and Graphify judged independently.

- RTK works in the `Bash` tool. Last measure `rtk gain` ~33 commands / ~3.6K tokens / 23.5%;
  the jump came from a frontend command mix (`grep`, `git status`), not from the tool. First
  diagnostic loss recorded: `rtk npm run dev` swallowed Vite's whole startup banner.
- Graphify unused in all three tasks. Targeted `Grep` over `SYSTEMS.md`-named files has
  answered every question so far.

## Deferred / owner decisions

- **Full security audit.** Relationships, timeline and Canon Integrity each had a focused check
  backed by tests. Outstanding: rate limiting, header/cookie hardening, dependency review, auth.
- **Cross-era ordering** unsolved, and it bounds the chronology rules. ADR 0009, ADR 0011.
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.

## Blockers

None. Follow-ups, not blocking: the lore article body is not searched - name, aliases and
summary are - and full text needs SQLite FTS rather than a LIKE over Tiptap JSON. Production
needs a persisted Data Protection key ring so cookie sessions survive a restart - ADR 0005.
