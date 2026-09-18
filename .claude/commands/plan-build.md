---
description: "Fable: derive docs/PLAN.md, docs/PROGRESS.md and CLAUDE.md from docs/SPEC.md (run once, before /implement)"
disable-model-invocation: true
---

You are planning the build of Flatland, an artificial-life ecosystem sim. Read
docs/SPEC.md in full before doing anything else; it is the source of truth.
Open docs/mockup.html to understand the GUI. Read `.claude/commands/implement.md`
so you know exactly how the plan will be consumed.

You are the first of three chained roles. Your output is executed **unattended**
by Claude Sonnet running `/implement`, which grinds through every task in order
with no human in the loop and no memory of earlier tasks beyond what is on disk,
and is then reviewed by Fable running `/review-build`. Everything Sonnet needs
must therefore be in the task text, and the plan must be machine-trackable.

## Deliverables

1. `docs/PLAN.md` in the exact format below.
2. `docs/PROGRESS.md` in the exact format below.
3. `CLAUDE.md` for the repo.

Do not write implementation code. Do not create the branch, package.json, or any
source files; the first task of Phase 0 does that.

## Rules for the plan

- Follow the phases in SPEC §11 in order. Do not merge phases. Each phase ends
  with a task that pushes the branch, records the expected Pages preview URL,
  and lists what a human must check on a phone. Sonnet cannot use a phone;
  that task writes "Phone: NOT VERIFIED (human)" in the progress log and moves
  on. Never make a later task depend on phone verification.
- Every task is one commit of ≤ ~400 lines of non-test code. Split anything
  larger.
- Every task has a stable ID `P<phase>-<nn>` (e.g. `P0-03`) and states, in this
  order: **Goal** (one sentence), **Files touched**, **Design constraints**
  (cite SPEC sections by number), **Acceptance tests** (the exact test files and
  test names that must exist and pass), **Out of scope** (what the implementer
  must NOT do in this task), **Verification** (commands to run; for UI tasks,
  what to check in the browser), **Depends on** (task IDs, or "none").
- Tests are written in the same task as the code they cover. Invariant and soak
  tests are introduced as early as the mechanics they check exist, never
  deferred to a "testing phase".
- Where SPEC marks ⚠️ ASSUMPTION, the task must name the config key and its
  default and must NOT hard-code the number anywhere else.
- Every ⚠️ ASSUMPTION gets, at the point it first matters, a tuning task that
  runs `scripts/sweep.mjs` before and after and pastes the table into the
  commit message and the progress log.
- Determinism (SPEC §3.1, §6.3) is a constraint on every task that touches
  `src/core/`. Say so in each such task's Design constraints.
- Resolve every SPEC §12 open question with a decision and one-line rationale
  under "Decisions" at the top of PLAN.md, or turn it into a bounded spike task
  with a stated question, a time box in ticks or wall-clock, and a required
  written outcome in `docs/spikes/<id>.md`.
- Task text must be self-sufficient. Sonnet reads CLAUDE.md, the task, and the
  SPEC sections it cites, nothing else. If a task needs a decision from an
  earlier task (a module name, a config key, a message type), restate it.
- Because there is no human between tasks, be explicit about interpretation
  points: where SPEC allows two readings, pick one in the task text.

## `docs/PLAN.md` format

```
# Flatland build plan
Derived from docs/SPEC.md v<version> on <date>. SPEC.md wins over this file.

## Decisions
- §12.1 ... → <decision>. <rationale>
...

## Conventions
<branch name, commit message template, anything every task shares>

## Phase 0 — Scaffold
### P0-01: <title>
**Goal:** ...
**Files touched:** ...
**Design constraints:** ...
**Acceptance tests:** ...
**Out of scope:** ...
**Verification:** ...
**Depends on:** none

### P0-02: ...

## Phase 1 — Living world
...

## Spec issues
<anything ambiguous or contradictory in SPEC, with your proposed resolution>
```

Headings must be exactly `### <ID>: <title>` so they can be found by grep.

## `docs/PROGRESS.md` format

```
# Flatland build progress
Branch: (set by /implement)
Started: (set by /implement)

## Tasks
- [ ] P0-01 <title>
- [ ] P0-02 <title>
...

## Log
(one entry per task, appended by /implement)
```

One line per task, same order as PLAN.md, all unchecked. The checkbox states
`/implement` will use are: `[ ]` todo, `[~]` in progress, `[x]` done,
`[!]` blocked, `[-]` skipped because a dependency is blocked. The Stop hook in
`.claude/hooks/implement-guard.sh` counts `[ ]` and `[~]` lines to decide
whether the loop is finished, so do not add other checkbox lines to this file.

## `CLAUDE.md` contents

The engineering principles from SPEC §3 condensed to a checklist; the commands
from SPEC §6.6; the module map from SPEC §6.2; the determinism rule; the
"no DOM in core" rule; the commit message template (Goal / Tests /
Interpretation / Sweep table if tuning / Phone verified); and a note that
SPEC.md wins over PLAN.md wins over code comments when they disagree. Keep it
under 150 lines. Do not describe the `/plan-build`, `/implement` or
`/review-build` workflow in CLAUDE.md; SPEC Appendix A owns that.

## When you finish

Report: number of tasks per phase, the decisions you made, and the spec issues
you found. Do not start implementation. The human will switch the model to
Sonnet and run `/implement`.
