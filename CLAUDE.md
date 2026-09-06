# CLAUDE.md - traffic controller

Router only. No architecture detail here.

## Every session

1. Read `STATE.md` first. Always.
2. Read `SYSTEMS.md` when you need to find a file.
3. Load only context relevant to the current task. Nothing else.
4. Prefer targeted file reads over repository-wide scanning.
5. Use Graphify first when available and useful. Fall back to targeted reads otherwise.
6. Keep context/state files concise. Trim instead of appending.
7. Use caveman-style concise output.

## Git rules

- Never push, merge, force-push, create PRs, or modify remote branches unless explicitly requested.
- Work on numbered branches: `<type>/<NNN>/<short-kebab-description>`.
- Full convention: `docs/architecture/branching.md`.

## After each implementation phase

- Update `STATE.md`: current state, phase, next step, real blockers only.
- Update `SYSTEMS.md` when paths or responsibilities change.
- Write an ADR in `docs/architecture/decisions/` only for durable decisions.

## Hard boundaries

- Modular monolith. No generic Repository/Service layers over EF Core.
- Backend is feature-oriented: `src/Lorex.Api/Features/<Feature>/`.
- No secrets in committed configuration.
