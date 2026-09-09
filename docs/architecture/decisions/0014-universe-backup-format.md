# ADR 0014 - A backup is one versioned JSON file holding a universe's authored data

Status: accepted (2026-09-09)

## Context

Lorex is private, single-owner and runs on the author's own machine against a SQLite file
(ADR 0002, ADR 0006). The only copy of a world is that file, and nothing in the product has
so far let an author take one away with them.

Copying the database is not a backup of a universe. It carries every universe, every
account, the Identity tables and whatever the installation happened to be configured with,
and it is readable only by the exact schema version that wrote it. What an author wants is
their world, portable, and checkable by eye.

The hard part is not serialising rows. It is deciding which rows are a world.

## Decision

**One file, JSON, universe-scoped.** No archive: there is nothing to put beside the data -
media is not in the product - so a container would be structure for its own sake. JSON is
the interchange format here, not general-purpose storage, so ADR 0007's objection to JSON
in the database does not apply. The one JSON that is already stored as JSON, the Tiptap
article, travels as the exact string the column holds, never re-parsed and re-emitted, so it
round-trips byte for byte.

**An explicit envelope, and a version on it.** `format` is `lorex.universe.backup` and
`formatVersion` is an integer, so a reader can refuse a file that is merely JSON, and a
future importer can tell which contract it is looking at. The version is bumped when the
payload's shape or meaning changes in a way a reader must notice.

**Only the authored data.** The test for inclusion is: did a person write this, or would
Lorex produce it again from what a person wrote?

| Carried | Left out |
| --- | --- |
| Universe name, description, accent, archived flag, timestamps | `OwnerId` |
| Entity types, field definitions with their declared `Semantic`, options | - |
| Entries: name, summary, Tiptap article, canon status, archived flag | - |
| Aliases, tags, stored values including entity references | Alias and value row ids |
| Relationship types and relationships | - |
| Timeline entries, their signed date components and era labels, participants | Derived date precision |
| Every entry's revision history (ADR 0013) | - |
| Canon conflicts the author **dismissed** | Pending and resolved conflicts, and all conflict wording |
| | Tag `Slug` |
| | Identity tables, configuration, connection strings, file paths |

Three of those are the decisions worth stating.

**`OwnerId` is not in a backup.** It names an Identity row that means nothing outside the
installation that issued it. Carrying it would make the file a backup of an account rather
than of a world, and would leak an internal user id into a file the author may share.

**Canon conflicts are rebuilt; dismissals are not.** ADR 0010 already establishes that the
conflict table is regenerable from the lore by evaluating again, apart from the author's
dismissals. So the findings themselves - titles, explanations, subjects, pending and
resolved rows - are left out: they are derived, and a backup carrying stale wording could
disagree with the lore in the same file. A dismissal is the opposite. Nobody re-derives "I
have seen this and I am fine with it", and losing it means every suppressed problem comes
back on the first evaluation after a restore. Each one is carried as its rule code,
severity, fingerprint and the moment it was dismissed. The fingerprint is enough to re-apply
it, because it hashes only the rule code and the ids of the records at fault - and this
backup preserves those ids.

**Ids that identify nothing are dropped.** An alias row, a stored value row and a revision's
child rows all have database-generated keys that nothing references; a value row's key is
rewritten on every save, which is exactly why ADR 0010 fingerprints the field definition
instead. They are internal, so they are not preserved. Every id that a reference actually
depends on - universe, type, field, option, entry, tag, relationship, timeline entry,
revision - is preserved exactly, so a future importer can rebuild the graph and the
fingerprints alike. `Tag.Slug` is dropped for the same reason: it is `Name.ToLowerInvariant()`
at the one place a tag is created, so it is a derived index column, not something authored.

**The payload is deterministic; only the envelope is not.** Every collection is sorted in
memory with an ordinal comparer - never left in the database's order and never sorted by a
SQLite collation - so two exports of unchanged lore produce a byte-identical `payload` on any
machine. `generatedAt` is genuinely useful and genuinely volatile, so it sits outside the
payload in the envelope, which is what lets the determinism test compare bytes rather than
compare a parsed object with a hole in it. Enums are written as names, not numbers, so a file
stays readable and a renumbered enum cannot silently re-mean an old backup. Nulls are written
rather than omitted, because "never filled in" and "not in this format" are different facts.

**One transaction for the whole read.** Assembling a backup is around eighteen queries, and
without a snapshot boundary each gap is a moment a concurrent write can land in - producing a
file whose entry is from before an edit and whose history is from after it. The read runs
inside one transaction and takes nothing wider: it writes nothing and locks nothing beyond
its own reads.

**One route, and ownership decides it.** `GET /api/universes/{id}/export`, authenticated,
gated by the same `LoreAccess` check as the rest of the lore surface, so a universe someone
else owns answers 404 and stays indistinguishable from one that does not exist. Archiving
changes nothing: an archived universe stays owned and readable, and a backup taken just
before deleting one is when a backup is worth most. The response is `application/json` as an
attachment named for the world and the day, reduced to lowercase ASCII.

## Consequences

- This phase exports only. Nothing reads a backup back in, and the UI says so rather than
  implying a restore exists.
- The format is the durable commitment, not the code that writes it. `UniverseBackup.cs` is
  the contract; a change there owes a version bump.
- A backup is large and uncompressed, and history dominates it - snapshots grow with the
  number of edits (ADR 0013). Compression is a container decision that can be taken later
  without changing the payload.
- Restoring into a fresh installation will reproduce ids exactly, which is what makes the
  dismissal fingerprints re-apply. An importer that renumbered ids would have to recompute
  them, and should not.
- The serialiser uses the relaxed encoder, so `&`, `<` and non-ASCII text stay literal. That
  is safe precisely because this file is never embedded in HTML - it is written to disk and
  read back by a parser - and it is what keeps a world written in a non-Latin script legible
  in its own backup.
- Two things a backup deliberately does not claim to be: an account export, and a disaster
  recovery mechanism. It is one world, taken by hand, by the person who owns it.
