# STATE

## Current state

Phase 011 (Canon Integrity foundation) complete and merged into `dev`. The backend half
of Canon Integrity exists: persistence, a rule engine, and a review API. No UI.

- Canon Integrity: a conflict is a derived finding, never lore. Lorex records that
  something looks wrong and changes nothing about the records it describes. `CanonConflict`
  carries a rule code, severity (Low/Medium/High), status (Pending/Resolved/Dismissed),
  a per-universe unique fingerprint, a title and an explanation. Subjects live in a
  relational `CanonConflictSubjects` table keyed by `(ConflictId, SubjectKind, SubjectId,
  Role)` - no JSON, and deliberately no foreign key, because the target is one of several
  tables. Kinds: Entity, Relationship, TimelineEntry, EntityField.
- Fingerprint: SHA-256 over the rule code and the ids only, one finding per offending
  fact - `(relationship, endpoint)`, `(entry, participant)`, `(entity, field definition,
  referenced entity)`. A rename rewords a conflict in place; a materially different fact
  opens a new one and resolves the old, so a dismissal is never inherited by a different
  fact. Evaluation is idempotent down to `UpdatedAt`.
- Lifecycle: a dismissal suppresses an issue only while it is still there. Evaluation
  leaves a Dismissed conflict alone while the finding persists, resolves it once the issue
  is actually fixed, and raises the same fingerprint as Pending again if it later returns.
  Dismiss and reopen are the author's, and both refuse a Resolved conflict. See
  `docs/architecture/decisions/0010-canon-conflict-lifecycle.md`.
- Rules are ordinary C# behind `ICanonIntegrityRule`, registered in one list, no DSL. All
  three are structural: they read canon status on records the model already links and never
  a field's meaning, so no semantic field name is hardcoded anywhere. `CANON-REL-001`
  (Canon relationship resting on a non-Canon endpoint), `CANON-TIME-001` (Canon moment with
  a non-Canon participant), `CANON-FIELD-001` (Canon entity whose entity-reference field
  points at a non-Canon entry). All Medium. Severity is recorded and wired to nothing:
  no promotion gate yet, and no rule emits High.
- Canon Integrity API: `/api/universes/{universeId}/canon-conflicts` - list with severity,
  status and paging under a deterministic order (pending first, then worst severity, then
  oldest, then id), get one, `POST /evaluate`, `POST /{id}/dismiss`, `POST /{id}/reopen`.
  No route takes a body.
- Timeline: a `TimelineEntry` is a chronology record, not a lore entity - a moment in one
  universe that may name any number of entities without an Event entity existing. Links
  live in `TimelineEntryLinks`, one row per entity. Deleting an entity drops its
  participation and leaves the moment standing.
- Chronology is signed integer components, not `DateTime` and not JSON: `StartYear`,
  `StartMonth`, `StartDay`, `EndYear`, `EndMonth`, `EndDay`, a `DateKind` and an optional
  `EraLabel`. Exact and Approximate take a start only, Range takes both ends and may not
  end before it starts, Unknown takes nothing. Month and day stay optional, a day needs a
  month and a month needs a year, and years may be negative. UTC `DateTime` is used for
  `CreatedAt` and `UpdatedAt` only. See
  `docs/architecture/decisions/0009-fictional-chronology.md`.
- Timeline API: CRUD under `/api/universes/{universeId}/timeline`. The listing orders
  chronologically in SQL so paging is stable, filters by canon status and by a
  participating entity, and returns the chronology as numbers plus a derived precision.
- Relationships: one `LoreRelationship` row per link, with a universe-scoped
  `RelationshipType` carrying the forward name, the inverse name and a symmetric flag. The
  reverse reading is derived at read time, never stored twice. A type cannot be deleted
  while in use. See `docs/architecture/decisions/0008-relationship-direction.md`.
