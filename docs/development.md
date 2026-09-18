# Developing Flatland

## Install

```
npm ci
```

Node 22.12+ is required (`.node-version` pins 22 for Cloudflare Pages;
`engines.node` accepts newer locally).

## Run

```
npm run dev       # Vite dev server
npm run build     # production build to dist/
npm run preview   # serve dist/
```

## Test suites

Tests are split so a fast loop stays fast:

| Command             | Runs                                      | When                                                          |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `npm test`          | `test/unit`, `test/invariants`, `test/ui` | every task                                                    |
| `npm run test:soak` | `test/soak` (minutes)                     | whenever `src/core` changes                                   |
| `npm run test:all`  | everything above                          | before a phase-end push                                       |
| `npm run test:ui`   | Playwright e2e                            | UI/render tasks; needs `npx playwright install chromium` once |

Other checks:

```
npm run typecheck   # tsc --noEmit --checkJs over src/** and scripts/**
npm run lint         # eslint . && prettier --check .
npm run format       # prettier --write .
npm run headless     # node scripts/headless.mjs — run a seed with no browser
npm run sweep        # node scripts/sweep.mjs — one row per seed, for tuning
```

## Determinism rules (see CLAUDE.md for the full list)

- Only `world.rng` produces randomness in `src/core` and `src/sim`. No
  `Math.random`, no `Date.now`, no wall-clock time.
- `src/core` additionally bans `Math.sin/cos/exp/tanh/atan2/log/pow/hypot` —
  use `src/core/fmath.js` instead, so share links replay identically across
  browser engines.
- Organism and tile iteration is always in slot order / row-major order;
  neighbour ties resolve to the lowest slot id.
- `src/core` has no DOM, no timers, no `fetch`: it runs unchanged in Node, in
  a Worker, and on the main thread.

These are enforced by `eslint.config.js` (`no-restricted-properties`,
`no-restricted-syntax`, and a denylisted global set for `src/core`), not just
documented — a violation fails `npm run lint`.

## Module layout

See CLAUDE.md → Module map. `docs/PLAN.md` is the task-by-task build plan;
`docs/PROGRESS.md` tracks which tasks are done.
