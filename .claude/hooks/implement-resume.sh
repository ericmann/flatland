#!/usr/bin/env bash
# SessionStart / PostCompact hook: if an /implement run is in flight, remind
# the model where it is so a restart or a context compaction does not lose
# the loop.
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOCK="$ROOT/.claude/implement.lock"
PROGRESS="$ROOT/docs/PROGRESS.md"
[ -f "$LOCK" ] || exit 0
[ -f "$PROGRESS" ] || exit 0

remaining=$(grep -cE '^- \[[ ~]\]' "$PROGRESS" || true)
next=$(grep -m1 -E '^- \[[ ~]\]' "$PROGRESS" | sed -E 's/^- \[[ ~]\] //')
event=$(jq -r '.hook_event_name // "SessionStart"' 2>/dev/null || echo SessionStart)

jq -n --arg ev "$event" --arg n "${remaining:-0}" --arg next "${next:-none}" '{
  hookSpecificOutput: {
    hookEventName: $ev,
    additionalContext: ("An unattended /implement run is in progress on this repo (.claude/implement.lock exists). " + $n + " task(s) remain in docs/PROGRESS.md; next is: " + $next + ". Follow .claude/commands/implement.md: re-read docs/PROGRESS.md, resume the first [~] or [ ] task, and keep going without asking for input until the Finishing section applies.")
  }
}'
exit 0