- Lore: one generic `LoreEntity` per universe. Its kind comes from an `EntityType` the
  author owns, its fields from `EntityFieldDefinition` rows on that type. Values are stored
  in typed columns, never JSON. Eight field kinds, including select, multi-select and an
  intra-universe entity reference. Idea/Draft/Canon status; aliases; universe-scoped tags.
  Search covers name, aliases and summary.
- Article content is a Tiptap document, validated structurally; link schemes are limited to
  http, https and mailto on both sides.
- Every lore, relationship, timeline and conflict route proves universe ownership first,
  then re-resolves every client id inside that universe. Cross-universe access answers 404
  with an empty body.
- Deleting a type, field or option is refused while it still holds authored data.
- Web: `/app/universes/:id/lore` browser, `/lore/:entityId` dossier with in-page editing,
  `/types` for custom types, fields and relation kinds, `/timeline` for the chronology.
  The timeline is a vertical spine, not a table: the year sticks to its run, the marker
  encodes the kind, undated moments hang below a broken rule, and the client formats from
  the numeric components and the precision the API sends. Create, edit and delete run
  through one `<dialog>` drawer that reveals only the components the chosen kind allows.
  **No Canon Integrity UI exists yet.**
- Universes: create, read, update, archive, unarchive, delete once archived.
- Auth: ASP.NET Core Identity with a cookie session.
- Tests: 180 API integration tests (34 for Canon Integrity), 38 Playwright tests. The
  Canon Integrity tests cover detection, each of the three rules, idempotence across
  repeated evaluation, a rename refreshing rather than duplicating, a fingerprint change
  on materially different facts, the whole lifecycle - dismissal surviving an unchanged
  re-evaluation, resolving once the issue is fixed, and returning as Pending when the same
  issue comes back - a repointed field and a half-fixed relationship not inheriting a
  dismissal, both filters, deterministic paging, and the owner and universe boundaries from
  both directions.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`, `AddUniverses`,
  `AddLoreEntities`, `AddRelationships`, `AddTimeline`, `AddCanonIntegrity`. Verified
  against a fresh SQLite database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd`.

## Current phase

Phase 012, `chore/012/rtk-token-trial`, branched from `dev`. Tooling only - no Canon
Integrity work in this branch.

RTK 0.48.0 installed user-scoped from the official release zip, checksum verified against
the release `checksums.txt`, no admin. The project `PreToolUse` / `Bash` hook calls
`.claude/hooks/rtk-safe-hook.ps1`, not `rtk hook claude` directly: RTK answers
`permissionDecision: "allow"` for everything it rewrites, so the wrapper keeps its
`updatedInput` and strips every permission decision. RTK compresses; it never authorizes.
Failure is silent - RTK missing, crashing or emitting bad JSON produces no decision and no
rewrite, and the command follows Claude's normal flow. Nothing lives in the global config;
`rtk init -g` was run once to inspect it, then reverted with `--uninstall`.

The wrapper also refuses semantic substitution. RTK does not merely prefix commands: it
turns `npm run lint` into `rtk lint` (ESLint, while this repo uses oxlint), drops `npx` from
`npx tsc` and `npx playwright test`, turns `cat` into `rtk read`, and rewrites each element
of a chain separately. Two rules, no shell parsing: a command containing `&&`, `||`, `;`,
`|`, a newline, a backtick or `$(` bypasses RTK entirely; otherwise the rewrite is accepted
only when it is exactly the original with a literal `rtk ` prefix and nothing else in
`tool_input` changed. No per-tool special cases. Correctness beats filtering coverage, and a
rejected rewrite just runs normally. Manual `rtk <cmd>` and `rtk proxy <cmd>` still work.

Probes are static: 29 payloads across safe, repo-script, substitution, compound and
dangerous groups. Every accepted rewrite is a pure `rtk ` prefix; `npm run lint`, `npx ...`,
`cat`, `dotnet test`, `git merge`, `git remote` and all compound forms bypass; no permission
decision anywhere; six failure modes silent. **A Claude Code restart or a new conversation is
needed before the wrapper is live**, so real behaviour in a running session is not yet
observed.

