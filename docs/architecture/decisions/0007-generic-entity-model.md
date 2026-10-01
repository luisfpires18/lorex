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

## Amendment - nested types, and Lore starts with a type (2026-10-01, Product refinement 022)

**A type may sit beneath another type.** `EntityTypes.ParentId`, null for a root; any number of children, any depth - no
product limit, no mandatory or privileged root, and a universe may have one root, many or none. Every item of the tree is
an ordinary type, and an entry still has exactly one concrete `EntityTypeId`. Names stay unique per universe, not per
sibling group.

**Organisation, not inheritance.** Nothing passes from a parent to a child or back: not fields, required fields, icon,
accent, description, Canon semantics or Family Tree eligibility. Making a type a child copies nothing; moving one moves no
entry and no field.

**Integrity.** A parent is a type of the same universe and never the type itself or one of its descendants, so the types are
always a forest. Same universe and no-self are enforced by the database as well as the API - by triggers rather than a
foreign key, because SQLite adds a key only by rebuilding `EntityTypes`, and a rebuilt table changes the order SQLite visits
tables in a universe's cascading delete: the types went before the entries using them and the entries' RESTRICT key refused
the whole delete (seen, then avoided - the migration is additive, like `AddContentPublication`). A third trigger refuses
deleting a type that still has children, except inside its universe's own delete. Cycles are the API's and the restore's to
refuse, by walking the graph with a visited set (`EntityTypeHierarchy` server-side, `lore/typeTree.ts` in the client); a
trigger cannot walk a graph. No depth cap is used for that: a malformed graph ends a walk instead of looping, and a node no
root reaches is still listed.

**Order is among siblings.** `DisplayOrder` is a type's place among its direct siblings, from 1. A list of types is in
preorder: a parent before its descendants, siblings by place, then name, then id. A new type goes last among its siblings;
reparenting puts the type, with its whole subtree, last among its new siblings and closes the gap it left; `POST
.../entity-types/{id}/move` (`{ "direction": "up" | "down" }`) moves it one place and renumbers that sibling group 1..n, each
in one transaction (SQLite's write lock serialises them). Up on the first and down on the last answer the list unchanged, on
purpose. `DisplayOrder` in a type request is now ignored - a stale or arbitrary number cannot reorder anything. A row whose
parent or place changed records it in `UpdatedAt`.

**Contracts.** `EntityTypeResponse.parentId`; the list stays a flat array, and clients build the tree from ids. The type
request's `parent` is a wrapper - absent keeps the stored parent, so an older client saving a name cannot detach a type;
`{ "id": null }` is a root, `{ "id": "…" }` beneath that type. A parent not of this universe is a 400 on `parent`; a cycle is
a 409 `entity_type_parent_cycle`. `entityCount` is still the type's own entries (the Trash included), never its branch.
Deleting a type with children is refused - never cascaded, promoted or moved - with the same 409 `entity_type_in_use`, a
`childCount`, and words: "Runes can't be deleted because it still contains 4 nested types. Move or delete those types first."

**Lore has no "All".** With no type chosen Lore lists and reads nothing - a search or status in the address waits for a type
- and offers the types as a tree to choose from. A chosen type shows its branch: the entity list's `entityTypeId` is still
exact for every caller, and Lore adds `includeDescendants=true`, resolved on the server from the universe's type graph. An
unknown or foreign type id is taken out of the address, which chooses nothing. Mass create returns to that no-type state with
its count. The chooser is a disclosure of nested lists (links to choose, buttons to open a branch); the chosen type's
ancestors are opened and named in the header's path. Every type picker - Lore, the Types screen, New entry, Mass create -
follows the tree order, and a `<select>` names a type by its path ("Runes › Material Runes").
