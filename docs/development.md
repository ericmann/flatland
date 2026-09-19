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

## Headless harness

`scripts/headless.mjs` steps one seeded `World` with no browser and prints an
ecology report: population by diet class and species, births, deaths by
cause, hunts, speciation/extinction/immigration counts, Shannon diversity,
plants fraction, a vision-class histogram, achieved ticks/s, the world hash,
and the last 10 chronicle lines.

```
node scripts/headless.mjs                                    # seed 1, 30000 ticks, default size
node scripts/headless.mjs --seed 2 --ticks 5000
node scripts/headless.mjs --size 64x40 --config genesis.herbivoresPerLineage=56
node scripts/headless.mjs --json --quiet                     # one JSON object, no other output
```

Flags: `--seed N` (1), `--ticks N` (30000), `--size WxH`, `--config
key.path=value` (repeatable; dotted keys, numbers/booleans/strings parsed
automatically), `--quiet` (suppress the human-readable report), `--json`
(print one JSON object instead).

## Sweep script

`scripts/sweep.mjs` runs many seeds and prints one row per seed, for pasting
before/after tables into a tuning task's commit message. `--ticks 0` (the
default) prints terrain-only columns; `--ticks N > 0` also steps a `World`
through genesis for `N` ticks per seed (stopping early on extinction) and
appends ecology columns: `pop herb omni carn species H plants% born starved
hunted old splits extinct gen extinctAt tps immig plagues maxShare%
noct/crep/diur avgH`, plus a summary row with means and
`survived = count(pop > 0 ∧ herb > 0 ∧ carn > 0)`. `plagues` counts
chronicle `KIND.PLAGUE` entries so far; `maxShare%` is the largest single
species' share of the end-state population; `noct/crep/diur` is the
vision-class histogram; `avgH` is Shannon diversity averaged over
`world.stats`'s sample history.

```
npm run sweep -- --seeds 1..40 --ticks 0            # terrain only
npm run sweep -- --seeds 1..40 --ticks 30000        # terrain + ecology
node scripts/sweep.mjs --seeds 1..3 --ticks 2000 --json
node scripts/sweep.mjs --seeds 1..40 --ticks 30000 --out docs/sweeps/p1-11-before.txt
```

Flags: `--seeds a..b|a,b,c` (1..40), `--ticks N` (0), `--size WxH`, `--config
key.path=value` (repeatable), `--json`, `--out file` (also write the table to
a file, one JSON line per seed).

## Throughput gate

`test/invariants/throughput.test.js` (SPEC §8) asserts a 64x40, 200-organism
world sustains at least `THROUGHPUT_MIN` (env var, default 2000) ticks/s on a
GitHub runner. Override locally with e.g. `THROUGHPUT_MIN=1000 npm test` if
your machine's `vitest` overhead differs from CI's — see the P1-10 log entry
in `docs/PROGRESS.md` for a measured comparison against raw Node.

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

## Forcing the main-thread sim fallback

The sim normally runs in a Web Worker (`src/sim/worker.js`). Append
`?worker=0` to the URL (e.g. `http://localhost:5173/?worker=0` in `npm run
dev`, or against a built/previewed app) to force
`createMainThreadSim()` instead — the same `Scheduler`, pumped via
`setTimeout(0)` on the main thread, at `sim.fallbackBudgetMs` (6 ms) per
batch rather than `sim.batchBudgetMs` (12 ms). Useful for verifying the
fallback path some embedded WebViews need (SPEC §6.4, §10), and part of
the phone checklist (`docs/PROGRESS.md`'s Phase 1 end log entry).

## The station (Phase 2)

Any key or a map tap opens the field station from idle (`Escape` returns).
The rail's `L`/`E` keys toggle the Night and Energy density lenses; the
"Color by" chips switch the sprite colour mode. Tapping/clicking an
organism selects it and opens the inspector (a bottom sheet under 900px);
Follow keeps the camera on it, Close (or its death) clears the selection.
The dock's Phylogeny tab draws a live time-tree; tapping a branch (or
hovering it with a mouse) rings that lineage's living members on the map.
Part of the phone checklist (`docs/PROGRESS.md`'s Phase 2 end log entry).

## Living systems (Phase 3)

Pheromone lenses (heat maps for the four scent channels) toggle from the
rail strip's `T`/`A`/`M`/`K` keys. A sick organism (contact-transmitted
disease, SPEC §4.9) shows a marker on its sprite. The dock's Charts tab
draws live population-by-lineage and Shannon-diversity-with-light charts.
Idle POI narration remembers the last 16 points of interest, so a
returning hunter or hunt lineage reads as a continuation ("the same
hunter, second night running.") rather than a fresh sighting; famine,
plague and migration/immigration events surface in the chronicle ticker
during idle. Part of the phone checklist (`docs/PROGRESS.md`'s Phase 3
end log entry).

## Module layout

See CLAUDE.md → Module map. `docs/PLAN.md` is the task-by-task build plan;
`docs/PROGRESS.md` tracks which tasks are done.
