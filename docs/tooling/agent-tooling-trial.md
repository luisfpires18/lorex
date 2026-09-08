# Agent tooling trial

Phase 012, `chore/012/rtk-token-trial`. Two tools are on trial independently: **RTK**
(shell-output compression) and **Graphify** (codebase exploration). They solve different
problems, so they are judged separately and either can be kept without the other.

No feature work belongs in this phase.

## What is installed

| Tool | Version | Where | Invocation |
| --- | --- | --- | --- |
| RTK | 0.48.0 | `%USERPROFILE%\.local\bin\rtk.exe`, user PATH | `PreToolUse`/`Bash` hook in `.claude/settings.json` |
| Graphify | 0.9.55 | WindowsApps Python module | manual only: `python -m graphify ...` |

RTK came from the official release `rtk-x86_64-pc-windows-msvc.zip` (v0.48.0); the download
was checked against the release `checksums.txt` before extraction. User-scoped, no admin.

The hook is project-scoped rather than global (`rtk init -g`) so the trial is tracked by
git, reverts with the branch, and does not change behaviour in unrelated repositories.
Its content is exactly what `rtk init` prints as its manual step.

## Method

RTK is measured on **shell output only**. Claude keeps using its built-in `Read`, `Grep`
and `Glob` for repository exploration; `rtk read` / `grep` / `find` are deliberately not
adopted. So the question is narrow: does filtering command output pay for itself without
costing diagnostics?

Evaluate over the next **3-4 real implementation tasks**, not synthetic runs. After each,
report:

**RTK** - filter categories actually used; `rtk gain`; filter failures; commands rerun
unfiltered and why; whether any useful diagnostic was lost.

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
- **The hook auto-allows what it rewrites.** It returns `permissionDecision: "allow"` for
  every command it filters, including `git push`. That silently removes the permission
  prompt guarding this repository's "never push, merge or force-push unless explicitly
  requested" rule. Mitigated by `permissions.ask` entries for `git push` / `git merge`
  (bare and `rtk`-prefixed) in `.claude/settings.json`. Precedence of an `ask` rule over a
  hook `allow` is **not yet verified** - treat the guardrail as unproven until a real push
  is attempted.
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
