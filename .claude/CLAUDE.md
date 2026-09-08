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

## rtk

Binary: `rtk` (Rust Token Killer), user-scoped at `%USERPROFILE%\.local\bin\rtk.exe`.
Hook: `PreToolUse` / matcher `Bash` -> `rtk hook claude`, in `.claude/settings.json`
(project-scoped on purpose, so the trial is tracked by git and does not leak into
unrelated repositories). Nothing is installed in the global `~/.claude`.

RTK compresses **shell output**. It is not a code-exploration tool.

- The hook rewrites supported commands transparently: `git status` -> `rtk git status`.
  Nothing needs to be typed differently.
- Do **not** use `rtk read`, `rtk grep` or `rtk find` for ordinary repository work.
  Targeted `Read`, `Grep` and `Glob` stay the default - they are what the file-reading
  rules above are written against.
- Full output escape hatch: `rtk proxy <command>` runs unfiltered. Use it when a filtered
  failure is ambiguous, diagnostics look missing, or debugging needs the whole log.
  **Record every such rerun** in `docs/tooling/agent-tooling-trial.md`.
- Savings so far: `rtk gain`.

Filtering is by design asymmetric: a passing `dotnet build` collapses to one line, a
failing one is passed through whole so diagnostics survive.

`rtk gain` prints `No hook installed` because it only inspects the global config. The
project-scoped hook is real; the warning is cosmetic.

RTK and Graphify are unrelated and both stay: Graphify explores the codebase, RTK
compresses command output. Neither replaces the other.
