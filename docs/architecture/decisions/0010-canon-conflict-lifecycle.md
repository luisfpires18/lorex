# ADR 0010 - Canon conflicts are derived findings keyed by a fingerprint

Status: accepted (2026-09-08)

## Context

Canon Integrity finds problems in lore: a relationship marked Canon whose endpoint is
still a Draft, a settled moment resting on a character that is not settled. Detection has
to run repeatedly, because the lore it reads changes under it, and each run has to decide
what to do about the problems it already recorded on the last one.

Two things make that awkward. Nothing about a finding is authored, so there is no natural
key to match one run's findings against another's; and a conflict points at heterogeneous
records - an entity, a relationship, a timeline entry, a field - which no single foreign
key can express.

Getting the first wrong duplicates every conflict on every run, or silently loses the one
piece of state the author does own: that they have already seen a problem and chosen to
live with it.

## Decision

**Conflicts are derived, never authoritative.** Lorex records that something looks wrong
and changes nothing about the lore it describes. The whole table is regenerable from the
lore by evaluating again, apart from the author's dismissals.

**A fingerprint identifies a problem across runs.** It is a SHA-256 over the rule code and
the ids the finding is about, unique per universe and enforced by the database rather than
by the evaluator looking first. A cryptographic hash, not `GetHashCode`, which is
randomized per process and would give the same problem a different key after a restart.

Only ids go in - never a name, never a wording. So renaming a character rewords its
conflict in place, while a materially different set of records opens a new conflict and
resolves the old one. `CANON-FIELD-001` fingerprints the *field definition* rather than
the stored value row, whose id is rewritten every time the entity is saved.

**Three statuses, and evaluation owns two of them.**

| Transition | Who | When |
| --- | --- | --- |
| → `Pending` | evaluation | a finding with no stored conflict |
| → `Resolved` | evaluation | a `Pending` conflict no longer found |
| `Resolved` → `Pending` | evaluation | the same fingerprint detected again |
| → `Dismissed` | the author | explicitly, on a live conflict |
| `Dismissed` → `Pending` | the author | explicitly |

A `Dismissed` conflict is never reopened by evaluation, and evaluation never resolves one
either. Dismissing is a decision about the issue, not about one sighting of it; reopening
it on the next run would undo that decision every few seconds, and resolving it would
quietly discard the record of a judgement the author made. A dismissal covers exactly one
fingerprint, so materially different facts still raise a new `Pending` conflict.

The author cannot dismiss or reopen a `Resolved` conflict. Dismissing one would suppress
the issue for good, since a dismissal is never reopened automatically; reopening one would
claim the issue is live when the last evaluation found it gone. Both answer 400.

**Subjects are a relational reference table, not JSON and not many nullable keys.**
`CanonConflictSubjects` carries `(ConflictId, SubjectKind, SubjectId, Role)`. The role is
part of the key because one record can appear twice in a conflict - the entity holding a
field and the entity it points at are both entities. There is deliberately no foreign key:
the target lives in one of several tables. Only kinds the current rules produce exist:
`Entity`, `Relationship`, `TimelineEntry`, `EntityField`.

## Consequences

- Evaluation is idempotent. A second run over unchanged lore leaves the table exactly as
  the first left it, `UpdatedAt` included, which is what the tests assert.
- A conflict id is stable across evaluations, so a client can link to one and a later run
  will not have replaced it.
- A subject can dangle: deleting lore leaves its subject rows until the next evaluation,
  and the API returns a null name for one rather than resolving outside the universe. Both
  lookups and rules are universe-scoped, so nothing crosses that boundary either way.
- Subject names cost one small query per kind present, rather than a projection that would
  left-join four tables per row.
- Severity is recorded but wired to nothing. `High` is defined as logically incompatible
  or structurally impossible, and a later promotion-gate phase will use it to refuse the
  action that introduces one. Nothing blocks yet, and no current rule emits `High`.
- Rules stay ordinary C# registered in one readable list. No DSL, no assembly scan: a rule
  is live because it is listed, not because it happens to implement the interface.
- Evaluation is only ever triggered by an explicit request. Nothing runs it on write, so a
  conflict list is as fresh as the last evaluation and no more.
