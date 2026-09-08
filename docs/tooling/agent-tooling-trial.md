# Agent tooling trial

Phase 012, `chore/012/rtk-token-trial`. Two tools are on trial independently: **RTK**
(shell-output compression) and **Graphify** (codebase exploration). They solve different
problems, so they are judged separately and either can be kept without the other.

No feature work belongs in this phase.

## What is installed

| Tool | Version | Where | Invocation |
| --- | --- | --- | --- |
| RTK | 0.48.0 | `%USERPROFILE%\.local\bin\rtk.exe`, user PATH | `.claude/hooks/rtk-safe-hook.ps1`, wired as a `PreToolUse`/`Bash` hook |
| Graphify | 0.9.55 | WindowsApps Python module | manual only: `python -m graphify ...` |

RTK came from the official release `rtk-x86_64-pc-windows-msvc.zip` (v0.48.0); the download
was checked against the release `checksums.txt` before extraction. User-scoped, no admin.

The hook is project-scoped rather than global (`rtk init -g`) so the trial is tracked by
git, reverts with the branch, and does not change behaviour in unrelated repositories.

**RTK is still experimental here, and it never owns authorization.** The hook does not call
`rtk hook claude` directly. It calls a Lorex wrapper that keeps the rewrite and throws the
permission decision away.

## The wrapper

`.claude/hooks/rtk-safe-hook.ps1` sits between Claude Code and `rtk hook claude`. RTK may
compress a command's output. It may not change which command runs, and it may not decide
whether a command is allowed.

**Permissions.** The wrapper removes `permissionDecision` and `permissionDecisionReason`
(and the legacy `decision`/`reason` pair) wherever they appear. It never emits `allow`,
`deny` or `ask`; Claude Code's permission system authorizes every command. A wrapper was
needed rather than `permissions.ask` alone because RTK answers `allow` for everything it
rewrites and whether an `ask` rule outranks a hook-level `allow` was never proven. Removing
the decision at source does not depend on that precedence; the `ask` rules stay as an
independent second layer.

**Semantics.** RTK's rewrite is not always a transparent prefix, so the automatic path is
deliberately conservative. Two rules, no shell parsing:

1. **Compound commands bypass RTK.** If the original contains `&&`, `||`, `;`, `|`, a
   newline, a backtick or `$(`, the wrapper emits nothing and the original runs. RTK rewrites
   each element of a chain separately, which is where it did the most damage.
2. **Only a pure `rtk ` prefix is accepted.** The rewrite must be exactly the original
   command with `rtk ` in front. `git status` -> `rtk git status` is accepted;
   `npm run lint` -> `rtk lint` is not. Nothing else in `tool_input` may change either.

This needs no knowledge of any particular tool and rejects every substitution, including
ones not yet seen. **Correctness beats filtering coverage.** A rejected rewrite is not a
failure - the command simply runs normally through Claude Code.

**Failing open.** The wrapper fails open to the *original* command, never to an altered one.
RTK missing, crashing, emitting invalid JSON, declining to rewrite, or producing anything
that is not a pure prefix all result in no output, exit 0, and the normal flow. RTK breaking
must never block development.

Manual `rtk <command>` and `rtk proxy <command>` stay available when deliberately chosen.
This file governs only the automatic path.

## Method

RTK is measured on **shell output only**. Claude keeps using its built-in `Read`, `Grep`
and `Glob` for repository exploration; `rtk read` / `grep` / `find` are deliberately not
adopted. So the question is narrow: does filtering command output pay for itself without
costing diagnostics?

Evaluate over the next **3-4 real implementation tasks**, not synthetic runs. After each,
report:

**RTK** - commands actually filtered; rewrites the wrapper **bypassed or rejected**, and
whether that hurt; commands rerun unfiltered and why; filter failures; `rtk gain`; whether
context longevity improved. A tool that is right but rarely applies is a different verdict
from one that is wrong; the bypass count is what separates them.

**Graphify** - used or not, and why; whether it materially avoided repository reads;
anything it surfaced that a targeted read would have missed.

