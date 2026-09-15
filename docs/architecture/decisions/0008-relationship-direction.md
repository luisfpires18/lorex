# ADR 0008 - A relationship is one row, read from either end

Status: accepted (2026-09-07)

## Context

Lore is full of links: Aragorn rules Gondor, Arwen is married to Aragorn, a house is a
child of another house. Each link has to appear on both entities, and on the target it
has to read the other way round. Gondor's page should say "ruled by Aragorn", not
"rules Aragorn".

Two shapes were available. Store the link twice, once per direction, so each entity owns
its own row. Or store it once and turn it around when reading.

## Decision

One row per link.

`LoreRelationship` holds a source, a target, and a `RelationshipTypeId`. The type is
universe-scoped and authored: `Name` is the forward reading ("rules"), `InverseName` is
the reverse reading ("ruled by"), and `IsSymmetric` marks a type that reads the same
from both ends ("married to"), where a second wording would be meaningless and is
stored as null.

The reverse reading is derived at read time, never persisted. Listing an entity's
relationships resolves the perspective on the server: a row where the entity is the
target comes back with `Perspective = Inverse`, the inverse wording already in `Label`,
and the other end as the related entity. The stored source and target still travel with
each row, so it stays editable in place.

Dates are optional UTC `DateTime` values, matching the rest of the schema. `EndDate` may
not precede `StartDate`. No fantasy calendars.

## Consequences

- A link cannot contradict itself, because there is no second row to disagree with.
- Deleting a relationship removes it from both entities at once. So does deleting either
  entity, which cascades.
- A relationship type cannot be deleted while relationships use it; the API answers 409
  rather than erasing the links it describes.
- Reading an entity's relationships touches both the source and target indexes. That is
  the cost of storing once, and it is paid by an index on each end.
- Turning a type symmetric drops its inverse name. Turning it directional again means
  supplying a new one.
- Relationships carry no custom fields. If they ever need them, the entity field model is
  the shape to copy, not JSON.

## Amendment - a kind may say its links are parent links (2026-09-16)

A relation kind may carry a family meaning - biological or adoptive parent - which is the only thing a family
tree reads (ADR 0035). Nothing in this decision changes. There is still one row per link, the reverse reading
is still derived from `InverseName` at read time, and the stored direction is still the one direction anything
is judged on: the meaning says the source is the parent and the target the child, so no second "child of" kind
is needed to write a link from the child's side - the kind's own inverse name is what reads it back that way.
A symmetric kind may not carry a family meaning, for the reason it may not carry an age order (ADR 0023): it
says neither end is special. The family tree reads these rows and writes none of its own.
