---
description: "Sonnet: work through every open task in docs/PROGRESS.md unattended, then hand off for /review-build"
disable-model-invocation: true
---

You are implementing the Flatland build plan. You run **unattended**: nobody is
watching the terminal, nobody will answer a question, and you must not stop
until every task in `docs/PROGRESS.md` is `[x]`, `[!]` or `[-]`. A Stop hook
will push you back into the loop if you stop early, so stopping to "report
progress" only wastes a turn. Report once, at the end.

Never use AskUserQuestion. Never wait for input. Never ask whether to proceed.

## State lives on disk, not in your memory

Your context will be compacted many times during this run. Treat these files
as the only source of truth and re-read them at the start of every task:

- `docs/PROGRESS.md`: which tasks are done, in progress, blocked, or open, and
  the log of what earlier tasks decided.
- `docs/PLAN.md`: the task text.
- `CLAUDE.md`: rules and commands.
- `git log`: what has actually been committed.

If you ever find yourself unsure what to do next, re-read `docs/PROGRESS.md`
and take the first line that is `[~]` (resume it) or `[ ]` (start it).

## Setup (first time only, skip if `Branch:` in PROGRESS.md is already set)

1. Ensure the working tree is clean. If you are on `main`, create and check out
   a branch `build/<yyyy-mm-dd>`. If you are already on a `build/*` branch, use
   it.
2. Create the file `.claude/implement.lock` (empty). This arms the Stop hook.
3. Fill in `Branch:` and `Started:` in `docs/PROGRESS.md` and commit it with
   the message `chore: start implementation run`.

## Per-task loop

Repeat until no `[ ]` or `[~]` lines remain in `docs/PROGRESS.md`:

1. **Select.** Take the first `[~]` line, else the first `[ ]` line. Mark it
   `[~]`. If any task it **Depends on** is `[!]` or `[-]`, mark it `[-]`,
   append a log entry `SKIPPED: depends on <id>` and go to step 1.
2. **Read.** Read `CLAUDE.md`, then the task `### <ID>: <title>` in
   `docs/PLAN.md`, then the SPEC sections it cites, then the log entries in
   PROGRESS.md for the tasks it depends on. Do not read ahead to later tasks.
3. **Tests first.** Write the acceptance tests named in the task and run them.
   Confirm they fail for the right reason.
4. **Implement** the smallest change that makes them pass, within the Files
   touched.
5. **Verify.** Run `npm run typecheck && npm run lint && npm test`. All green,
   no skipped tests, no lint suppressions added. If the task touches `src/core/`,
   run `npm run headless` and confirm the report is sane. If it is a tuning task,
   run the sweep before and after and keep both tables. If it touches `src/ui/`
   or `src/render/`, run `npm run build` and, if Playwright tests exist, the e2e
   suite; describe what you verified.
6. **Commit** with the template from CLAUDE.md: title `<ID>: <title>`, body with
   Goal / Tests / Interpretation / Sweep table if tuning / Phone verified. Only
   the files the task touched plus `docs/PROGRESS.md`.
7. **Record.** Mark the line `[x]` and append a log entry:
   `### <ID> — <commit sha>` followed by: tests added, any Interpretation
   choices, config keys introduced, anything a later task or the reviewer must
   know. Keep it under 15 lines.
8. Go to step 1. Do not summarise, do not ask, do not stop.

## Phase-end tasks

The last task of each phase pushes the branch and records the preview. If the
repo has no `origin` remote, skip the push, write `Push: no remote configured`
in the log, and continue. Write `Phone: NOT VERIFIED (human)` in the log. Do
not wait for a deploy or for anyone to look at it.

## Constraints you may not relax

No DOM or timers in `src/core`; no `Math.random` or `Date.now` anywhere in
`src/core` or `src/sim`; iteration in slot order with ties resolved by lowest
id; no per-tick allocation in the step; every tunable is a config key; every
intervention is an event in the log. SPEC.md wins over PLAN.md wins over code
comments.

## When a task is under-specified or wrong

- Under-specified: do not guess silently. Implement the interpretation most
  consistent with SPEC and record it under Interpretation in the commit and
  the log. Then continue.
- Tests fail and you cannot make them pass within the task's Files touched
  after a genuine attempt (not more than ~3 distinct approaches): mark the task
  `[!]`, append a log entry `BLOCKED: <what you tried, what fails, what you
  think the fix is>`, reset any uncommitted changes for that task, and
  continue with the next task.
- Impossible as written (contradicts SPEC, or depends on something that does
  not exist): mark `[!]` with the reason, do not work around it, continue.
- A blocked task never stops the run. The reviewer decides what to do with it.

## Finishing

When no `[ ]` or `[~]` lines remain:

1. Run the full suite one last time: `npm run typecheck && npm run lint &&
   npm test`, and `npm run headless` if `src/core` exists. If anything is red,
   fix it in a commit titled `chore: final green` and re-run.
2. Write `docs/HANDOFF.md`:
   - Branch, base commit, head commit, task counts by state.
   - Blocked and skipped tasks with their reasons, verbatim from the log.
   - Every Interpretation choice, collected in one list with task IDs.
   - Every ⚠️ ASSUMPTION config key with its current default and whether it
     was tuned.
   - What a human must check on a phone, per phase.
   - Anything you would tell a reviewer who has not seen this code.
3. Commit `docs/HANDOFF.md` as `chore: handoff for review`.
4. If an `origin` remote exists: push the branch and, if `gh` is authenticated,
   open a draft PR titled `Build: <first phase>–<last phase>` whose body is
   `docs/HANDOFF.md`. If not, note it in HANDOFF.md.
5. Delete `.claude/implement.lock`. This disarms the Stop hook.
6. Print one final message that starts with `READY FOR REVIEW` and contains
   the branch name, head sha, and the counts. The human will switch the model
   to Fable and run `/review-build`.

## Review-fix rounds

If `docs/PROGRESS.md` contains tasks with IDs starting `R` (added by
`/review-build`), this is a fix round. Everything above applies unchanged: the
`R` tasks are tasks. Their text lives in `docs/PLAN.md` under
`## Review fixes (round N)`. Finish by rewriting the round section of
`docs/HANDOFF.md` rather than the whole file.
