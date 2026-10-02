# ADR 0041 - A universe has one owner and may have collaborators, and one gate decides what each may do

Status: accepted (2026-10-02). Supersedes ADR 0006's owner-only access rule; 0006 stays as the history of it.

## Context

ADR 0006 made a private universe reachable by its owner alone, proven by an `OwnerId` filter in every query, and said
that collaboration would one day mean a membership table and a deliberate review of every universe-scoped query. That
day is product refinement 029. It is the foundation only: no invitations, no collaborator screens, no comments.

The audit found about 150 private routes under `/api/universes/{id}`, all but a handful gated by one owner-only helper
(`LoreAccess.OwnsUniverseAsync`), the rest - the universe's own routes, publication, artwork - filtering `OwnerId` inline.

## Decision

**`Universe.OwnerId` stays the one source of ownership.** A universe has exactly one owner. No owner row is written to the
membership table, no existing universe or content row is rewritten, and there is no ownership transfer.

**`UniverseMemberships` holds non-owner collaborators.** Key `(UniverseId, UserId)`; `Role` an integer the database
refuses unless it is Viewer (1), Reviewer (2) or Editor (3) - `CK_UniverseMemberships_Role`; `CreatedAt`, `UpdatedAt`;
both foreign keys cascade, so a deleted universe or account leaves no membership; an index on `UserId` for the list. No
route creates one yet - invitations are the next refinement.

**Effective role**, resolved per request from the authenticated principal, never from a request body: the owner if
`OwnerId` matches (owner wins over any malformed membership row), else the stored membership role, else no access. One
query (`UniverseAccess.RoleAsync`).

**Capabilities, not a ladder.** `Features/Universes/UniverseAccess.cs` names what a route asks for and holds the whole
matrix in one switch (`Allows`), so a Reviewer can later gain commenting without gaining edits:

| Capability | Owner | Editor | Reviewer | Viewer |
| --- | --- | --- | --- | --- |
| `Read` - live content, search, derived views (family tree, Canon findings) | ✓ | ✓ | ✓ | ✓ |
| `EditContent` - create and edit all creative content, types, fields, relation kinds, terms, eras, media; Canon evaluate, dismiss, reopen | ✓ | ✓ | | |
| `ManageTrash` - move to the Trash (one or in bulk), list it, restore from it | ✓ | ✓ | | |
| `ManageHistory` - read saved versions (entry, article, manuscript) and restore one | ✓ | ✓ | | |
| `PermanentlyDelete` - erase from the Trash, one or in bulk | ✓ | | | |
| `ManageUniverse` - rename, describe, accent, archive, unarchive, delete | ✓ | | | |
| `Publish` - every publication route (universe, entries, stories and their parts, public details, artwork), reads included | ✓ | | | |
| `Backup` - export | ✓ | | | |

Every private route under a universe starts with `UniverseAccess.DenyAsync(db, universeId, principal, capability)`; the
story routes through `StoryEndpoints.DenyStoryAsync`, which adds the live-story check.

**404 versus 403.** No access at all answers `404` with the same body as a missing universe, so another author's world
stays undiscoverable (0006 unchanged in this). A member whose role lacks the capability gets `403` with problem code
`universe_permission_denied` and a sentence that names nothing about what the role lacks: they already know the universe
exists.

**The Trash is the owner's recovery boundary.** Editors may take content out of use and put it back; only the owner
destroys the recovery copy. No exception for what an Editor created or trashed themselves.

**History is not reading.** Saved versions can hold what the live universe no longer shows, so they are `ManageHistory`,
Editor and owner. Viewers and Reviewers read the current state only. Who made a version is later work.

**Canon status is content; publication is exposure.** An Editor may set Draft or Canon as part of editing. Nothing about
what becomes public is an Editor's: every publication route is `Publish`, owner only. Public anonymous reading is
unchanged and never names a collaborator.

**Backups carry no account access.** Memberships are account metadata, not the fictional world: the backup format stays
version 19 and holds no membership, user id or collaborator name. A restore creates a universe owned by the restoring
account alone (ADR 0032) and never creates a membership. Export is the owner's: it also carries the owner's ideas.

**Ideas stay the account's** (ADR 0030). Membership of someone else's universe shares none of anyone's ideas; universe
search shows the caller's own ideas only; an idea may still be assigned only to a universe its author owns - widening
that is a follow-up, not part of this decision.

**The universe list** reaches owned and member universes as one filter on `Universes` (an `EXISTS` on the membership key),
so a universe appears once; each row and the detail carry the caller's own `accessRole` (`Owner` 0, `Viewer` 1,
`Reviewer` 2, `Editor` 3, numeric like every API enum) and nothing about anyone else. A collaborator sees the owner's
archived state and cannot change it. Public contracts are untouched.

Ambiguous cases classified by the principle - Editors control creative content; owners control the universe, its public
exposure, collaboration, backups and irreversible destruction:

- Canon `evaluate` writes findings, so it is `EditContent`; members read the findings it last wrote.
- Relationships, moments, validation terms, eras, fields and types have no Trash; deleting one stays ordinary editing,
  under the existing safeguards (in-use refusals), as it was for the owner.
- Publication state reads (`GET .../publication`, artwork) are `Publish`: they are the publishing screen's.
- `GET /api/universes/by-address/{slug}`, the public page's way back to the workspace, stays the owner's.

## Consequences

- A new private route must call the gate with a capability. `UniverseAccessMatrixTests` holds a hand-written catalog of
  every route under a universe, asks it as every role and an outsider, and fails when a registered route is missing from
  the catalog.
- The membership lookup is one indexed query per request on top of the route's own work - the same count as the owner
  check it replaced. The list is one count and one page, with no per-row lookup. Nothing is cached.
- Not built: invitations, membership management routes or screens, a role picker, comments, suggestions, attribution
  of who changed what, activity, concurrent-edit protection, ownership transfer, teams, per-item permissions.
