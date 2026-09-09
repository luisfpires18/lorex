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

All accepted. Next number: `0013`.

Known limitations are recorded in the ADR that owns them - cross-era ordering in 0009 and
0011, the `Age` reference year and exclusive-relationship overlap in 0011.