Graphify is untouched: package, skill, `graphify-out/` and manual invocation all stay, and
the noisy automatic hooks from Phase 011 were not restored. The two tools solve different
problems - Graphify explores the codebase, RTK compresses shell output.

File reads stay on Claude's built-in `Read`/`Grep`/`Glob`. `rtk read`/`grep`/`find` are
deliberately not adopted. `rtk proxy <command>` is the verified unfiltered escape hatch and
every use of it is logged.

Baseline (raw -> RTK): `git status` 302 -> 53 B, successful `dotnet build` 488 -> 64 B,
`npm run typecheck` 48 -> 18 B, `npm run lint` 34 -> 9 B. `git log --oneline` and a
**failing** build are passed through untouched - diagnostics are preserved by design.
`rtk gain` after the baseline: 7 commands, 185 tokens, 5.0%. Shell bytes only, not a
measure of Claude's overall token use.

Method and per-task reporting: `docs/tooling/agent-tooling-trial.md`. Evaluate RTK and
Graphify independently after **3-4 real implementation tasks**, then Keep / Conditional /
Remove. No verdict in Phase 012.

## Immediate next step

Phase 013: `feat/013/canon-integrity-rules`, branched from `dev`. Canon Integrity rules
resume there, with RTK and Graphify reported on per the trial method.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev`
and is the GitHub default branch. `master` is reconciled and published; `dev` -> `master`
merges are ordinary.

## Tooling

Project-scoped plugins in `.claude/settings.json`: caveman, humanizer, frontend-design,
playwright, security-guidance. Skills in `.claude/skills/`: `aspnet-core-guidance`,
`graphify`. Usage rules for both tools live in `.claude/CLAUDE.md`; the root `CLAUDE.md`
stays a router.

**RTK** (`%USERPROFILE%\.local\bin\rtk.exe`, on the user PATH) filters shell output through
a project-scoped `PreToolUse` hook that runs `.claude/hooks/rtk-safe-hook.ps1`. The wrapper
is permission-neutral: it forwards the payload to `rtk hook claude`, preserves the rewrite
and removes `permissionDecision` / `permissionDecisionReason` (and the legacy
`decision`/`reason` pair), so authorization stays with Claude Code. `permissions.ask` covers
push, force-push, merge, branch deletion, remote changes and PR create/merge, bare and
`rtk`-prefixed, as an independent second layer. There is no blanket `Bash(rtk *)` allow.

**Graphify** stays manual-only, installed under the WindowsApps Python rather than on
`PATH`: `python -m graphify update .` (AST only, no API cost). Nothing invokes it unless
asked.

## Deferred

- **Full security audit still deferred** across relationships, timeline and Canon
  Integrity. Each got a focused main-session check backed by tests. What remains is the
  wider work: rate limiting, header and cookie hardening, dependency review, and a
  deliberate look at the auth surface.
- Cross-era ordering is not solved. `EraLabel` is display metadata and takes no part in the
  sort, so a Second Age 3441 sorts after a Third Age 3018 even though it is earlier in the
  story. The fallback is deterministic, not correct. Making it correct needs eras to be
  first-class rows with an order and an offset. The page says so when more than one
  reckoning is present, and Playwright pins that behaviour.
- Evaluation only runs when asked. Nothing triggers it on write, so a conflict list is as
  fresh as the last evaluation and no more.

## Blockers

None. Follow-up, not blocking: the lore article is not searched - name, aliases and summary
are. Full-text search over the Tiptap document needs SQLite FTS rather than a LIKE over
editor JSON. Production deployment will need a persisted Data Protection key ring so cookie
sessions survive a restart - see
`docs/architecture/decisions/0005-cookie-authentication.md`.
