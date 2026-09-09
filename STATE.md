# STATE

Operational state only. Architecture: `docs/architecture/decisions/README.md`. Paths:
`SYSTEMS.md`. Tooling rules: `.claude/CLAUDE.md`. Trial history: `docs/tooling/agent-tooling-trial.md`.

## Roadmap position

- Phases 001-014 done. Sequence log: `docs/architecture/branching.md`.
- **Phase 014** (Canon promotion gates) merged into `dev`. Backend only. Canon Integrity is
  complete server-side - persistence, six rules, review API, promotion gate - and has **no UI**.
- **Now:** AI/context workflow maintenance. No product change.
- **Next: Phase 015 - Canon Integrity UI.** The review screen with no client since Phase 012,
  and the gate's 409 (`canon_promotion_blocked` + `blockingFindings`), which ordinary editing
  can now trigger and which surfaces nowhere.

## Baseline

- 246 API integration tests, 38 Playwright tests, green on Release.
- 9 migrations, latest `AddEntityFieldSemantics`; `has-pending-model-changes` reports none.
- Six rules in `src/Lorex.Api/Features/CanonIntegrity/Rules/`: three structural (Medium),
  three chronological (High). Behaviour: ADR 0010, 0011, 0012.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev` and
is the GitHub default branch. `master` is reconciled and published; `dev` -> `master` merges
happen only when the owner asks.

## Tooling trial

Task 2 of 3-4 done, **no verdict yet**. RTK and Graphify judged independently.

- RTK works in the `Bash` tool; the earlier PATH break was fixed by the host restart. Last
  measure `rtk gain` 19 commands / 727 tokens / 16.4% - a floor, because the hook matches
  `Bash` only and the heavy `dotnet` commands mostly run through `PowerShell`.
- Graphify unused in both tasks. Targeted `Grep` over `SYSTEMS.md`-named files has answered
  every question so far.

## Deferred / owner decisions

- **Full security audit.** Relationships, timeline and Canon Integrity each had a focused check
  backed by tests. Outstanding: rate limiting, header/cookie hardening, dependency review, auth.
- **Cross-era ordering** unsolved, and it bounds the chronology rules. ADR 0009, ADR 0011.
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.

## Blockers

None. Follow-ups, not blocking: the lore article body is not searched - name, aliases and
summary are - and full text needs SQLite FTS rather than a LIKE over Tiptap JSON. Production
needs a persisted Data Protection key ring so cookie sessions survive a restart - ADR 0005.
