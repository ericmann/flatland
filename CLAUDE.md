# Flatland — rules for working in this repo

Flatland is a browser-native, deterministic, tile-based artificial-life sim.
`docs/SPEC.md` is the source of truth. `docs/PLAN.md` derives from it.
**When they disagree: SPEC.md wins over PLAN.md wins over code comments.**

## Engineering checklist (SPEC §3, ordered by retrofit cost)

1. **Deterministic core.** Seed + ordered intervention log → byte-identical state on every tick and platform. Only `world.rng` produces randomness. No `Math.random`, no `Date`, no `performance`, no timers in `src/core`. Slot-order iteration; neighbour contests resolve by lowest slot. No `for…in`. Use `src/core/fmath.js` for `sin cos exp tanh atan2 log` (`Math.*` versions are banned in core by eslint).
2. **No DOM in core.** `src/core/**` imports nothing from the browser and runs unchanged in Node, a Worker, and the main thread.
3. **Sim and render are separate.** The sim runs in a Worker at a fixed timestep; the renderer only reads snapshots; UI intent flows back as messages. Nothing on the main thread mutates sim state.
4. **A world is a seed plus its history.** Saves, share links and fixtures are `{ seed, configDiff, interventions[] }`. Full state is a cache.
5. **Structure of arrays.** Organisms are typed-array columns indexed by slot. Tiles are flat typed arrays. No per-organism objects in the hot loop.
6. **Every intervention is an event.** Hand of God, renames, config changes: appended to the log and chronicled. No silent mutation.
7. **Config is data.** Every tunable is a key in `src/core/config.js` with units and a default; ⚠️ ASSUMPTION keys are marked `assumption: true`. Never hard-code a tunable elsewhere. Tests override config; they never reimplement formulas.
8. **Tests before tuning.** One mechanic in isolation (`enabled` flags), then seeded soak runs asserting ecological invariants. Tuning that breaks a soak invariant is a regression.
9. **Offline-first.** No CDN, no Google Fonts, no analytics, no fetch after load. Fonts are bundled from `@fontsource`.
10. **Small commits with acceptance tests.** The test named in the task exists before the code and fails for the right reason first.

## Energy accounting rule

Every change to a `Float32` stock (plants, carcass, soil, energy) is accounted as the **realised** delta (`after − before`), never the intended amount; any gap goes to `ledger.dissipated`. The identity `stocks + dissipated == genesis + sunlight + hand + immigration` must hold to `1e-3` relative in the invariant test.

## Commands (SPEC §6.6)

```
npm run dev          vite dev server
npm run build        vite build → dist/
npm run preview      serve dist/
npm test             vitest: test/unit test/invariants test/ui   (run every task)
npm run test:soak    vitest: test/soak (minutes; run when src/core changes)
npm run test:all     both of the above
npm run test:ui      playwright (needs `npx playwright install chromium` once)
npm run typecheck    tsc --noEmit --checkJs (src/**, scripts/**)
npm run lint         eslint . && prettier --check .
npm run format       prettier --write .
npm run headless     node scripts/headless.mjs [--seed N --ticks N --size WxH --config k=v]
npm run sweep        node scripts/sweep.mjs --seeds 1..40 --ticks 100000
```

Green means: typecheck, lint and test pass with no skipped tests and no lint suppressions added.

## Module map (SPEC §6.2 plus plan additions)

```
src/core/     pure simulation — no DOM, no timers, no Math.random
  rng.js fmath.js config.js noise.js terrain.js names.js light.js
  organisms.js genome.js world.js genesis.js grid.js senses.js reflex.js brain.js
  pheromone.js ecology.js disease.js weather.js species.js chronicle.js
  stats.js ledger.js interventions.js save.js
src/sim/      worker.js main-thread.js scheduler.js snapshot.js protocol.js
src/render/   renderer.js camera.js terrain-layer.js organism-layer.js lens-layer.js sprites.js hud.js
src/ui/       app.js input.js idle.js format.js sim-client.js species-store.js station/*.js
src/persist/  db.js share.js autosave.js
src/platform/ web.js
src/main.js   index.html (repo root)   public/ (_headers, icons)
scripts/      headless.mjs sweep.mjs perf.mjs make-icons.mjs lib/
test/         unit/ invariants/ soak/ ui/ e2e/ helpers.js
docs/         SPEC.md PLAN.md PROGRESS.md mockup.html tuning.md deployment.md development.md
```

Config keys are dotted paths (`plants.growth`); the table of keys, defaults and units is in `docs/PLAN.md` → Conventions → Config.

## Sim / UI boundaries

- `src/sim` may use `performance.now` and timers only in `worker.js` and `main-thread.js`; `scheduler.js` takes `now()` as a parameter.
- `src/ui` and `src/render` may import **pure** helpers from `src/core` (names, light, format) but never a `World`.
- Snapshots are transferable `ArrayBuffer`s, double-buffered, released back to the worker after drawing.

## Determinism checklist for any change under `src/core`

- Randomness only through `world.rng`, consumed in a fixed order.
- Loops over organisms go `0..highWater` in slot order; tile loops are row-major.
- Nearest/contest ties → lowest slot.
- No allocation inside `step()`; scratch buffers live on the `World`.
- Anything new that is state must be covered by `hash()` and by `save.js` state encode/restore.
- Run `npm run headless -- --ticks 5000` twice and compare the printed hash.

## Commit message template

```
<ID>: <title>

Goal: <one sentence>
Tests: <files and test names added or changed>
Interpretation: <choices made where SPEC/PLAN allowed two readings, or "none">
Sweep: <before/after table, tuning tasks only>
Phone: NOT VERIFIED (human) | n/a
```

One task = one commit containing only the files the task touched plus `docs/PROGRESS.md`. Never `git push --force`, never `git reset --hard`.

## Style

- JavaScript ESM with JSDoc types; `tsc --checkJs` must pass. Prettier formats everything.
- Palette and type are in `docs/SPEC.md` §5.5 and `docs/mockup.html`. Single dark theme.
- Touch is first-class: every action has a touch path; hit targets ≥ 40 px; nothing depends on hover.
