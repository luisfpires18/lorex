# ADR 0012 - High conflicts block only the write that introduces them

Status: accepted (2026-09-09)

## Context

Phase 010 defined `High` as logically incompatible or structurally impossible, and wired it
to nothing. Phase 013 produced the first rules that emit it: a lifespan that runs backwards,
and a Canon moment outside a Canon participant's lifespan. Severity now has to mean
something, and the obvious reading - a universe with a High conflict is not in a fit state
to be written to - is the wrong one.

A world in progress is contradictory most of the time. An author who has settled a death
year and not yet corrected the birth year, or who promoted a battle before fixing who was
at it, is doing ordinary work. Refusing every write until the universe is clean would stop
them fixing the very thing that is wrong by any route except the one that deletes it, and
would let one stale conflict lock an unrelated corner of a large world indefinitely.

The opposite failure is just as real: if nothing is refused, `High` is documentation.

## Decision

**A write is refused when it introduces a High finding that was not already there.** Not
when the universe contains one.

The unit of comparison is the fingerprint, which ADR 0010 already established as the
identity of a problem across runs. Around each gated write:

1. Open a transaction and collect the High fingerprints the universe currently produces.
2. Apply the candidate write.
3. Collect the High fingerprints it produces now.
4. Any fingerprint in the second set and not in the first: roll back, answer 409.
5. Otherwise commit, and the write is ordinary.

A count would not do. Comparing counts lets a write swap one contradiction for another
without either being noticed, and a fingerprint set does not.

**Nothing is reconciled until the candidate is accepted.** On the way to a refusal the gate
only detects: nothing is opened, resolved, reopened or refreshed, so the recorded conflicts -
the author's dismissals included - are exactly as they were. A rejection cannot leak a
statement about lore that no longer exists.

**An accepted candidate is reconciled, inside the same transaction.** It is the lore now, so
the conflict table has to describe it. The findings collected to make the decision are the
accepted state, so they are reconciled directly rather than gathered a third time - which
also removes any chance of the table describing lore re-read a moment later. The evaluator's
reconciliation is split into `ReconcileAsync(universeId, findings)`, and `EvaluateAsync` is
now detect-then-reconcile over the same method, so `POST /evaluate` and a gated write share
one implementation and every lifecycle rule in ADR 0010 holds unchanged in both.

Reconciliation happens before the commit, not after it. Lore and conflicts are one
transaction: they land together or neither lands.

**The candidate is applied for real and rolled back.** The rules read the database, not the
change tracker, so there is no way to ask them about lore that exists only in memory. A
transaction is what makes the refusal atomic from the caller's side. The change tracker is
cleared after the rollback so the abandoned rows cannot be saved again later in the request.

**The gate is one service, entered from the routes that can actually reach it.** Gated:
entity create and update - which is where Canon status, structured field values and
therefore declared years are written - timeline create and update, and the field-definition
update that declares what a field *means*.

**Gating and reconciling are separate questions with different answers.** A write is gated
only where it can introduce a High finding. It is reconciled wherever it changes anything any
rule reads, whatever the severity. So the gate has a second entry point, `RecordAsync`, which
is the same transaction and the same `DetectAsync`/`ReconcileAsync` with no baseline and no
comparison - there is nothing on those routes to refuse, and a second rule sweep to prove it
would be waste.

Reconciled but not gated, each for a stated reason rather than by omission:

| Path | Why not gated | Why still reconciled |
| --- | --- | --- |
| entity, timeline delete | Every rule reads facts a record contributes, so removing one only takes findings away. | A conflict about lore that no longer exists is worse than no conflict. |
| relationship create, update, delete | No High rule reads a relationship. | `CANON-REL-001`, `-002` and `-003` do, and Medium findings are still findings. |
| relationship type update | A rename changes no fact any rule tests, and neither does a Canon constraint: it changes the rule being checked, and both constraint rules are Medium (ADR 0023). | `CANON-REL-001` quotes the type's name in the sentence it stores, and the name is not in the fingerprint, so the same conflict is reworded in place. `CANON-REL-002` and `-003` read the type's constraints, so a change can open or resolve conflicts on every link of the type. |

Neither gated nor reconciled: adding a field or relationship type, neither of which anything
references yet. Deleting a type, field or option is refused outright while it holds authored
data, so it cannot change a finding either.

**Ownership is proved before the gate is entered**, so an unauthorised request answers the
same empty 404 as before and never costs a rule sweep over lore that is not the caller's.

**The refusal is ProblemDetails with two extensions**, matching every other 409 on this API
while staying machine-readable: `code` is the constant `canon_promotion_blocked`, and
`blockingFindings` carries each finding's rule code, severity, fingerprint, title,
explanation and subject ids. Subject names are not resolved: the candidate they describe has
been rolled back, and the ids are what a client needs to link to the lore that is stored.
Everything in the payload is inside the universe the caller has already proved they own.

## Consequences

- An existing High conflict blocks nothing, dismissed or not. That is the point.
- Re-saving lore that is already contradictory succeeds, because its fingerprint is in the
  baseline. Otherwise a mistake would be unfixable except by deleting it.
- Low and Medium never block. A Canon moment resting on a draft character is still ordinary
  work in progress and still reported.
- **No currently gated authoring route can persist a new High contradiction.** Taken
  together the wrapped routes close every path a rule reads: entity create and update carry
  canon status and the declared years, timeline create and update carry a moment's date,
  canon status and participants, and the field-definition update carries the meaning that
  makes a year a year. The ungated paths cannot introduce one either, for the reasons given
  in the table above - they either only remove facts, or write nothing any High rule reads.

  This is a statement about the routes as they stand, not about the table. A stored High
  conflict remains an expected state, from three directions: lore settled before this phase,
  data loaded outside the API - a restore, an import, a direct write, a rule set whose
  severities changed between releases - and any future write path, which is ungated until
  someone wraps it. Tolerating those is the whole point of comparing fingerprint sets rather
  than counting.

  The practical consequence is that an "existing High conflict" cannot be *constructed*
  through the product. End-to-end tests driving the UI or the API can only reach the
  refusals; the rule tests seed their fixtures beneath the gate, because they are about
  detection rather than about the gate.
- A gated write costs two rule sweeps and, when accepted, a reconciliation. They are the
  same queries and writes `POST /evaluate` already performs over one universe, and the
  ungated paths above are ungated partly to keep that off the cheap routes.
- The conflict list is current for every route that can change a finding or the wording of
  one, gated or not. `POST /evaluate` remains for lore altered outside the API, for a rule set
  that has changed between releases, and as the way to re-derive the whole table on demand.
- Reconciling a rename costs nothing beyond a rule sweep and needs no special case, because
  ADR 0010 already put names outside the fingerprint and `Refresh` already rewrites the title,
  explanation and subjects of a matching conflict whatever its status. A dismissal survives a
  rewording, which is the behaviour that decision was made for.
- Entity update's own delete-then-insert transaction joins the gate's rather than nesting,
  which SQLite does not support. Run ungated it still opens its own.
- Nothing is gated by *asking* for it. A route is gated because its handler is wrapped, so
  a new write path is ungated until someone wraps it. That is the same trade as ADR 0010's
  explicit rule list: visible in one place, not inferred.
- The gate reads severity from the finding, not from the recorded conflict, so a rule whose
  severity changes changes what blocks, with no data migration.
