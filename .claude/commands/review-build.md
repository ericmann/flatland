---
description: "Fable: review the completed build branch against SPEC and PLAN, then approve or queue fix tasks for /implement"
disable-model-invocation: true
---

You are reviewing an implementation run of Flatland that Claude Sonnet
completed unattended via `/implement`. You have not seen this code being
written; do not assume it does what the log says.

Read, in order: `docs/HANDOFF.md`, `docs/PROGRESS.md`, `CLAUDE.md`, then
`docs/SPEC.md` in full. Then `git log --stat main..HEAD` to see the commits.

## What to review

Review the whole branch, commit by commit, using `git show <sha>` for each
task commit. For every task, read the diff, then the task in `docs/PLAN.md`,
then the SPEC sections it cites. Check, in order, and report findings most
severe first:

1. **Determinism**: any `Math.random`, `Date`, iteration over Map/Set/object
   keys in core or sim, floating-point reductions whose order depends on data,
   or neighbour resolution without an id tiebreak.
2. **Boundaries**: DOM, timers, or fetch in core; sim state mutated from the
   main thread; config values hard-coded outside `config.js`.
3. **Tests**: do the acceptance tests named in the task exist, do they test the
   mechanic in isolation using config overrides rather than re-deriving the
   formula, and would they fail if the mechanic were removed? Run the full
   suite yourself: `npm run typecheck && npm run lint && npm test`, plus the
   invariant and soak suites and `npm run headless`. Do not trust the log.
4. **Performance**: per-tick allocation, O(n²) neighbour scans that bypass the
   spatial grid, snapshot buffers rebuilt per frame.
5. **Spec drift**: anything the diff does that SPEC says otherwise, or that
   PLAN marked out of scope for that task.
6. **Interpretation choices** listed in HANDOFF.md: is each one the reading
   most consistent with SPEC? If not, it is a finding.
7. **Blocked and skipped tasks**: for each, decide whether the blocker is
   real, and what unblocks it (a fix task, a plan change, or a spec change).
8. Only then: readability and naming.

Sample at least one test per module by deleting or inverting the mechanic and
confirming the test fails. Restore it afterwards.

## Output

Write `docs/REVIEW.md` with:

- **Verdict**: `APPROVED` or `CHANGES REQUESTED`. Approve only if categories
  1–3 are clean across the entire branch and there are no blocked tasks.
- **Findings**, most severe first. For each: category, `file:line`, what is
  wrong, what would break, the minimal fix, and the task ID it belongs to.
- **Spec issues**: places where you conclude SPEC itself is wrong. These are
  separate from findings; never approve a deviation because SPEC is wrong.
- **Phone checks still owed**: copied from HANDOFF.md.

Then, if the verdict is `CHANGES REQUESTED`:

1. Append a section `## Review fixes (round N)` to `docs/PLAN.md` (N = 1 for
   the first round). Turn each finding that needs code changes into a task
   `R<N>-<nn>` in the exact task format the plan uses (Goal, Files touched,
   Design constraints, Acceptance tests, Out of scope, Verification, Depends
   on). Group small findings in the same file into one task. Every fix task
   must name a test that would have caught the original finding.
2. Append `- [ ] R<N>-<nn> <title>` lines for each to the `## Tasks` list in
   `docs/PROGRESS.md`. For a blocked task you have unblocked, reset its line
   from `[!]` to `[ ]` and append a log entry saying why.
3. Commit REVIEW.md, PLAN.md and PROGRESS.md as `review: round N`.
4. Print a final message starting with `CHANGES REQUESTED` and the number of
   fix tasks. The human will switch to Sonnet and run `/implement` again; it
   picks the `R` tasks up automatically.

If the verdict is `APPROVED`: commit REVIEW.md as `review: approved`, and print
a final message starting with `APPROVED` listing the phone checks still owed
and any spec issues. Do not merge; the human merges.

Do not fix code yourself. Findings go through the fix-task loop so that every
change on the branch has a task, a test, and a commit that names them.
