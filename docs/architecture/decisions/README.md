# Architecture decisions

One ADR per durable decision. Rationale lives in the ADR, never here.

| # | Decision | File |
| --- | --- | --- |
| 0001 | Modular monolith, feature-oriented backend | [0001-modular-monolith.md](0001-modular-monolith.md) |
| 0002 | SQLite with EF Core migrations | [0002-sqlite-ef-core.md](0002-sqlite-ef-core.md) |
| 0003 | Identity foundation deferred to the auth phase | [0003-identity-foundation.md](0003-identity-foundation.md) |
| 0004 | PowerShell launcher instead of a custom executable | [0004-local-launcher.md](0004-local-launcher.md) |
| 0005 | Cookie sessions over token auth | [0005-cookie-authentication.md](0005-cookie-authentication.md) |
| 0006 | Universe ownership is enforced in every query | [0006-universe-ownership.md](0006-universe-ownership.md) |
| 0007 | One generic entity model, with relational custom fields | [0007-generic-entity-model.md](0007-generic-entity-model.md) |
| 0008 | A relationship is one row, read from either end | [0008-relationship-direction.md](0008-relationship-direction.md) |
| 0009 | Fictional chronology is stored as signed integer components | [0009-fictional-chronology.md](0009-fictional-chronology.md) |
| 0010 | Canon conflicts are derived findings keyed by a fingerprint | [0010-canon-conflict-lifecycle.md](0010-canon-conflict-lifecycle.md) |
| 0011 | A field declares what it means, in a closed enum, on Number only | [0011-semantic-field-codes.md](0011-semantic-field-codes.md) |
| 0012 | High conflicts block only the write that introduces them | [0012-canon-promotion-gate.md](0012-canon-promotion-gate.md) |
| 0013 | An entry's history is a full snapshot per accepted write | [0013-entity-revision-snapshots.md](0013-entity-revision-snapshots.md) |
| 0014 | A backup is one versioned archive holding a universe's authored data | [0014-universe-backup-format.md](0014-universe-backup-format.md) |
| 0015 | An entry is trashed by a marker, and nothing that points at it is destroyed | [0015-entity-trash-and-restore.md](0015-entity-trash-and-restore.md) |
| 0016 | Lore is searched by a SQLite FTS5 index the write path keeps in step | [0016-sqlite-full-text-search.md](0016-sqlite-full-text-search.md) |
| 0017 | Lorex installs as an app shell and caches build output only | [0017-pwa-shell-and-caching.md](0017-pwa-shell-and-caching.md) |
| 0018 | DEV is one App Service serving both halves, with state on the site's own share | [0018-azure-dev-single-app-service.md](0018-azure-dev-single-app-service.md) |
| 0019 | An entry has one image, held in a private bucket and served by Lorex | [0019-entity-primary-image.md](0019-entity-primary-image.md) |
| 0020 | An entity type's icon is a key from a closed, built-in set | [0020-entity-type-icon-keys.md](0020-entity-type-icon-keys.md) |
| 0021 | An account's photo is its own user-level media, on the entry image's proven path | [0021-profile-photo.md](0021-profile-photo.md) |
| 0022 | A universe keeps its own chronology: ordered eras, compared as structured points | [0022-universe-chronology.md](0022-universe-chronology.md) |
| 0023 | A relationship type may carry explicit Canon constraints, checked on the stored direction | [0023-relationship-canon-constraints.md](0023-relationship-canon-constraints.md) |
| 0024 | A story is authored narrative that references lore, told in its own order | [0024-story-scene-foundation.md](0024-story-scene-foundation.md) |
| 0025 | A chapter is optional structure; a scene's order is its place inside its chapter | [0025-story-chapters.md](0025-story-chapters.md) |
| 0026 | Plot is planning: arcs of beats that point at scenes and lore and own neither | [0026-story-plot-arcs-beats.md](0026-story-plot-arcs-beats.md) |

All accepted. Next number: `0027`.

Known limitations are recorded in the ADR that owns them - cross-era ordering on the plain
reckoning in 0009 and 0011, and years written before a universe named its eras, the listing's
join and the missing era reassignment in 0022, the `Age` reference year and exclusive-relationship overlap in 0011, what the
promotion gate does not claim about stored High conflicts in 0012, unbounded history
growth in 0013, what a backup is not in 0014, the type that cannot be freed while a
trashed entry still uses it in 0015, the loss of substring matching in 0016, what an
installed Lorex does not do offline in 0017, and what the DEV topology costs - one
writer, an outage on deploy, keys unencrypted at rest and no rollback for the schema -
in 0018, and what an entry's image costs a backup and a revision restore in 0019, and what a
profile photo is deliberately left out of - a backup, a history and anyone else's view - in
0021, and the deferred life-state constraints and the gap across eras of unrecorded length in 0023, and
what stories deliberately do not have yet - prose, history, search, a Trash, Canon checks - in
0024, and what chapters leave for later - acts and volumes, drag-and-drop, collapsing - in 0025, and what plot
leaves for later - a status, beat chronology, visual planning, editing beats from a scene - in 0026.
