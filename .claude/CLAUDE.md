# Project tooling rules

Detail lives here so the root `CLAUDE.md` stays a router. No rule is repeated in both.

## graphify

Skill: `.claude/skills/graphify/SKILL.md`. Trigger: `/graphify`.
Graph output: `graphify-out/` (gitignored, rebuildable).

Advisory, not blocking. Prefer the graph, but a targeted read always wins when it is
faster or the graph does not hold the answer. Never let a missing graph stop work.

- Codebase questions: `graphify query "<question>"` when `graphify-out/graph.json` exists.
- Relationships: `graphify path "<A>" "<B>"`. Single concept: `graphify explain "<concept>"`.
- Impact of a change: `graphify affected "<node>"`.
- `graphify-out/GRAPH_REPORT.md` only for broad architecture review, when the scoped
  queries do not surface enough.
- After changing code: `graphify update .` (AST only, no LLM, no API cost).
- Rebuild from scratch on a fresh clone: `graphify update .`.

Never run a repository-wide grep or glob when one of the above answers the question.
