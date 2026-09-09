# ADR 0015 - An entry is trashed by a marker, and nothing that points at it is destroyed

Status: accepted (2026-09-09)

## Context

`DELETE /api/universes/{id}/entities/{entityId}` removed a row. Because the schema is honest
about what depends on an entry, that one row took a great deal with it: its aliases, its tags,
its stored values, its whole revision history (ADR 0013 made `EntityId` a cascading key and
said Trash was a later concern - this is it), every relationship it stood at either end of, and
every timeline participation naming it. References held by *other* entries were set to null.

None of that was recoverable, and the confirmation said so. It is the only place in Lorex where
one click destroys a large amount of authored work. Universe deletion is the other, and it is
already gated behind archiving.

The hard part is not hiding a row. It is deciding what happens to everything that points at one.

## Decision

**Only lore entries are trashable.** Everything else the API deletes is either one small row a
deliberate action removed (a relationship, a moment), a derived record nothing authors (a Canon
conflict - ADR 0010), or a configuration object whose deletion is already refused while anything
depends on it (a type, a field, an option, a relationship type). An entry is the one thing whose
removal used to destroy work at scale, so it is the one thing with a Trash. This is not a
recycle bin for the object model.

**The Trash is a marker, not a table.** `LoreEntity.DeletedAt` is a nullable UTC timestamp; null
is live. A dedicated trash record would have to answer the same question the marker answers for
free: every dependent row is a foreign key to `Entities.Id`, so taking the row out of the table
means either cascading those away - destroying exactly the lore this ADR exists to protect - or
copying the graph into a parallel schema and replaying it, at which point a restore becomes a
rebuild that can fail halfway. With a marker there is nothing to rebuild. A timestamp rather
than a flag, because the Trash listing has to say when, and two columns that must agree is one
too many.

**Not a global query filter.** EF Core's `HasQueryFilter` follows navigations, and the reads
that must see a trashed entry (the backup, the Trash itself) and the reads that must not
(browse, search, pickers, every Canon rule) reach it through those same navigations.
`IgnoreQueryFilters` is all-or-nothing per query and could not separate them, so a filter would
be silently right in one place and silently wrong in another. Every read states which it wants.

**Nothing dependent is deleted, and one rule decides what is shown.**

> Hide what nothing rewrites. Mark what something rewrites.

| Dependency | While the entry is trashed | On restore |
| --- | --- | --- |
| Relationships (either end) | Stored; hidden from every read, and refused for edit and delete | Reappear, both readings intact |
| Timeline participation | Stored; **shown** on the moment, flagged `isTrashed` | Flag clears |
| An entity-reference value on another entry | Stored; **shown** on that entry, flagged `referencedEntityIsTrashed` | Flag clears |
| Aliases, tags, values, article | Stored, unreachable | Come back whole |
| Revision history | Stored, unreachable | Readable again, unchanged |

The split is derived rather than arbitrary. A relationship is a row of its own that no client
posts back, so hiding it destroys nothing. A moment's participant set and an entry's field set
are both sent back **whole on every save**, so a hidden one would be deleted the next time the
author edited the date or an unrelated field. Those two are therefore shown and marked, and
their write paths deliberately still accept a trashed id - refusing it would turn any unrelated
edit into a validation failure. Discoverability is the picker's job: the entity listing never
offers a trashed entry, so a *new* reference or participation cannot be authored against one.
Creating a relationship, by contrast, does refuse a trashed end, because nothing round-trips it.

**A trashed entry contributes no facts.** Every Canon rule reads only live entries. Trashing
therefore runs through `CanonPromotionGate.RecordAsync` - reconciled, not gated - because
removing lore can only take findings away and there is nothing to refuse; findings about the
entry resolve on the trash write itself, so nothing stays actionable about lore that is not in
the world. Restoring runs through `RunAsync`, because it adds facts back and any of them can
newly contradict what was written meanwhile. A restore that would introduce a High fingerprint
the universe does not already carry is refused with the same 409 as any other write, rolled back
whole, and the entry is still in the Trash afterwards. Medium and Low block nothing (ADR 0012).

**Nothing revalidates a restore, because nothing can have gone stale.** The entry's type cannot
have been deleted (the key is `Restrict`, and a trashed entry still counts as using it - the
refusal message says the Trash counts), nor can a field definition holding one of its values or
an option one of them chose. So a restore puts back exactly the rows that were stored, and canon
is the only thing that can refuse it.

**Neither trashing nor restoring writes a revision.** They change no authored content, and ADR
0013 already says a write that changed nothing writes nothing; adding `Trashed` and `Restored`
kinds would make history an event log, which it is deliberately not. This makes two restores
worth distinguishing: **restoring from the Trash** reconstructs the stored entry and leaves the
history exactly as long as it was, while **restoring a revision** replays an older snapshot
through the ordinary update and writes a new version. Only the second is history.

**A restore never renames and never refuses on a name.** Entry names are not unique inside a
universe - the index on `(UniverseId, Name)` is not unique and never was - so a name written
while an entry sat in the Trash cannot collide with it. Both stand.

**No permanent delete.** Deferred, on the reading that a recovery phase should not ship the
thing it is recovering from. `DELETE` keeps its route and its 204 and now means "move to Trash";
the wording throughout the client says recovery is available.

**A backup carries the Trash.** Trashed entries are authored lore the owner has not thrown away
irrecoverably, so `BackupEntity.DeletedAt` travels with them (ADR 0014). That bump is argued
there.

## Consequences

- **A type used only by trashed entries cannot be deleted, and there is no way to free it**
  except restoring the entry, moving it to another type, and trashing it again. That is the
  price of deferring permanent deletion, and it is recorded as an owner decision in `STATE.md`
  rather than papered over. The refusal names the Trash so the author is not told to move
  something invisible.
- Nothing shrinks. A universe's row count only ever grows until the universe itself is deleted,
  which is the one remaining path that still cascades an entry's history away.
- Every read of `Entities` now has to say whether it wants live rows. A new query that forgets
  is a leak of trashed lore into the world, and the suite pins the paths that exist today rather
  than the model preventing it structurally - the tradeoff taken over a query filter above.
- Tag counts and the entity listing exclude trashed entries, so the browse filter never promises
  a result it will not return. The entity type's own `entityCount` includes them, because that
  number is what the deletion refusal is about.
- A trashed entry's page, its history and its relationships all answer 404. It is not editable,
  and trashing one twice is refused rather than re-stamped, so the moment it was thrown away
  cannot be moved by a repeated click.
