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

**Only detection runs, never reconciliation.** The gate calls the rules and stops there.
Nothing is opened, resolved, reopened or refreshed on the way to a refusal, so the recorded
conflicts - the author's dismissals included - are exactly as they were. Evaluation stays
the only thing that writes to the conflict table, and it stays explicitly triggered.

**The candidate is applied for real and rolled back.** The rules read the database, not the
change tracker, so there is no way to ask them about lore that exists only in memory. A
transaction is what makes the refusal atomic from the caller's side. The change tracker is
cleared after the rollback so the abandoned rows cannot be saved again later in the request.

**The gate is one service, entered from the routes that can actually reach it.** Gated:
entity create and update - which is where Canon status, structured field values and
therefore declared years are written - timeline create and update, and the field-definition
update that declares what a field *means*.

Not gated, each for a stated reason rather than by omission:

| Path | Why not |
| --- | --- |
| every delete | Every High rule reads facts a record contributes. Removing one can only take findings away. |
| adding a field definition | A field that has just been created holds no values, so its declared meaning has nothing to read. |
| all relationship writes | No High rule reads a relationship. `CANON-REL-001` does, and it is Medium. |

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
- **A High conflict can no longer be authored through the API at all.** Every route that
  could reach one refuses. The only way one exists is lore settled before this phase, which
  is precisely the case the gate is built to tolerate - and it is how the rule tests now
  seed their fixtures, since they are about detection rather than about the gate.
- A gated write costs two rule sweeps. They are the same queries evaluation already runs
  over one universe, and the ungated paths above are ungated partly to keep that off the
  cheap routes.
- Entity update's own delete-then-insert transaction joins the gate's rather than nesting,
  which SQLite does not support. Run ungated it still opens its own.
- Nothing is gated by *asking* for it. A route is gated because its handler is wrapped, so
  a new write path is ungated until someone wraps it. That is the same trade as ADR 0010's
  explicit rule list: visible in one place, not inferred.
- The gate reads severity from the finding, not from the recorded conflict, so a rule whose
  severity changes changes what blocks, with no data migration.