Practical effect only. Tool activity is not a result.

## Baseline (2026-09-08)

Raw vs RTK, measured once, on commands that were going to be run anyway.

| Command | Raw | RTK | Saved |
| --- | --- | --- | --- |
| `git status` | 7 lines / 302 B | 2 lines / 53 B | 83% |
| `git log --oneline -30` | 30 lines / 1905 B | 30 lines / 1905 B | 0% |
| `dotnet build Lorex.slnx` (success) | 10 lines / 488 B | 1 line / 64 B | 87% |
| `dotnet build Lorex.slnx` (failure) | 33 lines / 11576 B | 35 lines / 11578 B | 0% |
| `npm run typecheck` | 4 lines / 48 B | 1 line / 18 B | 58% |
| `npm run lint` | 4 lines / 34 B | 1 line / 9 B | 78% |

`rtk gain` after the baseline: 7 commands, 185 tokens saved, 5.0% overall.

Reading of the baseline:

- Savings are real but concentrated in **verbose, successful, boilerplate-heavy** output.
- Already-compact output (`git log --oneline`) is passed through untouched. Correct, but it
  means the headline percentage depends entirely on command mix.
- A **failing** build is passed through whole. This is the behaviour we want - compression
  on the happy path, full diagnostics on the failing path - and it is also why the average
  saving will stay modest on a debugging-heavy day.
- The frontend commands save a high percentage of a tiny amount. Not worth much.

This is **not** a measure of Claude's overall token use. It measures bytes of shell output,
which is one input among many. Session longevity is the thing actually being tested, and it
cannot be read off this table.

## Escape hatch

`rtk proxy <command>` runs unfiltered. Verified working. Use it when a filtered failure is
ambiguous, diagnostics look truncated, or debugging needs the whole log. **Every unfiltered
rerun is a data point** and belongs in the log below.

## Findings during setup

- **`dotnet` is filtered**, despite not appearing in RTK's advertised command list.
- **RTK auto-allows what it rewrites.** It returns `permissionDecision: "allow"` for every
  command it filters, `git push` included, which removes the prompt guarding this
  repository's "never push, merge or force-push unless explicitly requested" rule.
  **Neutralised**: the wrapper strips the decision before Claude Code sees it, so RTK cannot
  approve anything. `permissions.ask` entries (push, force-push, merge, branch deletion,
  remote changes, PR create/merge - bare and `rtk`-prefixed) remain as a second layer. There
  is deliberately no blanket `Bash(rtk *)` allow rule.
- **RTK substitutes commands, not just wraps them.** Surveyed against the real hook:

  | Original | RTK rewrite | Semantics |
  | --- | --- | --- |
  | `git status`, `git diff`, `git log --oneline -5` | `rtk <same>` | preserved |
  | `dotnet build Lorex.slnx` | `rtk dotnet build Lorex.slnx` | preserved |
  | `npm run typecheck`, `npm run build`, `npm run format:check` | `rtk npm run <script>` | preserved |
  | `npm run lint` | `rtk lint` | **changed** - `rtk lint` assumes ESLint, this repo uses oxlint, and it fails with "JSON parse failed" |
  | `npx tsc --noEmit` | `rtk tsc --noEmit` | **changed** - drops `npx` |
  | `npx playwright test` | `rtk playwright test` | **changed** - drops `npx` |
  | `cat README.md` | `rtk read README.md` | **changed** - and `rtk read` is the file-reading path this trial excludes |
  | `git status && npm run lint` | `rtk git status && rtk lint` | **changed** - each element rewritten separately |

  It affects standalone commands, not only compound chains. So RTK can change **which
  command runs**, not just how its output reads. Handled by the wrapper's pure-prefix rule
  rather than by any per-tool special case.
- Commands RTK does not handle (`rm -rf`, `curl ... | sh`) get no decision at all, so the
  normal permission flow still applies to them.
