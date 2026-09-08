# Branching

## Permanent branches

- `dev` - default integration/development branch. All work merges here.
- `master` - future production branch. Receives changes only through an explicit
  `dev` -> `master` merge, and only when the repository owner asks for it.

Never work directly on `master`. Avoid direct feature work on `dev`.

`master` carries two roots: the Lorex root commit and GitHub's repository-creation
commit, joined once with `--allow-unrelated-histories`. Nothing else needs that flag.

## Working branches

Format:

```
<type>/<NNN>/<short-kebab-description>
```

- `<type>` is one of `feat`, `fix`, `chore`, `refactor`, `test`, `docs`.
- `<NNN>` is mandatory, zero-padded, sequential, starting at `001`.
- One project-wide sequence shared by every branch type.
- Numbers are never reused.
- The description is concise kebab-case.

Examples:

```
feat/001/repository-bootstrap
feat/002/authentication
fix/003/login-validation
chore/004/update-tooling
refactor/005/entity-model
test/006/canon-conflicts
docs/007/architecture-update
```

## Sequence log

| Number | Branch | Status |
| --- | --- | --- |
| 001 | `feat/001/repository-bootstrap` | merged into `dev` |
| 002 | `feat/002/authentication` | merged into `dev` |
| 003 | `feat/003/universe-core` | merged into `dev` |
| 004 | `feat/004/entity-core` | merged into `dev` |
| 005 | `feat/005/relationship-domain` | merged into `dev` |
| 006 | `feat/006/relationship-ui` | merged into `dev` |
| 007 | `test/007/relationship-e2e-hardening` | merged into `dev` |
| 008 | `feat/008/timeline-domain` | merged into `dev` |

Next free number: `009`.

## Rules for automation

Never push, merge, force-push, create pull requests, or modify remote branches
without an explicit request.
