# ADR 0007 - One generic entity model, with relational custom fields

Status: accepted (2026-09-07)

## Context

A worldbuilding tool cannot know in advance what a world contains. Characters and
locations are obvious; languages, rituals, debts, tides and shipping lanes are not. A
table per kind of thing would mean shipping a schema change every time an author invents
a category we did not anticipate.

## Decision

One `LoreEntity` table. What a thing *is* comes from an `EntityType` row owned by the
universe, and what it *has* comes from `EntityFieldDefinition` rows on that type. Authors
create their own types and fields; the backend has no Character class and no Location
class, and no inheritance between types.

Custom values live in `EntityFieldValue`, which has a typed column per shape rather than
a JSON blob: text, number, boolean, date, an option id, or a reference to another entity
in the same universe. Multi-select stores one row per chosen option. Select options are
their own rows, not a JSON array.

The one place JSON is allowed is the lore article, because it is Tiptap's own document
format. It is validated structurally on the way in, and the author never sees it.

Every universe starts with a small default set of types. Seeding inserts only the names a
universe is missing, so it is safe on a new universe and on one created before the
feature existed.

## Consequences

- Adding a kind of thing is data, not a migration.
- Values stay queryable and typed, so a field whose type is changed cannot silently
  reinterpret what is already stored. The API refuses that change while values exist,
  and refuses to delete a field or an option that still holds any.
- Reading one entity costs a join per field kind rather than one column read. Fine at
  this scale; if a universe ever holds enough entities for that to hurt, the fix is an
  index or a projection, not a JSON column.
- An entity reference is deliberately just a field pointing at another entity. Semantic
  relationships, with their own kinds and direction, are a separate model in phase 005.

## Amendment - the starter types are seeded once (2026-09-30, Product refinement 020)

Seeding filled in any missing starter *name* on every read of the type list - added in Phase 004 so universes created in
Phase 003, before types existed, got them on first use. Once types could be renamed and deleted from the Types screen,
that read undid the author: deleting Location succeeded and the next read put a new, empty "Location" back, so the delete
looked like it had failed and said nothing, and a renamed starter came back beside its new name.

Now the starters are written once, when a universe is created, and a read never writes. A universe's types are its
author's from then on; one whose author deleted every type has none, and says so where an entry would need one. No
backfill is owed: every universe since Phase 004 was seeded at creation, a restored universe takes the types its backup
holds, and a Phase 003 universe that was ever opened was seeded then by the old read.