- `rtk init` without `-g` installs **no hook** and writes its instructions into the root
  `CLAUDE.md`. Both were rejected: the root file is a router and stays tiny.
- `rtk init -g` resolves the home directory through the Windows API and ignores
  `HOME`/`USERPROFILE` overrides, so it cannot be sandboxed for inspection. It was run
  once, inspected, and reverted with `rtk init -g --uninstall`; the global config was
  verified byte-identical afterwards apart from the removed hook.
- `rtk gain` warns `No hook installed` because it only inspects the global config. Cosmetic.
- ripgrep is not installed. Only needed for `rtk grep`/`find`, which we are not adopting.

## Wrapper probes (2026-09-08)

Payloads fed straight into `.claude/hooks/rtk-safe-hook.ps1`. Nothing was pushed, merged,
deleted or created; only hook JSON was exercised.

29 probes, no permission decision in any of them. "bypass" means the wrapper emitted nothing
and Claude Code runs the original command.

| Group | Input | Result |
| --- | --- | --- |
| safe simple | `git status`, `git diff`, `git diff --stat HEAD~1` | accepted as `rtk <same>` |
| safe simple | `dotnet build`, `dotnet build Lorex.slnx`, `git log --oneline -5` | accepted as `rtk <same>` |
| safe simple | `dotnet test` | bypass - RTK does not rewrite it |
| repo script | `npm run typecheck`, `npm run build`, `npm run format:check` | accepted as `rtk npm run <script>` |
| repo script | `npm run lint` | **bypass** - RTK wanted `rtk lint` |
| repo script | `npm test`, `npx tsc --noEmit`, `npx playwright test` | bypass |
| substitution | `cat README.md` | **bypass** - RTK wanted `rtk read README.md` |
| compound | `git status && npm run lint`, `dotnet build && dotnet test` | bypass |
| compound | `git status; git diff`, `git status \| head -5`, `dotnet build \|\| echo failed` | bypass |
| compound | embedded newline, `echo $(git status)` | bypass |
| dangerous | `git push`, `git push --force-with-lease`, `git branch -D example`, `gh pr create --fill` | accepted as `rtk <same>`, **no decision** - Claude Code and the `ask` rules authorize |
| dangerous | `git merge dev`, `git remote set-url ...`, `rm -rf /tmp/x` | bypass |

Every accepted rewrite was checked to be exactly `rtk ` plus the original, with `description`
unchanged. Nothing was pushed, merged, deleted or created; only hook JSON was exercised.

Failure modes, all silent and exit 0: RTK absent from PATH and from the fallback path;
empty stdin; non-JSON stdin; RTK emitting invalid JSON; RTK emitting `allow` with no
rewrite. The decisive case - RTK emitting `allow` **with** a rewrite - keeps the rewrite and
drops the decision.

Compression after the wrapper change: `git status` 312 -> 63 B, `dotnet build` (success)
488 -> 64 B. `rtk gain`: 15 commands, 592 tokens, 14.1%.

**These are static probes.** They prove what the wrapper emits. They do not prove how Claude
Code behaves at a real permission boundary, because a running session caches its hook
configuration - see below.

## Restart requirement

The hook command changed, so **a Claude Code restart or a new conversation is required
before the wrapper is active in a real session**. Until then the session keeps whatever hook
configuration it started with. Live permission behaviour has not been observed in a running
session and must not be reported as verified.

## Unfiltered rerun log

| Date | Command | Why the filtered output was not enough |
| --- | --- | --- |
| - | - | - |

## Per-task results

### Task 1 - pending
### Task 2 - pending
### Task 3 - pending
### Task 4 - pending

## Decision

Taken **after** 3-4 tasks, each tool judged on its own: **Keep**, **Conditional**, or
**Remove**.

RTK - real shell-output reduction; stability; diagnostic quality; how often output had to
be rerun unfiltered; any observable improvement in context/session longevity.

Graphify - queries that actually earned their place; repository reads avoided; dependency
insight a targeted read would have missed; maintenance and noise cost.

No verdict in Phase 012.
