# ADR 0014 - A backup is one versioned archive holding a universe's authored data

Status: accepted (2026-09-09), amended 2026-09-10 (version 3: the file became an archive)

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

**One file, universe-scoped, JSON at its centre.** JSON is the interchange format here, not
general-purpose storage, so ADR 0007's objection to JSON in the database does not apply. The one
JSON that is already stored as JSON, the Tiptap article, travels as the exact string the column
holds, never re-parsed and re-emitted, so it round-trips byte for byte.

**Version 3 (2026-09-10) makes that file an archive**, because there is now something to put
beside the data. This decision originally read "no archive: there is nothing to put beside the
data - media is not in the product". Entry images made that false (ADR 0019), and the premise
went with it. A backup that named pictures living in a Cloudflare bucket would stop being a
backup the moment the bucket did - which is precisely the moment a backup is for - so the
pictures travel with the lore:

```
backup.json
media/entities/{entityId}/original.{jpg|png|webp}
```

`backup.json` is exactly the document this ADR has always described. Each entry's `image`
carries the identity and shape of its picture and the archive-relative `mediaPath` where the
bytes sit. What it deliberately does not carry is the object key, the bucket, the endpoint or a
URL: those are how *this installation* reaches the file today, they mean nothing on another
machine, and a restore does not need any of them. The download is `application/zip`, named
`lorex-<slug>-<date>.zip`.

**Only the original, never the thumbnail.** A thumbnail is derived - a square cut from the
original, scaled to a fixed size in a fixed format - so a reader regenerates it from the original.
Carrying one would double the media in every backup and add a second copy that has to be trusted
to match. What *is* carried is the one part of it a person chose: `image.crop`, the square the
author framed, as fractions of the displayed original (ADR 0019). With it, the original and the
recipe give back the same thumbnail byte for byte, and a test proves that from the archive alone.
It is nullable - null means a picture stored before framing existed, whose thumbnail is the
centred square - and a reader that ignores it still restores every picture whole, so adding it is
not a version bump.

**A picture that cannot be read fails the backup.** The archive is assembled whole in memory
before a single byte is sent, so a missing object is a 500 carrying the code
`backup_media_missing` and the entry it belongs to - not a 200 with a smaller file. Streaming
could only have reported it by truncating a download that had already claimed to succeed, and an
archive that quietly left a picture out would break the promise at the exact moment it mattered.
A world with no pictures never touches the object store at all, so it exports whether or not
media storage is configured.

**An explicit envelope, and a version on it.** `format` is `lorex.universe.backup` and
`formatVersion` is an integer, so a reader can refuse a file that is merely JSON, and a
future importer can tell which contract it is looking at. The version is bumped when the
payload's shape or meaning changes in a way a reader must notice.

**Version 2 (Phase 019) carries the Trash.** ADR 0015 made an entry the author removes a
row that is marked rather than deleted, so `BackupEntity.deletedAt` is now part of the
format: null while an entry is live, and the moment it was trashed otherwise. A trashed
entry travels whole - values, aliases, tags, history - and so does everything that points at
it, because a backup that omitted recoverable lore would turn a recoverable mistake into a
permanent one the first time the file was read back.

That is a bump rather than the "nullable member an older reader can ignore" case, and the
distinction is worth stating. The member is nullable and ignorable; what is not ignorable is
what it does to the `entities` collection, whose membership no longer implies an entry is
live. A reader that skipped `deletedAt` would restore an author's Trash into their world as
ordinary lore. That is the "re-meaning" clause above, so `formatVersion` is 2. Nothing about
version 1 changes: a version 1 file still means exactly what it always meant, which is that
every entry in it is live - a fact that was previously true by construction and is now
written down.

**Version 3 carries the media.** It is the largest kind of change a version can announce: a
reader that only knows versions 1 and 2 is handed a file it cannot parse at all, rather than one
it parses and misunderstands. That is exactly what a version number is for.

**Only the authored data.** The test for inclusion is: did a person write this, or would
Lorex produce it again from what a person wrote?

| Carried | Left out |
| --- | --- |
| Universe name, description, accent, archived flag, timestamps | `OwnerId` |
| Entity types, field definitions with their declared `Semantic`, options | - |
| Entries: name, summary, Tiptap article, canon status, archived flag, `deletedAt` | - |
| Aliases, tags, stored values including entity references | Alias and value row ids |
| Relationship types and relationships | - |
| Timeline entries, their signed date components and era labels, participants | Derived date precision |
| Every entry's revision history (ADR 0013) | - |
| Each entry's primary image: the original bytes, its asset id, filename, content type, dimensions, chosen crop and archive path | The generated thumbnail and its id, and every R2 object key, bucket name, endpoint and URL |
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

**Media is described by identity and by where it sits, never by where it came from.** The asset
id is carried because it is the identity the entry itself uses, so an importer can recognise the
same picture across two backups of the same world. The object key is not, and is marked in the
code as implementation-only: it names a place in one installation's bucket, it is not what the
picture *is*, and a file that carried it would be describing infrastructure rather than lore.
Archive paths are built from ids and a fixed leaf for the same reason the object keys are - a
name is mutable, and a path built from one would change every time an author renamed a
character, so two backups of unchanged lore would stop being comparable.

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
- **The archive is deterministic too.** Entries are written in a fixed order - `backup.json`
  first, then the media sorted by archive path with an ordinal comparer - and every entry
  carries a fixed 1980-01-01 stamp rather than the clock, so two exports of unchanged lore and
  unchanged pictures differ only where `generatedAt` lands inside the document. `backup.json`
  is deflated; media is stored rather than deflated, because a JPEG, PNG or WebP is already
  compressed and storing it makes "the original bytes, exactly" the plainest thing to verify.
- A backup is large, and history dominates the document - snapshots grow with the number of
  edits (ADR 0013). The container now compresses the document, which is where the growth is.
- Restoring into a fresh installation will reproduce ids exactly, which is what makes the
  dismissal fingerprints re-apply. An importer that renumbered ids would have to recompute
  them, and should not.
- The serialiser uses the relaxed encoder, so `&`, `<` and non-ASCII text stay literal. That
  is safe precisely because this file is never embedded in HTML - it is written to disk and
  read back by a parser - and it is what keeps a world written in a non-Latin script legible
  in its own backup.
- A backup no longer depends on the R2 bucket surviving. It did, briefly, between the arrival of
  entry images and version 3; that gap is closed, and it is why the format moved.
- Two things a backup deliberately does not claim to be: an account export, and a disaster
  recovery mechanism. It is one world, taken by hand, by the person who owns it.
