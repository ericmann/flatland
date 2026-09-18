#!/usr/bin/env bash
# Stop hook for the /implement loop.
#
# While .claude/implement.lock exists and docs/PROGRESS.md still has open
# tasks ("- [ ]" or "- [~]"), block the stop and tell the model to continue.
# Releases the loop by itself if three consecutive stops produce no change
# at all (no commit, no working-tree change, no PROGRESS.md change), which
# means the model is stuck rather than working.
#
# Escape hatch for a human: rm .claude/implement.lock
set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOCK="$ROOT/.claude/implement.lock"
PROGRESS="$ROOT/docs/PROGRESS.md"
MAX_STALLS=3

[ -f "$LOCK" ] || exit 0
[ -f "$PROGRESS" ] || exit 0

remaining=$(grep -cE '^- \[[ ~]\]' "$PROGRESS" || true)
if [ "${remaining:-0}" -eq 0 ]; then
  rm -f "$LOCK"
  exit 0
fi

# Progress signature: task list + HEAD + working tree state.
sig=$(
  {
    grep -E '^- \[' "$PROGRESS"
    git -C "$ROOT" rev-parse HEAD 2>/dev/null
    git -C "$ROOT" status --porcelain 2>/dev/null
  } | md5sum | cut -c1-16
)
last_sig=$(sed -n 's/^sig=//p' "$LOCK" 2>/dev/null)
stalls=$(sed -n 's/^stalls=//p' "$LOCK" 2>/dev/null)
stalls=${stalls:-0}
if [ "$sig" = "$last_sig" ]; then stalls=$((stalls + 1)); else stalls=0; fi
printf 'sig=%s\nstalls=%s\n' "$sig" "$stalls" >"$LOCK"

if [ "$stalls" -ge "$MAX_STALLS" ]; then
  rm -f "$LOCK"
  jq -n --arg n "$remaining" --arg m "$MAX_STALLS" '{
    systemMessage: ("/implement guard: no progress across " + $m + " consecutive stops with " + $n + " task(s) still open. Loop released; see docs/PROGRESS.md.")
  }'
  exit 0
fi

next=$(grep -m1 -E '^- \[[ ~]\]' "$PROGRESS" | sed -E 's/^- \[[ ~]\] //')
jq -n --arg n "$remaining" --arg next "$next" '{
  decision: "block",
  reason: ("The /implement loop is still active: " + $n + " task(s) remain in docs/PROGRESS.md. Do not stop and do not ask for input. Re-read .claude/commands/implement.md if you have lost the instructions, then re-read docs/PROGRESS.md and continue with the first open task: " + $next + ". When every task is [x], [!] or [-], follow the Finishing section (write docs/HANDOFF.md, delete .claude/implement.lock) and only then stop.")
}'
exit 0
