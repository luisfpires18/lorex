# STATE

Operational state only. Architecture: `docs/architecture/decisions/README.md`. Paths:
`SYSTEMS.md`. Tooling rules: `.claude/CLAUDE.md`. Trial history: `docs/tooling/agent-tooling-trial.md`.

## Roadmap position

- Phases 001-016 done. Sequence log: `docs/architecture/branching.md`.
- **Phase 016** (Canon Integrity E2E / hardening) on `test/016/canon-integrity-hardening`,
  **not merged, not pushed**. Five Playwright scenarios in `tests/Lorex.E2E/specs/canon.spec.ts`
  cover the review screen, conflict identity across runs, the promotion gate, reconciliation
  on write, and the universe/owner boundary. One defect found and fixed: the entry page's
  one-click Canon step swallowed the gate's 409.
- **Next: no phase chosen.** The security follow-ups below are the largest open item.

## Baseline

- 246 API integration tests, 43 Playwright tests, green. No frontend unit runner exists; the
  web checks are `typecheck`, `lint`, `format:check` and `build`. The E2E project has no
  format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings.
- 9 migrations, latest `AddEntityFieldSemantics`; `has-pending-model-changes` reports none.
- Six rules in `src/Lorex.Api/Features/CanonIntegrity/Rules/`: three structural (Medium),
  three chronological (High). Behaviour: ADR 0010, 0011, 0012.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev` and
is the GitHub default branch. `master` is reconciled and published; `dev` -> `master` merges
happen only when the owner asks.

## Tooling trial

Task 4 of 3-4 done. The agreed number of tasks is complete and **the verdict is owed** -
see Deferred. RTK and Graphify judged independently.

- RTK works in the `Bash` tool. `rtk gain` ~23.2% and essentially flat across Task 4: a
  Playwright phase runs almost everything as `cd … && …`, which the wrapper bypasses by
  design, so RTK had close to nothing to filter. Correctness record still clean; the one
  recorded diagnostic loss remains `rtk npm run dev` swallowing Vite's startup banner.
- Graphify unused in all four tasks. Targeted `Grep` over `SYSTEMS.md`-named files has
  answered every question so far.

## Deferred / owner decisions

- **Full security audit.** Relationships, timeline and Canon Integrity each had a focused check
  backed by tests. Outstanding: rate limiting, header/cookie hardening, dependency review, auth.
- **Cross-era ordering** unsolved, and it bounds the chronology rules. ADR 0009, ADR 0011.
- **`Age`** is declarable but read by nothing until a structured reference year exists. ADR 0011.
- **Does `EntityFieldSemantic` get a minimal Types-screen control before work moves past
  Canon Integrity?** Behaviour and its consequences: ADR 0011. Not decided, not scoped.
- **Tooling trial verdict.** Four tasks measured, `docs/tooling/agent-tooling-trial.md`
  holds the evidence. Keep / conditional / remove is the owner's call, per tool.

## Blockers

None. Follow-ups, not blocking: the lore article body is not searched - name, aliases and
summary are - and full text needs SQLite FTS rather than a LIKE over Tiptap JSON. Production
needs a persisted Data Protection key ring so cookie sessions survive a restart - ADR 0005.
