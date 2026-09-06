# Branching

## Permanent branches

- `dev` - default integration/development branch. All work merges here.
- `master` - future production branch. Receives changes only through an explicit
  `dev` -> `master` merge, and only when the repository owner asks for it.

Never work directly on `master`. Avoid direct feature work on `dev`.

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
| 001 | `feat/001/repository-bootstrap` | in progress, unmerged |

Next free number: `002`.

## Rules for automation

Never push, merge, force-push, create pull requests, or modify remote branches
without an explicit request.
