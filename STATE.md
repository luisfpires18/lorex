# STATE

## Current state

Phase 013 (Canon Integrity chronology rules) complete on its branch. The backend half of
Canon Integrity exists: persistence, a rule engine, six rules, and a review API. No UI.

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
- Rules are ordinary C# behind `ICanonIntegrityRule`, registered in one list, no DSL. Three
  are structural and Medium: they read canon status on records the model already links.
  `CANON-REL-001` (Canon relationship resting on a non-Canon endpoint), `CANON-TIME-001`
  (Canon moment with a non-Canon participant), `CANON-FIELD-001` (Canon entity whose
  entity-reference field points at a non-Canon entry).
- Three are chronological and High. `CANON-LIFE-001` (declared birth year after declared
  death year), `CANON-LIFE-002` (Canon moment wholly before a Canon participant's birth),
  `CANON-LIFE-003` (wholly after its death). Severity is still wired to nothing - no
  promotion gate yet.
- Semantic field codes: `EntityFieldDefinition.Semantic`, a nullable `EntityFieldSemantic`
  scalar column - `BirthYear`, `DeathYear`, `Age`. Optional, null by default, and the only
  way a rule learns what a field is about. No display name is ever matched and no meaning is
  inferred. Every member is valid on `Number` only, because fictional time is signed integer
  years and `DateValue` is a Gregorian `DateTime` that does not compare with it. At most one
  field per type per meaning, enforced at the edge and by a filtered unique index. `Age` is
  declarable but read by nothing: an age is a claim about a moment and the model cannot say
  which. See `docs/architecture/decisions/0011-semantic-field-codes.md`.
- The chronology rules only report what is provable. Approximate and undated moments are
  skipped; a range counts only when it ends before a birth or starts after a death; birth
  equal to death, and a moment in the year of a birth or death, are all legal. A universe
  whose timeline uses more than one named era gets no chronology findings at all, because a
  declared birth year names no era.
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
- Tests: 217 API integration tests (71 for Canon Integrity), 38 Playwright tests. The
  structural half covers detection, each rule, idempotence, a rename refreshing rather than
  duplicating, a fingerprint change on materially different facts, the whole lifecycle, both
  filters, deterministic paging and the ownership boundaries. The chronology half adds
  semantic field assignment and its validation, each chronology rule, both boundaries, every
  case Lorex must stay quiet on - approximate dates, straddling ranges, two eras, drafts,
  and a field named "Birth Year" that declares nothing - a rename not affecting detection,
  moving a meaning to another field opening a new conflict, and fix-then-break returning to
  Pending.
- Migrations: `InitialCreate`, `AddIdentity`, `UniqueUserEmail`, `AddUniverses`,
  `AddLoreEntities`, `AddRelationships`, `AddTimeline`, `AddCanonIntegrity`,
  `AddEntityFieldSemantics`. Verified against a fresh SQLite database.
- Launcher: `Start-Lorex.cmd` / `Stop-Lorex.cmd`.

## Current phase

Phase 013 complete and merged into `dev`. Semantic field codes and `CANON-LIFE-001`,
`CANON-LIFE-002` and `CANON-LIFE-003` are done. Current branch is `dev`. Merged from
`feat/013/canon-integrity-rules`, 3 commits, `--no-ff`, no conflicts. Feature branch
retained. `dev` published to `origin/dev`. Backend only. Release build clean, 217/217 API
tests green, all nine migrations verified against a fresh SQLite file.

Detection only. Promotion is **not** gated: a High conflict blocks nothing yet, which is
Phase 014's job.

Rules deliberately left out. **Exclusive relationship overlap**: `RelationshipType` has a
forward name, an inverse name and a symmetric flag, and `LoreRelationship` carries no
interval, so there is nothing to overlap and no way to mark a type exclusive - it would mean
inventing schema to justify a rule. **Age consistency**: an age is a claim about a moment and
nothing records which moment; inferring a current year would be inventing a fact. The `Age`
semantic exists so the meaning can be declared, and waits for a structured reference year.
**Invalid ranges** are refused at write time already and are not re-reported as conflicts.

Tooling trial, task 1 of 3-4. RTK 0.48.0 and Graphify are judged independently; method,
probes and per-task results live in `docs/tooling/agent-tooling-trial.md`.

- **Graphify: unused.** Targeted reads were sufficient for a narrow vertical slice through
  files `SYSTEMS.md` already names.
- **RTK: inconclusive.** The hook itself worked - it went live in a fresh conversation and
  behaved exactly as designed, a pure-prefix rewrite with no permission decision. The
  executable was then unavailable to the host's stale PATH, so every rewritten command
  failed with `rtk: command not found` and nothing was filtered. `rtk gain` is unchanged
  from the Phase 012 baseline, confirming it ran nothing. No command executed with altered
  meaning.
- **A fresh host or session must re-measure RTK** before any verdict. Measuring it again on
  this host without a restart would record another zero.

## Immediate next step

Phase 014: `feat/014/canon-promotion-gates`, branched from `dev`. High severity now has a
meaning to enforce: refuse the promotion that would introduce a provable contradiction, and
decide what the author is told when it is refused. Nothing in 013 needs another backend
slice first.

Task 2 of the tooling trial runs with it.

## Remote

`origin` = https://github.com/luisfpires18/lorex.git (private). `dev` tracks `origin/dev`
and is the GitHub default branch. `master` is reconciled and published; `dev` -> `master`
merges are ordinary.

## Tooling

Project-scoped plugins in `.claude/settings.json`: caveman, humanizer, frontend-design,
playwright, security-guidance. Skills in `.claude/skills/`: `aspnet-core-guidance`,
`graphify`. Usage rules for both tools live in `.claude/CLAUDE.md`; the root `CLAUDE.md`
stays a router.

**RTK** (`%USERPROFILE%\.local\bin\rtk.exe`, on the Windows user PATH) filters shell output
through a project-scoped `PreToolUse` / `Bash` hook that runs `.claude/hooks/rtk-safe-hook.ps1`.
The wrapper is permission-neutral: it forwards the payload to `rtk hook claude`, preserves
the rewrite and removes `permissionDecision` / `permissionDecisionReason` (and the legacy
`decision`/`reason` pair), so authorization stays with Claude Code. It accepts a rewrite only
when it is exactly the original with an `rtk ` prefix, and bypasses anything containing
`&&`, `||`, `;`, `|`, a newline, a backtick or `$(`. `permissions.ask` covers push,
force-push, merge, branch deletion, remote changes and PR create/merge, bare and
`rtk`-prefixed, as an independent second layer. There is no blanket `Bash(rtk *)` allow.

**RTK is currently non-functional in the `Bash` tool** and rewritten commands fail with
exit 127. `rtk.exe` is on the user PATH in the registry but not in the running desktop app's
environment, which was snapshotted before RTK was installed. `~/.bashrc` does not help - the
tool runs `bash -c`, which sources no profile. Restart the desktop app. The `PowerShell`
tool is unaffected, because the hook matches `Bash` only.

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
  reckoning is present, and Playwright pins that behaviour. It now bounds a rule as well:
  the chronology rules stand down entirely for a universe using more than one named era.
- An age rule needs a structured way to say **when** an age was true - a reference year on
  the fact, or an age recorded against a timeline entry. Until one exists, `Age` is a
  meaning Lorex records and reasons about nothing.
- Evaluation only runs when asked. Nothing triggers it on write, so a conflict list is as
  fresh as the last evaluation and no more.

## Blockers

None. Follow-up, not blocking: the lore article is not searched - name, aliases and summary
are. Full-text search over the Tiptap document needs SQLite FTS rather than a LIKE over
editor JSON. Production deployment will need a persisted Data Protection key ring so cookie
sessions survive a restart - see
`docs/architecture/decisions/0005-cookie-authentication.md`.
