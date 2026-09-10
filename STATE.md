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
  stabilization and feature polish**: fixes and small improvements as the owner finds them, on
  branches numbered from `023` in the ordinary way, but no planned phase driving them.
  **Phase 023 - Production Hardening / PostgreSQL - remains deferred** and is not started; the
  next numbered phase resumes only when the owner says so.

## Baseline

- **335 API integration tests, 57 Playwright tests**, green. No frontend unit runner exists;
  the web checks are `typecheck`, `lint`, `format:check` and `build`. The E2E project has no
  format script of its own - its specs are held to the `src/Lorex.Web` Prettier settings, and
  Prettier has to be pointed at that config explicitly. CI runs all of it.
- The test host no longer migrates itself, so all 335 tests boot through the same startup path a
  deployment uses.
- 12 migrations, latest `AddEntitySearchIndex`; `has-pending-model-changes` reports none, and
  Phase 022 added no migration. That one is raw SQL - an FTS5 virtual table and the trigger that
  empties it - so no EF Core model describes it and the pending check cannot see it either way.
- Six rules in `src/Lorex.Api/Features/CanonIntegrity/Rules/`: three structural (Medium), three
  chronological (High). Behaviour: ADR 0010, 0011, 0012.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev` and is
the GitHub default branch. `master` is reconciled and published; `dev` -> `master` merges happen
only when the owner asks.

## Tooling trial

Four tasks measured; the agreed number is complete and **the verdict is owed** - see Deferred.
RTK and Graphify judged independently. Phase 022 was not a trial task and added no evidence
either way, which is itself the finding.

- RTK: `rtk gain` still 19.4%, unmoved across the whole of Phase 022. Almost every command this
  phase was compound, piped or a heredoc, which the wrapper bypasses by design, so barely
  anything reached the filter - one `rtk grep`, a few `git status` and `git diff` rewrites.
  Correctness record still clean; no `rtk proxy` rerun was needed, in this phase or any other.
- Graphify: unused again, in Phase 022 as in 020 and 021. Targeted `Grep` and `Read` over
  `SYSTEMS.md`-named files answered every question.

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
- **Permanent deletion.** Deferred by Phase 019, so nothing removes an entry for good short of
  deleting the universe. One consequence is a dead end: a type used only by trashed entries
  cannot be deleted, and the only way to free it is to restore the entry, move it to another type
  and trash it again. ADR 0015 records the tradeoff.

## Blockers

None. Follow-ups, not blocking:

- Search matches whole words and prefixes, so the substring hits `LIKE` used to give are gone -
  ADR 0016 argues the trade. Search is SQLite-only and will be redesigned when PostgreSQL
  arrives.
- The DEV topology's accepted costs, all in ADR 0018 and the runbook: SQLite lives on an SMB
  share with one writer, a redeploy is a short outage, Data Protection keys are unencrypted at
  rest, there is no automated backup, and a rollback cannot undo a migration. Production needs a
  real key store and a real database story; neither is Phase 022's business.
