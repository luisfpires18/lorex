# Project tooling rules

Detail lives here so the root `CLAUDE.md` stays a router. No rule is repeated in both.

## graphify

Skill: `.claude/skills/graphify/SKILL.md`. Trigger: `/graphify`.
Graph output: `graphify-out/` (gitignored, rebuildable).

Optional and manual only. The automatic `PreToolUse` hooks were removed in Phase 011:
they fired on every read and search and added noise without earning it. Nothing invokes
Graphify now unless you ask for it. A targeted read is the default; reach for the graph
only when a question is genuinely broad.

- Codebase questions: `graphify query "<question>"` when `graphify-out/graph.json` exists.
- Relationships: `graphify path "<A>" "<B>"`. Single concept: `graphify explain "<concept>"`.
- Impact of a change: `graphify affected "<node>"`.
- `graphify-out/GRAPH_REPORT.md` only for broad architecture review, when the scoped
  queries do not surface enough.
- After changing code: `graphify update .` (AST only, no LLM, no API cost).
- Rebuild from scratch on a fresh clone: `graphify update .`.

Installed as a module rather than on `PATH`: run it as `python -m graphify <command>`.
