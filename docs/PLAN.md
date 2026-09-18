# Flatland build plan
Derived from docs/SPEC.md v0.1 on 2026-09-18. SPEC.md wins over this file.

## Decisions
- §12.1 Crossover timing → Asexual reproduction with mutation only through Phase 4; mating with crossover arrives in P5-04, gated by a sociality gene and kin proximity, with `breeding.crossover.enabled` defaulting to `true` only after the P5-05 sweep shows it does not collapse diversity. Rationale: Helioza's crossover blurred lineages; distance-based speciation needs clean asexual drift first so the phylogeny is legible before mixing is added. (Note: SPEC §4.5 says "Phase 3" and §11 says Phase 5; §11 wins, see Spec issues.)
- §12.2 POI memory in idle → Yes, bounded. P3-09 keeps a ring of the last 16 POIs with subject ids (organism id, species id) in `src/ui/idle.js`; captions add continuity phrasing ("again", "third night running") when a subject repeats. Rationale: cheap once chronicle entries carry `subjects[]` (P3-07), and it is the difference between a screensaver and a story.
- §12.3 Fog-of-war idle variant → No, not in this build. The lens layer compositor (P2-09) is a list of independent overlay passes, so a "seen by organism N" mask could be added later as one more pass without restructuring. Rationale: interacts with lens design but adds nothing to the three defining properties in §1.
- §12.4 Snapshot verification on resume → Ship it, config-gated: `persist.verifyOnResume` (default `true`) and `persist.verifyReplayTicks` (default 2000). The worker keeps an in-memory checkpoint snapshot refreshed every `verifyReplayTicks` ticks; the auto-save record stores the live snapshot, its hash, and the last checkpoint. On resume, a second `World` restores from the checkpoint, replays ≤ `verifyReplayTicks` ticks inside the normal tick budget, and compares hashes. A mismatch logs `console.error('[flatland] determinism mismatch …')` and posts a `status` event; nothing else. Rationale: §3 rule 1 is the most expensive property to lose silently; the cost is bounded and invisible.
- Genome layout arrives in Phase 1, evolution ops in Phase 2 → `src/core/genome.js` (trait layout, phenotype mapping) is built in P1-02 because Phase 1 organisms need size, speed, diet, vision, lifespan, maturity and breed threshold. Mutation, distance and the brain weight block are used from Phase 2. Phase 1 births copy the genome unchanged.
- Senses arrive in Phase 1 → `src/core/senses.js` produces the full 17-value brain input vector from P1-05 (pheromone inputs are 0 until P3-01). Phase 1 behaviour is a fixed reflex policy in `src/core/reflex.js` that reads that same input vector and writes the same 8-value output vector the brain will write in Phase 2, so P2-03 is a swap, not a rewrite.
- Brain input count → SPEC §4.7's input list has 16 values plus bias = 17, not 14. The plan uses 17: `L, hunger, ageFrac, threatSin, threatCos, threatProx, foodSin, foodCos, foodMag, kin, pher0, pher1, pher2, pher3, terrainVis, terrainCost, bias`. `BRAIN_INPUTS = 17` is a constant exported from `src/core/genome.js` (the layout owner), not a config key. Only `brain.hidden` (default 8 ⚠️) is tunable.
- Genesis brains are seeded, not random → `genesis.brainPrior` (`'seeded'` default, `'random'` for tests) initialises founder weight blocks from a hand-set template that encodes the Phase 1 reflexes (steer to food, away from threat, throttle by hunger) plus `N(0, genesis.brainNoise)`. §1.1 allows "reflexes needed to bootstrap"; a prior is that reflex expressed as weights.
- Transcendental functions → `src/core/fmath.js` implements `sin, cos, exp, tanh, atan2, log` with polynomial approximations (error ≤ 1e-6) using only `+ − × ÷ sqrt floor`, which are IEEE-754 correctly rounded everywhere. `Math.sin` etc. are banned in `src/core` by eslint. Rationale: §3 rule 1 says byte-identical on every platform; engines differ in the last ulp of `Math.sin/exp`. `Math.sqrt/floor/ceil/round/abs/min/max/fround/imul/trunc` remain allowed.
- Gaussian noise → `rng.gaussian()` is the Irwin–Hall sum of 12 uniforms minus 6 (no `log`, no cached second value, no hidden state beyond the 32-bit seed).
- PRNG → mulberry32 (SPEC §6.2 offers it or xoshiro128**). One stream per world, state is a single `uint32` stored on the `World` and included in `hash()` and snapshots. Rationale: smallest state to snapshot; matches the mockup.
- Energy accounting closure → an organism's body is `energy[i] + body[i]` where `body[i] = organisms.bodyMassPerSize × size(i)` is paid by the parent at birth and returned to the carcass at death, so starvation deaths leave a carcass and the §4.4 identity closes exactly. Interventions that create plant mass (rain, meadow) are counted in a `ledger.hand` input term: `stocks + dissipated == genesis + sunlight + hand`. Fire counts burned plant mass as `dissipated`.
- Predation → cannibalism excluded (never the same species); attack requires attacker diet ≥ `predation.minDiet`; contests resolve by lowest attacker slot; a hit kills with probability `predation.killChance`; prey size must be ≤ attacker size × `predation.maxPreySizeRatio`.
- Chronicle kinds → add `weather` (Phase 5) to the §4.11 list; §4.3 requires weather events to be chronicle entries and no listed kind fits.
- Scent lens keys → channels are labelled Scent 1–4 (they have no fixed meaning, §4.8); keys `T`, `A`, `M`, `K`; Energy density lens key `E`; Night lens `L`.
- Test suites → `npm test` runs `test/unit`, `test/invariants`, `test/ui`. `npm run test:soak` runs `test/soak` (minutes). CI runs both. Sonnet runs `npm test` every task and `test:soak` on tasks that touch `src/core` once the soak exists.
- Typecheck scope → `tsc --noEmit --checkJs` covers `src/**` and `scripts/**`. Tests are linted but not typechecked.
- Non-ecological ⚠️ ASSUMPTIONs (`persist.verifyReplayTicks`, the Pixel 6a reference device) get no sweep task because `sweep.mjs` measures ecology; each is recorded with its default in the task that introduces it and in `docs/HANDOFF.md`.
- No spikes. All four §12 questions are decided above.

## Conventions

### Branch, commits, preview
- Branch `build/<yyyy-mm-dd>`, created by `/implement`. One task = one commit.
- Commit message template (also in CLAUDE.md):
  ```
  <ID>: <title>

  Goal: <one sentence>
  Tests: <files and test names added or changed>
  Interpretation: <choices made where SPEC/PLAN allowed two readings, or "none">
  Sweep: <before/after table, tuning tasks only>
  Phone: NOT VERIFIED (human) | n/a
  ```
- Cloudflare Pages preview URL for a branch: replace every non-alphanumeric character in the branch name with `-`, so `build/2026-09-18` → `https://build-2026-09-18.flatland.pages.dev`. Phase-end tasks record this URL in the PROGRESS log. If the human has not yet connected the repo in the Cloudflare dashboard (SPEC §7.1), the URL will 404; record it anyway.
- A task's non-test code is ≤ ~400 lines (JS + HTML + CSS + config). Tests do not count.

### npm scripts (from SPEC §6.6, plus the soak split)
```
dev, build, preview, test (unit+invariants+ui), test:watch, test:soak, test:all,
test:ui (playwright), typecheck, lint, format, headless, sweep
```

### Module map additions to SPEC §6.2 (all otherwise as SPEC)
```
src/core/fmath.js        deterministic sin/cos/exp/tanh/atan2/log
src/core/grid.js         spatial hash (cell = world.cellSize tiles), counting-sort layout
src/core/reflex.js       Phase 1 policy + permanent reflex layer (eat gate, water block)
src/core/stats.js        periodic samples (population by class/species, diversity, L)
src/core/ledger.js       energy accounting terms and flow counters
src/core/interventions.js  intervention event types + apply()
src/sim/scheduler.js     fixed-timestep loop, testable in node (injected now() and port)
src/sim/snapshot.js      snapshot buffer layout, encode/decode, double buffer
src/sim/main-thread.js   Worker-less fallback using an in-process port
src/platform/web.js      share / wakeLock / haptics adapters (SPEC §10)
src/render/hud.js        floating zoom/speed cluster
scripts/make-icons.mjs   PNG icon generator (zlib only, no deps)
test/helpers.js          makeWorld(), stepN(), makeOrganism(), assertLedger()
```

### Config
`src/core/config.js` exports `DEFAULTS` (nested plain object), `makeConfig(overrides)` (deep merge + validation, returns a frozen object), `diffConfig(cfg)` / `applyDiff(diff)` (P4-01), and `DOCS`: a map of dotted key → `{ units, assumption: boolean, doc }`. Every ⚠️ ASSUMPTION key has `assumption: true`. Every mechanic has an `enabled` flag so tests can isolate it. Keys are referenced in this plan by dotted path. Initial defaults are below; tuning tasks may change any `assumption: true` default and must record the change in the sweep table.

| Key | Default | Units | ⚠️ | Introduced | Tuned |
|---|---|---|---|---|---|
| `world.width`, `world.height` | 256, 160 | tiles | yes | P0-02 | P1-11 |
| `world.maxOrganisms` | 2000 | slots | no | P0-02 | — |
| `world.cellSize` | 8 | tiles | no | P0-02 | — |
| `time.ticksPerDay` | 1800 | ticks | yes | P0-02 | P1-11 |
| `time.daysPerYear` | 24 | days | yes | P0-02 | P1-11 |
| `terrain.octaves` | `[{scale:22,w:.6},{scale:9,w:.3},{scale:4,w:.1}]` | tiles, weight | yes | P0-05 | P0-06 |
| `terrain.thresholds` | `{water:.34,sand:.38,mud:.44,grass:.62,scrub:.74}` | noise value | yes | P0-05 | P0-06 |
| `terrain.minGrassFraction`, `terrain.minWaterFraction`, `terrain.maxRerolls` | 0.08, 0.02, 16 | fraction, count | no | P0-05 | — |
| `terrain.moveCost` | `[3,1,1.6,1,1.3,1.5]` by type | multiplier | no | P0-05 | — |
| `terrain.visibility` | `[1,1.3,1,1,0.45,1]` by type | multiplier | no | P0-05 | — |
| `terrain.plantCap` | `[0,0,0.35,1,0.6,0]` by type | plant units | yes | P1-04 | P1-11 |
| `plants.enabled` | true | — | no | P1-04 | — |
| `plants.growth` | 0.004 | plant units/tick at L=1 | yes | P1-04 | P1-11 |
| `plants.soilBoost` | 2.0 | per soil unit | yes | P1-04 | P1-11 |
| `plants.initialFill` | 0.6 | fraction of cap | no | P1-04 | — |
| `carcass.enabled`, `carcass.decay`, `carcass.decayMud` | true, 0.002, 0.0007 | fraction/tick | yes | P1-04 | P1-11 |
| `soil.uptake` | 0.001 | fraction/tick | yes | P1-04 | P1-11 |
| `energy.etaHerb`, `energy.etaCarn` | 0.7, 0.8 | efficiency | yes | P1-07 | P1-11 |
| `organisms.energyMaxBase` | 150 | energy | yes | P1-02 | P1-11 |
| `organisms.bodyMassPerSize` | 40 | energy per size unit | yes | P1-02 | P1-11 |
| `organisms.biteSize` | 0.1 | plant units/tick | yes | P1-07 | P1-11 |
| `organisms.turnRate` | 0.5 | rad/tick at turn=1 | no | P1-06 | — |
| `movement.enabled` | true | — | no | P1-06 | — |
| `metabolism.enabled`, `metabolism.base`, `metabolism.moveCost` | true, 0.02, 3.0 | energy/tick, multiplier at full throttle | yes | P1-06 | P1-11 |
| `aging.enabled` | true | — | no | P1-06 | — |
| `predation.enabled`, `predation.reach`, `predation.minDiet`, `predation.killChance`, `predation.maxPreySizeRatio` | true, 1.0, 0.5, 0.5, 1.5 | tiles, diet, prob/tick, ratio | yes | P1-07 | P1-11 |
| `breeding.enabled`, `breeding.radius`, `breeding.localK`, `breeding.baseRate`, `breeding.childEnergyFraction` | true, 6, 10, 0.01, 0.35 | tiles, count, prob/tick, fraction | yes | P1-08 | P1-11 |
| `senses.sampleDistance`, `senses.kinRadius`, `senses.kinNorm` | 3, 5, 8 | tiles, tiles, count | no | P1-05 | — |
| `phenotype.<trait>` | ranges, see P1-02 | per trait | yes | P1-02 | P1-11 |
| `genesis.*` | see P1-03 | — | yes | P1-03 | P1-11 |
| `genome.sigmaMut`, `genome.pMut`, `genome.pBig`, `genome.hueScale` | 0.05, 0.15, 0.01, 0.2 | gene units, prob, prob, multiplier | yes | P2-01 | P2-05 |
| `brain.hidden`, `brain.reflexLayer` | 8, true | units, — | yes | P2-02 | P2-05 |
| `genesis.brainPrior`, `genesis.brainNoise` | `'seeded'`, 0.1 | —, weight units | yes | P2-03 | P2-05 |
| `species.theta` | 0.6 | trait distance | yes | P2-04 | P2-05 |
| `stats.sampleEvery`, `stats.historyLength` | 30, 1024 | ticks, samples | no | P1-09 | — |
| `pheromone.enabled`, `pheromone.decay`, `pheromone.diffusion`, `pheromone.diffuseEvery`, `pheromone.emitMax` | true, `[.985,.96,.98,.97]`, `[.2,.2,.2,.2]`, 4, 0.5 | —, per tick, per diffuse, ticks, units | yes | P3-01 | P3-10 |
| `disease.enabled`, `disease.contactRate`, `disease.kinBias`, `disease.durationTicks`, `disease.costPerTick`, `disease.lethality`, `disease.contactRadius` | true, 0.02, 1.0, 1200, 0.03, 0.15, 1.0 | —, prob/tick, weight, ticks, energy/tick, prob, tiles | yes | P3-03 | P3-10 |
| `regrowth.enabled`, `regrowth.debtTicks`, `regrowth.debtFactor` | true, 3600, 0.3 | —, ticks, multiplier | yes | P3-04 | P3-10 |
| `famine.plantFraction` | 0.1 | fraction of Σcap | yes | P3-05 | P3-10 |
| `immigration.enabled`, `immigration.floorHerbivores`, `immigration.floorCarnivores`, `immigration.groupSize`, `immigration.cooldownTicks` | true, 20, 4, 8, 1800 | —, count, count, count, ticks | yes | P3-06 | P3-10 |
| `interventions.*` radii/amounts | see P4-02 | tiles, units | no | P4-02 | — |
| `persist.autosaveSeconds`, `persist.verifyOnResume`, `persist.verifyReplayTicks` | 20, true, 2000 | s, —, ticks | yes | P4-06 | — |
| `sim.tps`, `sim.batchBudgetMs`, `sim.fallbackBudgetMs` | 30, 12, 6 | ticks/s, ms, ms | no | P1-12 | — |
| `temperature.*` | see P5-01 | — | yes | P5-01 | P5-05 |
| `weather.*` | see P5-02 | — | yes | P5-02 | P5-05 |
| `swim.threshold`, `swim.moveCost` | 0.6, 2.5 | gene, multiplier | yes | P5-03 | P5-05 |
| `breeding.crossover.*` | see P5-04 | — | yes | P5-04 | P5-05 |

### Determinism rules (restated in every `src/core` task)
- Only `world.rng` produces randomness. `Math.random`, `Date`, `performance`, timers, DOM, `fetch` are banned in `src/core` by eslint.
- `Math.sin/cos/exp/tanh/atan2/log/pow/hypot` are banned in `src/core`; use `fmath`.
- Iterate organisms in slot order `0..capacity-1`, skipping dead slots. Neighbour contests resolve by lowest slot. Never iterate object keys (`for…in` banned in core). Map/Set are allowed only outside the per-tick path.
- No per-tick allocation: every buffer the step needs is allocated in the `World` constructor. Scratch arrays are fields.
- `world.hash()` = FNV-1a 32-bit over, in this order: `tick`, `rng.state`, `nextId`, then the bytes of every core typed array in the fixed order listed in `world.js` (`HASH_ORDER`), then the species table numeric columns (P2-04). Returned as an 8-char lowercase hex string. Little-endian byte views (all target platforms are little-endian).

### Terrain enum, diet classes, vision classes
- `TERRAIN = { WATER:0, SAND:1, MUD:2, GRASS:3, SCRUB:4, ROCK:5 }` in `src/core/terrain.js`.
- Diet class of an organism: `d < 0.35` herbivore ("grazers"), `d > 0.65` carnivore ("hunters"), otherwise omnivore. Exported as `dietClass(d)` from `src/core/genome.js`.
- Vision class from peak λ: `< 0.35` nocturnal, `≤ 0.7` crepuscular, `> 0.7` diurnal (SPEC §5.2). Exported as `visionClass(λ)` from `src/core/genome.js`.

### Worker protocol names (`src/sim/protocol.js`, P1-12)
Commands (main → sim): `load`, `setSpeed`, `intervene`, `select`, `requestSnapshot`, `releaseSnapshot`, `snapshotState`, `hash`, `pause`, `resume`.
Events (sim → main): `loaded`, `snapshot`, `status`, `chronicle`, `phylogeny`, `stats`, `stateSnapshot`, `hash`.
Every message is `{ type, ...payload }`; transferable buffers travel in the `transfer` list.

### Test helpers (`test/helpers.js`, P1-03)
- `makeWorld({ width=64, height=40, seed=1, terrain, organisms=[], config={} })` → `World`. `terrain` is a `TERRAIN` value to fill the whole map, or `(x, y) => type`. `organisms` is a list of `{ x, y, energy?, traits? }` where `traits` is a partial map of trait name → gene value in `[0,1]`; unspecified traits default to 0.5. `config` is deep-merged over `DEFAULTS`. Genesis is skipped when `organisms` is given (even if empty). Every mechanic `enabled` flag defaults to its `DEFAULTS` value unless overridden; the helper `isolate(mechanics)` returns a config with every mechanic off except those named.
- `stepN(world, n)` steps and returns the world. `alive(world)` returns living slot indices in slot order.

### Template for phase-end tasks
Every phase's last task: runs the full suite, builds, pushes the branch, writes to the PROGRESS log the preview URL, the head sha, the list of phone checks (copied from the task), and the literal line `Phone: NOT VERIFIED (human)`. Never blocks anything later.

## Phase 0 — Scaffold

### P0-01: Repository scaffold and toolchain
**Goal:** Create the Vite + vitest + eslint + prettier + JSDoc-typecheck toolchain with CI so every later task has `typecheck && lint && test` to run.
**Files touched:** `package.json`, `package-lock.json`, `.node-version`, `vite.config.js`, `vitest.config.js`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.github/workflows/test.yml`, `public/index.html`, `src/main.js`, `docs/development.md`, `test/unit/smoke.test.js`, `README.md`.
**Design constraints:**
- SPEC §6.6 exactly: JavaScript ESM with JSDoc, `tsc --noEmit --checkJs` over `src/**` and `scripts/**` only (tests excluded via `tsconfig.json` `include`), Vite, vitest (node env by default), eslint flat config + prettier, Node 22 LTS.
- `.node-version` contains `22`. `engines.node` is `>=22.12` (vitest 4 needs it; the local machine may run newer, which is fine).
- `package.json` scripts, exactly these names: `dev`, `build`, `preview`, `test` (`vitest run test/unit test/invariants test/ui`), `test:watch`, `test:soak` (`vitest run test/soak`), `test:all`, `test:ui` (`playwright test`, added for real in P0-08 but the script exists now and exits 0 with `echo "no e2e yet"`), `typecheck`, `lint` (`eslint . && prettier --check .`), `format` (`prettier --write .`), `headless` (`node scripts/headless.mjs`), `sweep` (`node scripts/sweep.mjs --seeds 1..40 --ticks 100000`). `headless` and `sweep` scripts may not exist yet; that is fine.
- `vitest.config.js`: `environment: 'node'`, `include: ['test/**/*.test.js']`, `testTimeout: 120000`, `pool: 'forks'`, `poolOptions.forks.execArgv: ['--expose-gc']` (the no-allocation invariant in P1-09 needs `global.gc`).
- `eslint.config.js` (flat): `@eslint/js` recommended, `eslint-config-prettier`, ES2023 modules, browser globals for `src/render`, `src/ui`, `src/persist`, `src/platform`, `src/main.js`; worker globals for `src/sim/worker.js`; node globals for `scripts/**` and `test/**`; **no globals at all for `src/core/**`** (no `window`, `document`, `setTimeout`, `fetch`, `performance`, `Date`). In `src/core/**` and `src/sim/**` add `no-restricted-properties` for `Math.random`, `Date.now`; in `src/core/**` also for `Math.sin`, `Math.cos`, `Math.exp`, `Math.tanh`, `Math.atan2`, `Math.log`, `Math.pow`, `Math.hypot` (message: "use fmath"), and `no-restricted-syntax` for `ForInStatement`. `src/sim/worker.js` and `src/sim/main-thread.js` may use `performance.now` and `setTimeout`; `src/sim/scheduler.js` may not (it receives `now` as a parameter).
- `tsconfig.json`: `allowJs`, `checkJs`, `noEmit`, `strict: true`, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`, `lib: ["ES2023", "DOM", "WebWorker"]`, `types: []`, `include: ["src/**/*.js", "scripts/**/*.mjs"]`.
- `public/index.html`: `<!doctype html>`, `lang="en"`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<title>Flatland</title>`, dark `background:#0e1410` on `html` inline, one `<div id="app"></div>`, `<script type="module" src="/src/main.js">`. Vite's `root` is the repo root with `publicDir: 'public'`; keep `index.html` at the repo root as Vite expects (SPEC §6.2 lists it under `public/`; Vite requires it at root — this plan puts `index.html` at root and static assets in `public/`). `src/main.js` writes "Flatland" into `#app`.
- `.github/workflows/test.yml` (SPEC §7.4): on push to `main` and every PR: `actions/setup-node@v4` with `node-version: 22`, `cache: npm`; `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:soak`, `npm run build`. The Playwright step is added in P0-08.
- `docs/development.md`: how to install, run, test, the suites split, and the determinism rules (copy from CLAUDE.md, short).
- Dependencies are the current majors at install time (`vite@^7`, `vitest@^4`, `eslint@^9`, `@eslint/js`, `eslint-config-prettier`, `prettier@^3`, `typescript@^5`, `jsdom`, `@playwright/test`). Commit `package-lock.json`.
**Acceptance tests:** `test/unit/smoke.test.js` — `"the test runner runs"` (expects `1 + 1 === 2`), `"package.json scripts match SPEC §6.6"` (reads `package.json` and asserts every script name listed above exists). Do not import `src/main.js` from tests; it will later spawn a Worker.
**Out of scope:** No simulation code, no Playwright config or browser install, no PWA plugin, no fonts.
**Verification:** `npm ci && npm run typecheck && npm run lint && npm test && npm run build` all green; `npm run dev` serves a page showing "Flatland".
**Depends on:** none

### P0-02: Seeded RNG, deterministic math, config module
**Goal:** Provide the only randomness source, the deterministic transcendental functions, and the typed config object every later module reads.
**Files touched:** `src/core/rng.js`, `src/core/fmath.js`, `src/core/config.js`, `test/unit/rng.test.js`, `test/unit/fmath.test.js`, `test/unit/config.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): this is the root of it. No `Math.random`, no `Date`.
- `rng.js`: `class Rng { constructor(seed) ; state (uint32) ; next() → uint32 ; float() → [0,1) ; int(n) → [0,n) ; range(lo,hi) ; gaussian() (Irwin–Hall, 12 uniforms − 6) ; chance(p) → boolean ; fork(salt) → new Rng }`. Algorithm mulberry32. `state` is readable and writable (snapshots).
- `fmath.js`: `sin, cos, exp, tanh, atan2, log, TAU, clamp, lerp, wrapAngle`, implemented with polynomial/minimax approximations and range reduction using only `+ − × ÷`, `Math.sqrt`, `Math.floor`, `Math.abs`, `Math.fround`. Absolute error ≤ 1e-6 for `sin/cos` on `[−8π, 8π]`, relative error ≤ 1e-6 for `exp` on `[−20, 20]`, absolute ≤ 1e-6 for `tanh` on `[−10, 10]`, `atan2` ≤ 1e-6 on the unit circle, `log` relative ≤ 1e-6 on `[1e-6, 1e6]`.
- `config.js`: `DEFAULTS` nested object with every key introduced in the Conventions table that is marked "P0-02" plus the sections other tasks will fill (create the sections with the P0-02 keys only; later tasks add keys). `DOCS` map of dotted key → `{ units, assumption, doc }`. `makeConfig(overrides = {})` deep-merges plain objects (arrays replaced, not merged), validates that every override key exists in `DEFAULTS` (throw `Error('unknown config key: <path>')`) and that numbers are finite, and returns a deep-frozen object. `flatten(cfg)` → `Map<dottedKey, value>`. Keys introduced now: `world.width` 256, `world.height` 160 (⚠️), `world.maxOrganisms` 2000, `world.cellSize` 8, `time.ticksPerDay` 1800 (⚠️), `time.daysPerYear` 24 (⚠️). Every ⚠️ key has `assumption: true` in `DOCS`.
**Acceptance tests:**
- `test/unit/rng.test.js`: `"same seed gives the same sequence"`, `"different seeds differ"`, `"float is in [0,1)"`, `"int(n) covers 0..n-1 and nothing else"`, `"gaussian has mean ≈ 0 and sd ≈ 1 over 100k samples"`, `"state can be saved and restored mid-sequence"`.
- `test/unit/fmath.test.js`: `"sin/cos within 1e-6 of Math on [-8π, 8π]"`, `"exp within 1e-6 relative on [-20, 20]"`, `"tanh within 1e-6 on [-10, 10]"`, `"atan2 within 1e-6 on the unit circle and axes"`, `"log within 1e-6 relative on [1e-6, 1e6]"`, `"wrapAngle maps into (-π, π]"`.
- `test/unit/config.test.js`: `"makeConfig returns defaults when given nothing"`, `"overrides deep-merge and arrays replace"`, `"unknown keys throw"`, `"result is frozen"`, `"every assumption key is documented with units"` (walks `DOCS`, asserts every key in `flatten(DEFAULTS)` has a `DOCS` entry).
**Out of scope:** No noise, light, terrain. No use of these modules from `main.js`.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P0-01

### P0-03: Light, seasons and the world clock
**Goal:** Implement SPEC §4.3 exactly: tick → global light `L`, day fraction, season name and the `Year Y · Day D · HH:MM` clock string.
**Files touched:** `src/core/light.js`, `test/unit/light.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): pure functions of `(tick, cfg)`; use `fmath.sin/cos`.
- Formulas from SPEC §4.3 verbatim: `u = (tick mod DAY)/DAY`, `yearFrac = ((tick/DAY) mod YEAR)/YEAR` (use `Math.floor(tick/DAY)` for the day index), `f = 0.5 + 0.22·sin(2π(yearFrac − 0.125))`, `L = u < f ? 0.5(1 − cos(2πu/f)) : 0`.
- Exports: `lightAt(tick, cfg)`, `dayFraction(tick, cfg)`, `season(tick, cfg)` → `'Spring'|'Summer'|'Autumn'|'Winter'` by `yearFrac` quarter, `clock(tick, cfg)` → `{ year, day, hour, minute, text }` with `year = floor(tick/DAY/YEAR)+1`, `day = floor(tick/DAY) mod YEAR + 1`, hour `(6 + 24u) mod 24`, and `text` = `Year 1 · Day 1 · 06:00` (the separator is ` · `, U+00B7 with spaces). Also `sunArc(tick, cfg)` → `{ angle, up }` for the top-bar glyph: `angle = π(1 − u/f)` while `u < f`, else `π`.
- Longest day is mid-summer: `f` peaks at `yearFrac = 0.375`.
**Acceptance tests:** `test/unit/light.test.js`: `"L is 0 at dawn (u = 0)"`, `"L peaks at 1 when u = f/2"`, `"L is 0 through the night"`, `"day fraction ranges over [0.28, 0.72] across a year and peaks mid-summer"`, `"seasons are quarters in order Spring, Summer, Autumn, Winter"`, `"clock string boundaries: tick 0 is Year 1 · Day 1 · 06:00, last tick of day 1 is 05:59, first tick of year 2 is Year 2 · Day 1"`, `"light is unchanged by config overrides that do not touch time"`.
**Out of scope:** Temperature (Phase 5), rendering.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P0-02

### P0-04: Value noise
**Goal:** Seeded multi-octave value noise for terrain generation.
**Files touched:** `src/core/noise.js`, `test/unit/noise.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): the lattice is filled from an `Rng` passed in; no other randomness.
- `makeNoise(rng, size)` → `{ at(x, y) }` over a `size × size` lattice with smoothstep interpolation (`t²(3−2t)`) and wrapping lattice indices, as the mockup does. `fbm(layers, x, y)` sums `[{ noise, scale, weight }]` layers as `Σ weight · noise.at(x/scale, y/scale)` and returns the sum (weights sum to 1 in the default config so the range is `[0,1]`).
- Returns `Float32`-rounded values (`Math.fround`) so results are identical whether or not the caller stores them in a `Float32Array`.
**Acceptance tests:** `test/unit/noise.test.js`: `"same seed gives the same field"`, `"values are within [0,1]"`, `"neighbouring samples differ by less than 0.2 at scale 22"` (smoothness), `"fbm with one layer equals that layer"`.
**Out of scope:** Terrain thresholds, rendering.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P0-02

### P0-05: Terrain generation and region names
**Goal:** Generate the six-type terrain grid from seeded noise with the SPEC §4.2 contiguity guarantees, and name regions per SPEC §4.10.
**Files touched:** `src/core/terrain.js`, `src/core/names.js`, `src/core/config.js` (terrain keys), `test/unit/terrain.test.js`, `test/unit/names.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): all randomness from the `Rng` passed in (the world's rng, forked with salt `'terrain'`; the fork's seed is `seed ^ 0x7e44a1`). Re-roll with `seed+1` per SPEC §4.2 is done by re-forking with the incremented seed; the number of rerolls is returned so the caller can chronicle it.
- `TERRAIN` enum in `terrain.js` exactly `{ WATER:0, SAND:1, MUD:2, GRASS:3, SCRUB:4, ROCK:5 }`, `TERRAIN_NAMES = ['water','sand','mud','grass','scrub','rock']`.
- `generateTerrain(seed, cfg)` → `{ terrain: Uint8Array(w*h), rerolls, grassFraction, waterFraction }`. Value = fbm over `cfg.terrain.octaves` (⚠️, default `[{scale:22,w:.6},{scale:9,w:.3},{scale:4,w:.1}]`, lattice sizes 16/32/64 as in the mockup) plus the mockup's `sin(x/w·π)·0.05` wetter-edges term, thresholded by `cfg.terrain.thresholds` (⚠️, default `{water:.34,sand:.38,mud:.44,grass:.62,scrub:.74}`; value `< water` → WATER, `< sand` → SAND, … else ROCK).
- Guarantee (SPEC §4.2): largest 4-connected GRASS component ≥ `cfg.terrain.minGrassFraction` (0.08) of all tiles and largest 4-connected WATER component ≥ `cfg.terrain.minWaterFraction` (0.02); otherwise re-roll with `seed+1` up to `cfg.terrain.maxRerolls` (16) times, then throw `Error('terrain: no valid map after N rerolls')`. Guarantees are checked for every map size (tests use 64×40; if a size cannot satisfy them the test config lowers the fractions). Component labelling uses an iterative flood fill on a preallocated `Int32Array` stack, no recursion.
- Tables in config: `terrain.moveCost = [3,1,1.6,1,1.3,1.5]` (water's 3 is used only by swimmers in Phase 5; until then water is impassable), `terrain.visibility = [1,1.3,1,1,0.45,1]`.
- `names.js`: `regionName(x, y, terrain, w, h)` → `the [northern |southern |][western|central|eastern] [shallows|shore|marsh|meadow|scrub|rocks]` using thirds of the map (`y < h/3` northern, `y ≥ 2h/3` southern, else no word; same for x with western/central/eastern) and the terrain word for the tile's type in enum order. `regionWord(type)` → `Shallow|Shore|Marsh|Meadow|Scrub|Rock`. Species nouns per SPEC §4.10 as exported arrays `HERB_NOUNS`, `CARN_NOUNS`, `OMNI_NOUNS` (`Foragers, Rovers, Wanderers`). Species naming itself is P2-04.
**Acceptance tests:**
- `test/unit/terrain.test.js`: `"seeded generation is stable (same seed → identical Uint8Array, hash of two runs equal)"`, `"different seeds differ"`, `"every tile is one of the six types"`, `"default size satisfies the grass and water contiguity guarantees for seeds 1..10"`, `"a config whose thresholds make grass impossible rerolls then throws with a clear message"`, `"reroll count is reported"`.
- `test/unit/names.test.js`: `"region naming at the thirds boundaries (x = w/3 − 1 is western, x = w/3 is central; y = 2h/3 − 1 has no word, y = 2h/3 is southern)"`, `"terrain word follows the tile type"`, `"noun lists match SPEC §4.10"`.
**Out of scope:** Rendering, plants, rivers, the World class.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P0-03, P0-04

### P0-06: Terrain tuning sweep
**Goal:** Introduce `scripts/sweep.mjs` with terrain-only columns and tune the ⚠️ terrain thresholds and octaves so the default size passes the §4.2 guarantees on ≥ 38 of seeds 1–40 without rerolls.
**Files touched:** `scripts/sweep.mjs`, `src/core/config.js` (terrain defaults only), `docs/tuning.md`.
**Design constraints:**
- This is the first tuning task (rule: every ⚠️ ASSUMPTION gets a sweep before/after). `sweep.mjs` accepts `--seeds a..b`, `--ticks N` (ignored until P1-10 adds ecology columns), `--size WxH`, and prints a fixed-width table: `seed, rerolls, grass%, water%, largestGrass%, largestWater%, sand%, mud%, scrub%, rock%`, followed by a summary row (means, and the count of seeds needing rerolls). Also `--json` to emit rows as JSON lines. The script imports only `src/core/**`.
- Run the sweep before changing anything, paste the table into `docs/tuning.md` under a heading `## P0-06 terrain — before`; adjust `terrain.thresholds` and/or `terrain.octaves` only (never hard-code numbers outside `config.js`); run again; paste under `## P0-06 terrain — after`. Both tables go into the commit message and the PROGRESS log entry.
- Target: at the default size, rerolls needed on ≤ 2 of 40 seeds; grass fraction mean in `[0.30, 0.50]`; water mean in `[0.05, 0.20]`. If already met before tuning, record that and leave defaults alone.
**Acceptance tests:** None new; `test/unit/terrain.test.js` `"default size satisfies the grass and water contiguity guarantees for seeds 1..10"` must still pass, and add to it `"seeds 1..40 need at most 2 rerolls in total"`.
**Out of scope:** Ecology, plants, any file outside the three listed plus the terrain test.
**Verification:** `npm run sweep -- --seeds 1..40 --ticks 0` prints the table; `npm run typecheck && npm run lint && npm test`.
**Depends on:** P0-05

### P0-07: A seeded terrain renders in the browser
**Goal:** Draw the generated terrain on a full-screen canvas with a camera, DPR handling and integer-snapped zoom, on the main thread (no Worker yet).
**Files touched:** `src/render/renderer.js`, `src/render/terrain-layer.js`, `src/render/camera.js`, `src/main.js`, `index.html`, `src/style.css`, `test/unit/camera.test.js`, `test/unit/terrain-layer.test.js`.
**Design constraints:**
- SPEC §6.5: offscreen world canvas at `tiles × 4 px`; terrain drawn from an `ImageData` at 1 px/tile then scaled 4× with `imageSmoothingEnabled = false`; present with a single `drawImage` at the camera transform; DPR-aware (`Math.min(2, devicePixelRatio)`); zoom in `[1, 8]` snapped to quarter-pixel multiples (`Math.round(z*4)/4`). Palette from the mockup `TCOL` for the six types; plants/carcass tinting arrives in P1-13.
- `camera.js` is pure (no DOM): `{ x, y, z }` in world pixels, `clamp(cam, viewW, viewH, worldW, worldH)`, `zoomAt(cam, factor, ax, ay)`, `fit(cam, viewW, viewH, worldW, worldH)`, `screenToWorld`, `worldToScreen`. `terrain-layer.js` exports `paintTerrain(imageData, terrain, w, h)` which only touches `imageData.data` so it is testable in node with a plain `{ data: Uint8ClampedArray }`.
- `renderer.js` owns canvases and `present()`. It never imports `src/core` state mutators; it reads plain typed arrays it is handed.
- `main.js`: generate terrain for seed from `?seed=` (default 1) using `generateTerrain` on the main thread (temporary until P1-13), create the renderer, fit the world, draw once and on resize. Wheel zooms around the cursor; drag pans (minimal pointer handling inline here; the real `input.js` comes in P1-14 and replaces it).
- `src/style.css`: `html, body { margin:0; height:100%; background:#0e1410; overflow:hidden }`, `canvas { display:block; touch-action:none }`. No fonts yet.
- SPEC §3 rule 9: no network requests.
**Acceptance tests:** `test/unit/camera.test.js`: `"clamp keeps the view inside the world and centres when the world is smaller than the view"`, `"zoomAt keeps the anchor point fixed"`, `"fit chooses the largest zoom that shows the whole world, min 1"`, `"zoom snaps to quarter pixels and clamps to [1,8]"`, `"screenToWorld inverts worldToScreen"`. `test/unit/terrain-layer.test.js`: `"paints each tile with its palette colour and alpha 255"`.
**Out of scope:** Organisms, Worker, lenses, UI chrome, touch pinch.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build`; `npm run dev` shows a terrain map that pans and zooms; `?seed=2` shows a different map.
**Depends on:** P0-05

### P0-08: Playwright smoke test and CI e2e step
**Goal:** Add the browser test harness so later UI tasks can ship e2e specs, with a first spec that loads the page with no console errors.
**Files touched:** `playwright.config.js`, `test/e2e/smoke.spec.js`, `package.json` (`test:ui` runs `playwright test`), `.github/workflows/test.yml` (Playwright step), `.gitignore` (already ignores `test-results/`, `playwright-report/`).
**Design constraints:**
- SPEC §6.6, §9.4: projects `chromium-desktop` (1280×800) and `pixel-7` (`devices['Pixel 7']`, touch). `webServer`: `npm run build && npm run preview -- --port 4173 --strictPort`, `url: http://localhost:4173`, `reuseExistingServer: !process.env.CI`. `testDir: test/e2e`, `retries: process.env.CI ? 1 : 0`.
- CI: after `npm run build`, `npx playwright install --with-deps chromium` then `npm run test:ui`.
- Locally, run `npx playwright install chromium` once (network is allowed for tooling install, never at app runtime).
**Acceptance tests:** `test/e2e/smoke.spec.js`: `"page loads with no console errors and paints a canvas"` (collects `console` messages of type `error` and `pageerror`, expects none; expects `canvas` visible), `"first frame is painted within 1500 ms"` (measures from `goto` to a `requestAnimationFrame` callback after the first `present()`; the app sets `document.documentElement.dataset.painted = '1'` after the first present, the test waits for it with a 1500 ms timeout).
**Out of scope:** Interaction specs (they come with the features).
**Verification:** `npx playwright install chromium && npm run test:ui` green on both projects; `npm run lint`.
**Depends on:** P0-07

### P0-09: Phase 0 end — deployment docs, headers, push, preview
**Goal:** Close Phase 0: Cloudflare Pages config files and docs, push the branch, record the preview URL and the owed phone checks.
**Files touched:** `public/_headers`, `docs/deployment.md`, `README.md`, `docs/PROGRESS.md`.
**Design constraints:**
- `public/_headers` exactly as SPEC §7.3. No COOP/COEP.
- `docs/deployment.md`: SPEC §7.1–§7.5 rewritten as a runbook (dashboard fields table, preview URL rule from Conventions, the `wrangler` fallback command). State that connecting the repo in the dashboard is a human step.
- Push: `git push -u origin HEAD`. Preview URL per Conventions. If push fails for lack of credentials, log `Push: failed (<reason>)` and continue.
- PROGRESS log entry must contain: preview URL, head sha, `Phone: NOT VERIFIED (human)`, and this phone checklist verbatim: "(1) map renders full-bleed with no white flash; (2) one-finger drag pans; (3) page does not scroll or bounce; (4) no console errors in remote devtools".
**Acceptance tests:** None new. `npm run build` output contains `dist/_headers`; assert this in `test/unit/build-output.test.js` `"build copies _headers into dist"` (spawns `npm run build` via `child_process` — mark the test with a 120 s timeout).
**Out of scope:** Custom-domain setup (human), any source change.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`; `git push`.
**Depends on:** P0-08

## Phase 1 — Living world

### P1-01: Organism SoA store
**Goal:** Implement the fixed-capacity structure-of-arrays organism store with deterministic slot allocation.
**Files touched:** `src/core/organisms.js`, `test/unit/organisms.test.js`.
**Design constraints:**
- SPEC §3.5 (SoA, typed arrays, no per-organism objects), §4.5 fields, §6.3 slot-order iteration. Determinism (SPEC §3.1, §6.3): allocation returns the **lowest free slot** (scan from a `freeHint` cursor that is reset to `min(freeHint, slot)` on free), so the same birth sequence always yields the same slots.
- `class OrganismStore { constructor(capacity, genomeLength) }` with fields, all preallocated: `alive: Uint8Array`, `id: Uint32Array` (stable ids, monotonic from 1, `nextId` on the store), `x, y, heading, energy, body: Float32Array`, `age: Uint32Array`, `species: Int32Array`, `parent: Uint32Array` (parent id, 0 = genesis), `generation: Uint16Array`, `sick: Uint16Array` (timer, 0 = healthy), `flags: Uint8Array`, `genome: Float32Array(capacity × genomeLength)`, `pheno: Float32Array(capacity × TRAIT_COUNT)` (filled by P1-02), and derived per-slot `energyMax, lifespanTicks, maturityTicks, breedEnergy: Float32Array` (filled by P1-02). Also `count` (living), `highWater` (one past the highest slot ever used; iteration bound), `capacity`, `genomeLength`.
- `alloc() → slot | -1`, `free(slot)` (clears `alive`, zeroes nothing else), `genomeOf(slot) → Float32Array subarray view` (no copy), `slotOfId(id) → slot | -1` via a preallocated `Int32Array` map keyed by `id % capacity·4`? No: keep a `Map` **only** for id→slot lookups made by the UI (`select`), never in the per-tick path; document that.
- `HASH_ORDER` in this file lists the store's typed arrays in the order `hash()` (P1-03) must consume them: `alive, id, x, y, heading, energy, body, age, species, parent, generation, sick, flags, genome`. `pheno` and derived arrays are excluded (they are functions of `genome`).
**Acceptance tests:** `test/unit/organisms.test.js`: `"alloc returns the lowest free slot"`, `"free then alloc reuses the freed slot before any higher one"`, `"ids are monotonic and never reused"`, `"alloc returns -1 at capacity and count does not change"`, `"genomeOf is a view, not a copy"`, `"highWater never decreases and bounds every living slot"`, `"slotOfId finds a living organism and returns -1 for a dead one"`.
**Out of scope:** Phenotype mapping, World, stepping, snapshots.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P0-02

### P1-02: Genome layout and phenotype mapping
**Goal:** Define the fixed genome layout (trait block + brain weight block) and the trait → phenotype mapping with config ranges; no mutation or brain evaluation yet.
**Files touched:** `src/core/genome.js`, `src/core/config.js` (`phenotype.*`, `organisms.energyMaxBase`, `organisms.bodyMassPerSize`, `brain.hidden`), `src/core/organisms.js` (fill `pheno` and derived arrays), `test/unit/genome.test.js`.
**Design constraints:**
- SPEC §4.6 trait list, in this fixed order (exported `TRAIT` enum and `TRAIT_NAMES`): `size, speed, diet, visionPeak, visionWidth, visionRange, metabolism, lifespan, maturity, breedThreshold, boldness, sociality, prefTemp, swim, resistance, hue, emit0, emit1, emit2, emit3, sense0, sense1, sense2, sense3`. `TRAIT_COUNT = 24`. Genes are `[0,1]`.
- Brain block sizes are constants here (layout owner): `BRAIN_INPUTS = 17`, `BRAIN_OUTPUTS = 8`; `weightCount(cfg) = BRAIN_INPUTS × cfg.brain.hidden + (cfg.brain.hidden + 1) × BRAIN_OUTPUTS` (the `+1` is an output-layer bias unit); `genomeLength(cfg) = TRAIT_COUNT + weightCount(cfg)`. `brain.hidden` default 8 (⚠️). The weight block is stored in `[0,1]` like every gene and mapped to `[−W, W]` with `brain.weightScale` (default 2, not ⚠️) at evaluation time (P2-02).
- Phenotype ranges are config (`phenotype.<trait>: [lo, hi]`, all ⚠️): `size [0.6, 2.0]` (px multiplier and mass), `speed [0.05, 0.25]` tiles/tick, `diet [0, 1]`, `visionPeak [0, 1]`, `visionWidth [0.15, 0.6]`, `visionRange [4, 16]` tiles, `metabolism [0.6, 1.4]` multiplier, `lifespan [1.0, 3.0]` days, `maturity [0.15, 0.45]` fraction of lifespan, `breedThreshold [0.5, 0.9]` fraction of `energyMax`, `boldness [0,1]`, `sociality [0,1]`, `prefTemp [0,1]`, `swim [0,1]`, `resistance [0,1]`, `hue [0, 360]` degrees, `emit0..3 [0,1]`, `sense0..3 [0,1]`. `traitValue(cfg, gene, trait) = lo + gene·(hi − lo)`.
- Derived (written into the store by `applyPhenotype(cfg, store, slot)`, called at genesis and birth): `pheno[slot·24 + t]` for every trait; `energyMax = organisms.energyMaxBase × (0.5 + size)` (base 150 ⚠️); `body = organisms.bodyMassPerSize × size` (40 ⚠️; **stored into `store.body[slot]` at birth, it is energy the parent paid**); `lifespanTicks = lifespan × time.ticksPerDay`; `maturityTicks = maturity × lifespanTicks`; `breedEnergy = breedThreshold × energyMax`.
- `dietClass(d)` → `'herbivore' | 'omnivore' | 'carnivore'` with cut-offs `0.35 / 0.65`; `visionClass(λ)` → `'nocturnal' | 'crepuscular' | 'diurnal'` with `< 0.35`, `≤ 0.7`, `> 0.7`.
- Determinism (SPEC §3.1): pure functions; no randomness here.
**Acceptance tests:** `test/unit/genome.test.js`: `"layout: TRAIT_COUNT is 24 and genomeLength = 24 + 17·hidden + (hidden+1)·8"`, `"traitValue maps 0 → lo and 1 → hi for every trait"`, `"applyPhenotype fills pheno and derived arrays consistently with the ranges"`, `"dietClass and visionClass boundaries (0.35, 0.65; 0.35, 0.7)"`, `"phenotype ranges are all documented as assumptions in config DOCS"`.
**Out of scope:** Mutation, distance (P2-01), brain forward pass (P2-02).
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P1-01

### P1-03: World skeleton, genesis, hash, test helpers, determinism invariant
**Goal:** Create the `World` class with all grids and buffers allocated up front, a genesis population, `step()` advancing tick and light, `hash()`, the `test/helpers.js` factory, and the determinism invariant test.
**Files touched:** `src/core/world.js`, `src/core/genesis.js`, `src/core/config.js` (`genesis.*`, `world.maxSpecies`), `test/helpers.js`, `test/unit/world.test.js`, `test/invariants/determinism.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): the only randomness is `world.rng = new Rng(seed)`; terrain uses `rng.fork(seed ^ 0x7e44a1)` as P0-05 states; genesis consumes `world.rng` in a fixed order. No `Math.random`, no `Date`, no timers, no DOM. No per-tick allocation: every array is allocated in the constructor, including 4 pheromone grids (`Float32Array(w·h)` each, zero until P3-01), `plants`, `carcass`, `soil` (`Float32Array(w·h)`), and the scratch buffers later tasks need (`inputs: Float32Array(capacity × 17)`, `outputs: Float32Array(capacity × 8)`, `dying: Uint8Array(capacity)`, `attackTarget: Int32Array(capacity)`, `birthQueue: Int32Array(capacity)`, `queryOut: Int32Array(capacity)`).
- `new World(cfg, seed)`: `cfg` is a `makeConfig()` result; `seed` is a uint32. Fields: `cfg, seed, rng, tick = 0, light = 0, width, height, terrain (Uint8Array from generateTerrain; store rerolls), plants, carcass, soil, pher (array of 4 Float32Array), store (OrganismStore(cfg.world.maxOrganisms, genomeLength(cfg))), interventions = [], pending = []` (P1-04 uses), `counters` (plain object of integer counters: `born, starved, oldAge, hunted, …`, fixed keys, never grows).
- `step()`: `tick++ ; light = lightAt(tick, cfg)`. Nothing else yet; later tasks insert the SPEC §6.3 stages in order, each behind its `enabled` flag.
- `hash()` per Conventions: FNV-1a 32-bit over `tick`, `rng.state`, `store.nextId`, then `terrain, plants, carcass, soil, pher[0..3]` byte views, then the store arrays in `HASH_ORDER`. Species table columns are appended by P2-04. Hex string. `hashUpdate(h, bytes)` helper in `world.js`.
- `genesis.js` `runGenesis(world)`: keys (all ⚠️): `genesis.herbivoreLineages` 3, `genesis.herbivoresPerLineage` 50, `genesis.carnivoreLineages` 1, `genesis.carnivoresPerLineage` 24, `genesis.lineageNoise` 0.05 (sd of per-member gene noise), `genesis.clusterRadius` 12 (tiles), `genesis.energyFraction` 0.6 (of `energyMax`), `genesis.dietHerbivore [0.02, 0.2]`, `genesis.dietCarnivore [0.8, 0.98]`. For each lineage in order (herbivore lineages first): founder genome = every trait gene `rng.float()`, diet overridden by `rng.range(lo, hi)` of its class, weight block left at 0.5 (P2-03 replaces with the prior); lineage centre = a random `GRASS` or `SCRUB` tile (rejection sampling, ≤ 1000 tries, then the first land tile in row-major order); each member: genome = founder + `rng.gaussian()·lineageNoise` per trait gene, clamped `[0,1]`; position = centre + uniform disc of `clusterRadius` (`r = clusterRadius·sqrt(rng.float())`, `θ = TAU·rng.float()`), clamped inside the map, and if that tile is `WATER` moved to the nearest non-water tile by scanning rings of increasing Chebyshev radius in row-major order; `heading = TAU·rng.float()`; `energy = energyFraction × energyMax`; `species = lineage index` (temporary until P2-04); `generation = 1`; `parent = 0`. `applyPhenotype` is called before `energy`/`body` are set. `world.ledger` does not exist yet; P1-04 adds it and counts genesis energy.
- `test/helpers.js` per Conventions: `makeWorld(opts)`, `isolate(...mechanics)`, `stepN`, `alive`, `makeOrganism(world, { x, y, energy, traits })` (allocates a slot, writes genes with defaults 0.5, calls `applyPhenotype`, sets `body`), `tileIndex(world, x, y)`. When `terrain` is given, `makeWorld` bypasses `generateTerrain` (the constructor accepts an optional prebuilt terrain).
**Acceptance tests:**
- `test/unit/world.test.js`: `"genesis places every organism on a non-water tile inside the map"`, `"genesis counts match config (3×50 + 1×24)"`, `"step increments tick and updates light"`, `"hash is stable for two identical worlds and changes after a step"`, `"hash covers rng state (advancing rng changes hash)"`, `"the constructor allocates all four pheromone grids"`.
- `test/invariants/determinism.test.js`: `"seeds 1..10: two worlds stepped 5000 ticks produce identical hashes"` (64×40 via `makeWorld({ seed })`). The snapshot-restore and replay cases are added in P4-01/P4-02.
**Out of scope:** Any mechanic. Ledger. Grid.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P0-05, P1-02

### P1-04: Plants, carcasses, soil, the energy ledger and the rain intervention
**Goal:** Implement the tile-scalar energy stocks (plants, carcass, soil), their flows, exact double-precision accounting, the minimal intervention queue with `rain`, and the energy-conservation invariant.
**Files touched:** `src/core/ecology.js`, `src/core/ledger.js`, `src/core/interventions.js`, `src/core/world.js`, `src/core/config.js` (`terrain.plantCap`, `plants.*`, `carcass.*`, `soil.*`, `interventions.rain.amount`), `test/unit/ecology.test.js`, `test/unit/ledger.test.js`, `test/invariants/energy.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): row-major tile loops, `fmath` only, no allocation.
- SPEC §4.4. Plants: `p ∈ [0, cap]` with `cap = terrain.plantCap[type]` (⚠️ `[0,0,0.35,1,0.6,0]`). Per tile per tick when `plants.enabled`: `base = plants.growth × L × (1 − p/cap)` (`plants.growth` 0.004 ⚠️); `fromSoil = min(soil × soil.uptake, base × plants.soilBoost × soil)` (`soil.uptake` 0.001, `plants.soilBoost` 2.0, both ⚠️); `want = base + fromSoil`; `room = cap − p`; if `want > room` scale both parts by `room/want`. Apply and **account realised float32 deltas**: `before = plants[i]; plants[i] = fround(before + want'); applied = plants[i] − before; ledger.sunlight += applied × (base'/want'); soil[i] -= fromSoil'` (realised the same way, and the soil part of `applied` is `flows.uptake`). Tiles with `cap = 0` or `L = 0` are skipped.
- Initial plants at genesis: `p = plants.initialFill × cap` (0.6) and `ledger.genesis += Σ p`, plus `Σ (energy + body)` of the genesis population.
- Carcass decay when `carcass.enabled`: `rate = type === MUD ? carcass.decayMud : carcass.decay` (0.0007 / 0.002 ⚠️); `Δ = carcass × rate` realised; `soil += Δ` realised; any rounding gap → `ledger.dissipated`. `flows.decay += Δ`.
- `ledger.js`: `class Ledger { genesis, sunlight, hand, dissipated: number (doubles); flows: { photosynthesis, uptake, decay, grazing, scavenging, predation, metabolism, births, deaths } }`, `stocks(world)` → `{ plants, organisms, carcass, soil, total }` summed in doubles in row-major / slot order, `relativeError(world)` = `|stocks.total + dissipated − (genesis + sunlight + hand)| / max(1, genesis + sunlight + hand)`. **Rule for every later task: account the realised change `after − before` of the Float32 stock, never the intended amount; any gap between intended and realised goes to `dissipated`.**
- `interventions.js`: `queueIntervention(world, ev)` inserts `ev` (`{ tick, kind, ...params }`; `tick` must be ≥ `world.tick + 1` else throw) into `world.pending` keeping it sorted by `(tick, insertion order)`; `applyDue(world)` is the first stage of `step()` after `tick++`/light: apply every pending event with `ev.tick === world.tick` in order, append each to `world.interventions`. Kinds now: `rain` → every tile with `cap > 0`: `p = min(cap, p + interventions.rain.amount)` (0.3), realised delta to `ledger.hand`. Other kinds throw `Error('unknown intervention kind')` until P4-02.
- `step()` order now: `tick++; light; applyDue; growPlants; decayCarcasses`.
**Acceptance tests:**
- `test/unit/ecology.test.js`: `"plant growth is zero at L = 0"` (isolate plants; force tick at night), `"growth follows g·L·(1 − p/cap) at soil = 0"` (compare one tick to the formula within 1e-6, using config values, not literals), `"soil raises growth and is consumed"`, `"carcass decays to soil, slower on mud"`, `"plants never exceed cap"`, `"rain adds up to amount per tile, capped, and is counted as hand"`.
- `test/unit/ledger.test.js`: `"genesis equals initial stocks"`, `"relativeError is 0 on a fresh world"`, `"queueIntervention rejects past ticks and keeps order"`.
- `test/invariants/energy.test.js`: `"the energy identity holds within 1e-3 relative error every 100 ticks over 10,000 ticks with interventions"` (64×40 default world; rain at ticks 2000 and 5000; P4-02 adds fire and meteor to this same test).
**Out of scope:** Grazing, metabolism, death, regrowth debt (P3-04).
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P1-03

### P1-05: Spatial grid and senses
**Goal:** Build the per-tick spatial hash and the 17-value brain input vector for every organism, including the vision curve and terrain visibility.
**Files touched:** `src/core/grid.js`, `src/core/senses.js`, `src/core/world.js`, `src/core/config.js` (`senses.*`, `predation.minDiet`, `predation.maxPreySizeRatio`), `test/unit/grid.test.js`, `test/unit/senses.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): cells scanned in row-major order, items within a cell in slot order; "nearest" ties resolve to the lowest slot (strict `<` on distance, so the first found at equal distance wins because scan order is slot-ascending within a cell — **but cells are scanned before slots, so implement the tie explicitly: on equal distance keep the lower slot**). No allocation: `queryRange` writes into `world.queryOut`.
- `grid.js`: `class Grid { constructor(w, h, cell, capacity) }`, `cellsX = ceil(w/cell)`, counting-sort layout `cellCount: Int32Array`, `cellStart: Int32Array`, `items: Int32Array(capacity)`; `rebuild(store)` two passes over slots `0..highWater`; `queryRange(x, y, r, out) → n` fills `out` with every living slot whose cell intersects the square `[x−r, x+r] × [y−r, y+r]`, cell-major then slot order. Callers filter by true distance.
- `senses.js`: `INPUT = { L:0, hunger:1, ageFrac:2, threatSin:3, threatCos:4, threatProx:5, foodSin:6, foodCos:7, foodMag:8, kin:9, pher0:10, pher1:11, pher2:12, pher3:13, terrainVis:14, terrainCost:15, bias:16 }` (= `BRAIN_INPUTS` from genome.js). `gather(world, i)` writes `world.inputs[i·17 …]`:
  - `L = world.light`; `hunger = 1 − energy/energyMax`; `ageFrac = min(1, age/lifespanTicks)`.
  - Vision: `acuity = exp(−((L − λ)/σ)²)`, `range = R·(0.25 + 0.75·acuity)` (SPEC §4.5), `λ, σ, R` from `pheno`. A target `j` on tile type `t` is detected if `dist ≤ range × terrain.visibility[t]`.
  - **Directions are heading-relative**: for a target at world angle `θ`, `rel = wrapAngle(θ − heading)`, sin/cos of `rel`. (SPEC §4.7 says pheromone gradients are "along heading"; the same frame is used for threat and food so `turn` can be a function of `sin(rel)`.)
  - Threat: the nearest `j ≠ i` of a **different species** with `pheno.diet[j] ≥ predation.minDiet` (0.5) and `size[i] ≤ size[j] × predation.maxPreySizeRatio` (1.5), detected by `i`'s vision; `threatProx = 1 − dist/range`; else all three 0.
  - Food: `plantVec` = Σ over 8 compass directions at `senses.sampleDistance` (3) tiles of `dir × plants[tile]` (out-of-map or water samples count 0), `plantMag = max sample / cap_max` where `cap_max = max(terrain.plantCap)`; `preyVec` = unit vector to the nearest detectable prey (`j` of different species, `diet[i] ≥ predation.minDiet`, `size[j] ≤ size[i] × ratio`) with magnitude `1 − dist/range`, else the carcass 8-direction sample vector (like plants, magnitude = max carcass sample clamped to 1). `food = (1 − d)·plantVec + d·preyVec` (`d = diet[i]`); `foodSin/Cos` = direction of `food` (0,0 if `|food| < 1e-6`), `foodMag = clamp(|food|, 0, 1)`.
  - `kin = min(1, (count of same-species within senses.kinRadius (5), excluding self) / senses.kinNorm (8))`.
  - `pher0..3 = 0` until P3-01. `terrainVis = (visibility[t] − 0.45)/(1.3 − 0.45)`, `terrainCost = clamp((moveCost[t] − 1)/0.6, 0, 1)` for the tile under `i`. `bias = 1`.
- `world.step()` order now: `…; decayCarcasses; grid.rebuild(store); for i in slots: if alive: senses.gather(world, i)`. The loop body grows in P1-06.
**Acceptance tests:**
- `test/unit/grid.test.js`: `"rebuild places every living slot in exactly one cell, in slot order within the cell"`, `"queryRange finds every slot within r"`, `"queryRange never returns a slot farther than r + cellSize·√2"`, `"dead slots are excluded"`.
- `test/unit/senses.test.js`: `"acuity is 1 at L = λ and e⁻¹ at |L − λ| = σ"`, `"a target on scrub is detected only within 0.45× range; on sand within 1.3×"`, `"a nocturnal organism (λ = 0.1) sees farther at L = 0.1 than a diurnal one (λ = 0.9)"`, `"threat inputs point at the nearest predator relative to heading and proximity is 1 − d/range"`, `"an organism of the same species is never a threat"`, `"food gradient points toward the greener side"`, `"a carnivore's food input points at the nearest prey"`, `"kin counts same-species neighbours within kinRadius, not self, not others"`, `"nearest ties resolve to the lowest slot"`, `"terrainVis and terrainCost are 0..1 for every terrain type"`.
**Out of scope:** Acting on inputs (P1-06), pheromones (P3-01).
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P1-04

### P1-06: Reflex policy, movement, metabolism, aging and death
**Goal:** Make organisms move, burn energy, age and die, driven by the Phase 1 reflex policy through the same output vector the brain will use, and add the bounds invariant.
**Files touched:** `src/core/reflex.js`, `src/core/world.js`, `src/core/config.js` (`movement.*`, `metabolism.*`, `aging.*`, `organisms.turnRate`, `reflex.hungerGate`), `test/unit/reflex.test.js`, `test/unit/movement.test.js`, `test/unit/metabolism.test.js`, `test/invariants/bounds.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): slot order; `world.rng` consumed only inside the policy's wander branch, in slot order; deaths and kills are applied in `resolve()` after the loop, in slot order; `fmath` only.
- Outputs layout (`OUTPUT` enum in `reflex.js`, = `BRAIN_OUTPUTS` = 8): `turn (−1..1), throttle (0..1), eat (0..1, gate at ≥ 0.5), emit0..3 (0..1), breed (0..1, gate at ≥ 0.5)`. `world.outputs[i·8 …]`.
- `reflex.js`: `policy(world, i)` (the Phase 1 brain; replaced by `brain.forward` in P2-03) reads `inputs`, writes `outputs`: (1) if `threatProx > 0`: `turn = threatCos > 0 ? (threatSin ≥ 0 ? −1 : 1) : clamp(−2·threatSin, −1, 1)`, `throttle = 1`, `eat = 0`; (2) else if `foodMag > 0`: `turn = clamp(2·foodSin, −1, 1)`, `throttle = hunger > 0.3 ? 0.7 : 0.3`, `eat = hunger > 0.2 ? 1 : 0`; (3) else `turn = rng.range(−0.3, 0.3)`, `throttle = 0.4`, `eat = 0`; always `breed = 1`, `emit* = 0`. `reflexLayer(world, i)` (permanent, SPEC §4.7 ⚠️ `brain.reflexLayer` true, applied after whichever policy ran): if the tile under `i` has `plants > 0` or `carcass > 0` and `hunger > reflex.hungerGate` (0.15) then `eat = 1`; if `eat ≥ 0.5` then `throttle = 0` (grazing stands still; the mockup does the same).
- Movement (`movement.enabled`): `heading = wrapAngle(heading + turn × organisms.turnRate)` (0.5 rad); `v = pheno.speed × throttle / terrain.moveCost[type under i]`; `nx = x + cos(heading)·v`, `ny = y + sin(heading)·v`. Hard walls (SPEC §4.1): if `nx < 0 || nx ≥ w || ny < 0 || ny ≥ h`, do not move and set `heading = wrapAngle(heading + π)`. Water: if the destination tile is `WATER`, do not move and set `heading = wrapAngle(heading + π/2)` (swimming is P5-03). Tile of a position is `(floor(x), floor(y))`; positions live in `[0, w) × [0, h)`.
- Metabolism (`metabolism.enabled`): `cost = metabolism.base × pheno.metabolism × (0.5 + size) × (1 + metabolism.moveCost × throttle × speed / phenotype.speed[1])` (`base` 0.02, `moveCost` 3.0, both ⚠️); `paid = min(energy, cost)` realised; `ledger.dissipated += paid; flows.metabolism += paid`. If `energy ≤ 0` after paying → `dying[i] = STARVED`.
- Aging (`aging.enabled`): `age++`; if `age > lifespanTicks` → `dying[i] = OLD_AGE`.
- `resolve()`: for `i` in slot order with `dying[i] ≠ 0`: `amount = max(0, energy) + body`; `carcass[tile] += amount` realised (gap → dissipated); `flows.deaths += amount`; `counters[cause]++`; `store.free(i)`; `dying[i] = 0`. Death codes: `STARVED = 1, OLD_AGE = 2, HUNTED = 3, FIRE = 4, METEOR = 5, DISEASE = 6`, exported from `world.js`.
- `step()` order now: `…; grid.rebuild; for i: gather; policy; reflexLayer; act (move); metabolise; age; ; resolve()`. Eating and predation slot into `act` in P1-07.
**Acceptance tests:**
- `test/unit/reflex.test.js`: `"flees a threat ahead by turning hard away"`, `"turns toward food and opens the eat gate when hungry"`, `"wanders with bounded random turn when nothing is sensed"`, `"reflex layer forces eat on a food tile when hungry and stops movement while eating"`.
- `test/unit/movement.test.js`: `"throttle 1 on grass moves speed tiles per tick along the heading"`, `"mud moves at 1/1.6 and scrub at 1/1.3 of grass speed"`, `"the east wall: the organism stays inside and reverses"`, `"water is impassable and the heading rotates by π/2"`, `"movement.enabled = false freezes positions"`.
- `test/unit/metabolism.test.js`: `"standing still costs base × metab × (0.5 + size) per tick and the ledger records it as dissipated"`, `"full throttle costs (1 + moveCost × speed/speedMax) times more"`, `"an organism at zero energy dies of starvation and its body mass appears as carcass"`, `"past lifespan it dies of old age with energy + body in the carcass"`, `"the energy ledger stays exact through deaths"` (relativeError < 1e-9 after 500 ticks).
- `test/invariants/bounds.test.js`: `"no organism position outside the grid over 5000 ticks (seeds 1..3)"`, `"no NaN in energy, x, y, heading"`, `"living energy is within [0, energyMax]"`.
**Out of scope:** Eating, predation, breeding.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P1-05

### P1-07: Grazing, scavenging and predation
**Goal:** Close the trophic links: plants → grazers, carcasses → scavengers, prey → predators, with exact accounting and lowest-slot contest resolution.
**Files touched:** `src/core/ecology.js`, `src/core/world.js`, `src/core/config.js` (`energy.etaHerb`, `energy.etaCarn`, `organisms.biteSize`, `predation.*`), `test/unit/ecology.test.js`, `test/unit/predation.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): attackers pick targets in slot order during the loop; kills roll `rng.chance` in attacker slot order in `resolve()`; a prey already killed this tick cannot be killed twice (the later attacker gets nothing). `fmath` only. No allocation.
- Eating (in `act`, when `eat ≥ 0.5`): `room = energyMax − energy`. Plants: `effH = energy.etaHerb × (1 − d)` (η_herb 0.7 ⚠️); `want = min(plants[t], organisms.biteSize)` (0.1 ⚠️); if `want × effH > room` then `want = room/effH`; realise `plants[t] −= want`, `energy += want × effH`, `dissipated += want − (realised gain)`; `flows.grazing += want`. Then carcass with `effC = energy.etaCarn × d` (η_carn 0.8 ⚠️), same shape, `flows.scavenging`. Skip a source when `eff ≤ 1e-6`.
- Predation (SPEC §4.4, Decisions): in the loop, if `d_i ≥ predation.minDiet` (0.5) the attacker records `attackTarget[i]` = nearest `j` within `predation.reach` (1.0 tile) of a different species with `size[j] ≤ size[i] × predation.maxPreySizeRatio` (1.5); ties lowest slot; else `−1`. In `resolve()`, before deaths: for attackers in slot order with a target still alive and not `dying`: if `rng.chance(predation.killChance)` (0.5 ⚠️): `E = max(0, energy[j]) + body[j]`; `effC = etaCarn × d_i`; `taken = min(E, room_i / effC)`; realise `energy[i] += taken × effC`; `dissipated += taken − realised gain`; `carcass[tile_j] += E − taken` realised; `flows.predation += E`; `counters.hunted++`; mark `dying[j] = HUNTED` with `body/energy already consumed` (the death pass must then add **nothing** for `j` — set `energy[j] = 0, body[j] = 0` before marking). Record the kill in `world.events` (see below).
- `world.events`: a fixed ring (`capacity 64`) of `Int32Array` columns `kind, tick, x, y, a, b` and a `head` counter; kinds `EV_HUNT = 1, EV_BIRTH = 2, EV_DEATH = 3` (`a`/`b` = species ids, or attacker/prey species). Written here for hunts and starvation/old-age deaths; consumed by the snapshot encoder (P1-12), idle POIs (P1-15) and the chronicle aggregator (P3-07).
**Acceptance tests:**
- `test/unit/ecology.test.js` (extend): `"grazing transfers energy at η_herb·(1 − d) and dissipates the rest"`, `"a full organism does not graze"`, `"a pure carnivore (d = 1) gains nothing from plants"`, `"scavenging transfers at η_carn·d from the carcass on the tile"`.
- `test/unit/predation.test.js`: `"an attacker within reach kills with killChance = 1 and never with 0"`, `"never the same species"`, `"prey larger than ratio × attacker is safe"`, `"two attackers on one prey: the lower slot eats, the higher gets nothing"`, `"prey energy + body splits exactly into attacker gain, dissipation and carcass"` (ledger relativeError < 1e-9), `"a hunt event is recorded with attacker and prey species"`.
**Out of scope:** Breeding, chronicle sentences, kill aggregation (P3-07).
**Verification:** `npm run typecheck && npm run lint && npm test && node -e "import('./src/core/world.js')"`.
**Depends on:** P1-06

### P1-08: Density-dependent breeding (asexual, no mutation)
**Goal:** Implement births with the local carrying-capacity rule from SPEC §4.5, paying for the child from the parent.
**Files touched:** `src/core/ecology.js`, `src/core/world.js`, `src/core/config.js` (`breeding.*`), `test/unit/breeding.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): eligibility and `rng.chance` in slot order during the loop; births applied in `resolve()` in queue order (= slot order) **after** kills and deaths, so a parent killed this tick does not breed. No allocation: `birthQueue`.
- Eligible when `breeding.enabled`, `outputs.breed ≥ 0.5`, `energy > breedEnergy`, `age > maturityTicks`. `N = number of living organisms (any species, excluding self) within breeding.radius` (6 tiles, Euclidean, via the grid); `p = breeding.baseRate × max(0, 1 − N / breeding.localK)` (0.01, 10, ⚠️). If `rng.chance(p)` → push `i` to `birthQueue`.
- In `resolve()` for each queued parent still alive: `slot = store.alloc()`; if `−1` skip (counter `capacityRefused++`). Child genome = exact copy (P2-01 adds mutation, P5-04 crossover). `applyPhenotype(child)`. `childEnergy = breeding.childEnergyFraction × energy[parent]` (0.35 ⚠️); `cost = childEnergy + body[child]`; if `energy[parent] < cost` → free the slot and skip. Realise `energy[parent] −= cost`, `energy[child] = childEnergy` (the sum of realised changes must equal zero; any rounding gap → `dissipated`); `flows.births += cost`. Child: `x, y = parent ± rng.range(−0.5, 0.5)` each, clamped inside the map; if that tile is `WATER`, use the parent's position. `heading = TAU·rng.float()`, `age = 0`, `species = parent's`, `generation = parent + 1`, `parent = parent id`, `sick = 0`. `counters.born++`, `EV_BIRTH` event.
**Acceptance tests:** `test/unit/breeding.test.js`: `"no births below breedEnergy or before maturity"`, `"an isolated eligible organism breeds at baseRate (10,000 single-tick trials, ±20%)"`, `"with K neighbours within radius it never breeds; with K/2 it breeds at half rate"`, `"the child receives childEnergyFraction of the parent's energy plus its body, all deducted from the parent, ledger exact"`, `"the child copies the genome exactly and inherits species, generation + 1 and the parent id"`, `"the child is born on land inside the map"`, `"a parent killed this tick does not give birth"`.
**Out of scope:** Mutation, speciation, chronicle.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P1-07

### P1-09: Chronicle core, stats sampling and the no-allocation invariant
**Goal:** Add the append-only chronicle with the `genesis` entry, periodic ecological samples with Shannon diversity, and the heap-growth invariant.
**Files touched:** `src/core/chronicle.js`, `src/core/stats.js`, `src/core/world.js`, `src/core/genesis.js`, `src/core/config.js` (`stats.*`), `test/unit/chronicle.test.js`, `test/unit/stats.test.js`, `test/invariants/allocation.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): chronicle text is a pure function of state; no wall-clock. Entries are `{ tick, kind, text, place, subjects }` (SPEC §4.11). `KIND` constants: `genesis, split, extinct, migration, 'hunt-summary', famine, plague, intervention, naming, first, weather`.
- `chronicle.js`: `class Chronicle { entries = []; pendingFrom = 0; add(tick, kind, text, place, subjects = []) ; flush() → entries.slice(pendingFrom) or null when empty (this is the one allowed allocation, and only when something happened); }`. Genesis entry text: `` `Genesis. ${n} organisms in ${lineages} lineages.` `` with `place` = region name of the first lineage's centre; P2-04 rewrites it with lineage names.
- `stats.js`: `class Stats` with ring buffers of `stats.historyLength` (1024) samples: `tick (Int32), light, pop, herb, omni, carn, plantsFraction, diversity (Float32), speciesLiving (Int32)`, a `speciesCount: Int32Array(world.maxSpecies)` scratch (`world.maxSpecies` 2048, added in P1-03 config), `head`, `n`. `sample(world)` every `stats.sampleEvery` (30) ticks: counts by `dietClass`, per-species counts, `plantsFraction = Σp / Σcap`, Shannon `H = −Σ (c/N)·log(c/N)` with `fmath.log`. `world.counters` (from P1-03) keeps its fixed keys and gains `capacityRefused, splits, extinctions, immigrations`; `stats.counters` is a reference to the same object.
- `step()` order now ends with `…; resolve(); chronicle (nothing new yet); if tick % sampleEvery === 0: stats.sample(world)`.
**Acceptance tests:**
- `test/unit/chronicle.test.js`: `"genesis entry exists at tick 0 with kind genesis and a place"`, `"flush returns only new entries and then null"`, `"entries are append-only and ordered by tick"`.
- `test/unit/stats.test.js`: `"a sample counts diet classes and species correctly"`, `"Shannon diversity of two equal species is ln 2"`, `"ring buffer wraps without losing the newest sample"`, `"plantsFraction is Σp/Σcap"`.
- `test/invariants/allocation.test.js`: `"heapUsed grows less than 4 MB over 10,000 ticks after a 2,000-tick warm-up"` (asserts `global.gc` exists — vitest is configured with `--expose-gc` — calls it before both measurements).
**Out of scope:** Sentences for other kinds, names for species, UI.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P1-08

### P1-10: Headless harness, ecology sweep columns and the throughput gate
**Goal:** Give Sonnet and the reviewer a way to see the ecology without a browser, and gate CI on simulation throughput.
**Files touched:** `scripts/headless.mjs`, `scripts/sweep.mjs`, `scripts/lib/report.mjs`, `scripts/lib/args.mjs`, `test/invariants/throughput.test.js`, `docs/development.md`.
**Design constraints:**
- Scripts import only `src/core/**` (no sim, no DOM). Determinism: the report prints `world.hash()` at the end so two runs can be compared by eye.
- `headless.mjs` flags: `--seed N` (1), `--ticks N` (30000), `--size WxH` (default config), `--config key=value` (repeatable, dotted keys, numbers/booleans parsed), `--quiet`, `--json`. Report (from `report.mjs` `ecologyReport(world)`): tick, population by diet class and by species (id, count), births, deaths by cause, hunts, capacity refusals, speciation/extinction counts (0 until P2-04), immigrations, Shannon diversity now and averaged over samples, plants fraction, vision-class histogram of the living, achieved ticks/s, `hash`. Also prints the last 10 chronicle lines.
- `sweep.mjs` keeps the P0-06 terrain columns and adds: `pop herb omni carn species H plants% born starved hunted old extinctAt tps`, one row per seed; summary row with means and `survived = count(pop > 0 ∧ herb > 0 ∧ carn > 0)`. `--ticks 0` prints terrain columns only. `--json` emits one JSON object per row; `--out file` writes the table to a file as well as stdout.
- `throughput.test.js`: 64×40 world, genesis overridden to 200 organisms total (e.g. `genesis.herbivoresPerLineage` 56 and `genesis.carnivoresPerLineage` 32 → 3×56 + 32 = 200), warm-up 500 ticks, then time 3000 ticks with `process.hrtime.bigint()`; assert `ticks/s ≥ Number(process.env.THROUGHPUT_MIN ?? 2000)` (SPEC §8). Print the measured value.
**Acceptance tests:** `test/invariants/throughput.test.js` `"a 64×40 world with 200 organisms sustains ≥ 2000 ticks/s"`. Plus `test/unit/report.test.js` `"ecologyReport returns every field with finite numbers"`, `"args parser handles --config a.b=1 --config c=true"`.
**Out of scope:** Tuning any default.
**Verification:** `npm run headless -- --ticks 5000` prints a sane report (population > 0, hash printed); `npm run sweep -- --seeds 1..3 --ticks 2000`; `npm run typecheck && npm run lint && npm test`.
**Depends on:** P1-09

### P1-11: Ecology tuning and the reduced soak test
**Goal:** Tune the Phase 1 ⚠️ keys so the default world survives 30,000 ticks on most seeds, and pin a soak seed.
**Files touched:** `src/core/config.js` (defaults of ⚠️ keys only), `docs/tuning.md`, `test/soak/survival.test.js`.
**Design constraints:**
- Rule: sweep before and after; both tables in the commit message, the PROGRESS log and `docs/tuning.md` under `## P1-11 ecology — before/after`. Command: `npm run sweep -- --seeds 1..40 --ticks 30000 --out docs/sweeps/p1-11-<before|after>.txt` (commit the files too).
- Keys you may change (all ⚠️, defaults listed in Conventions): `world.width/height`, `time.*`, `terrain.plantCap`, `plants.growth`, `plants.soilBoost`, `carcass.*`, `soil.uptake`, `energy.eta*`, `organisms.energyMaxBase`, `organisms.bodyMassPerSize`, `organisms.biteSize`, `metabolism.*`, `predation.*`, `breeding.*`, `phenotype.*`, `genesis.*`. Never a formula, never a literal outside `config.js`.
- Targets: `survived ≥ 30/40`; mean population at 30k ticks in `[250, 700]` at the default size; no seed touches `world.maxOrganisms`; herbivore:carnivore ratio at the end between 3:1 and 20:1 on surviving seeds. Stop after at most 6 sweep iterations and record the best; if targets are unmet, record which and continue (the reviewer decides).
- Reduced soak (SPEC §11 Phase 1 exit): `test/soak/survival.test.js` with a `SEED` constant chosen from the sweep (a comment states the sweep row and why) runs 30,000 ticks at the default size and asserts `"population is never zero"`, `"herbivores and carnivores are both alive at the end"`, `"no NaN and positions in bounds every 1000 ticks"`, `"the energy identity holds within 1e-3 at the end"`.
**Acceptance tests:** `test/soak/survival.test.js` (above). The full suite stays green.
**Out of scope:** Any code change outside `config.js` defaults. If a mechanic is clearly broken (e.g. nothing ever breeds), do not fix it here: record it as a finding in the log and finish the task with the best table you reached.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`; `npm run headless -- --ticks 30000`.
**Depends on:** P1-10

### P1-12: Fixed-timestep scheduler, protocol and snapshot encoder
**Goal:** Implement the sim side of SPEC §6.4 as node-testable classes: message protocol, fixed-timestep scheduler with a tick budget, and the double-buffered transferable snapshot.
**Files touched:** `src/sim/protocol.js`, `src/sim/scheduler.js`, `src/sim/snapshot.js`, `src/core/config.js` (`sim.*`), `test/unit/protocol.test.js`, `test/unit/scheduler.test.js`, `test/unit/snapshot.test.js`.
**Design constraints:**
- Determinism: `src/sim` never touches `world` state except through `world.step()`, `queueIntervention`, `hash()`, and the read-only encoders. No `Math.random`, no `Date.now` (eslint). `scheduler.js` receives `now()` (ms) and `post(msg, transfer)` in its constructor; it never calls timers.
- `protocol.js`: `MSG` constants for every command and event named in Conventions, JSDoc typedefs for payloads, snapshot flag bits `FLAG_TERRAIN = 1, FLAG_PHEROMONE = 2, FLAG_SELECTED = 4, FLAG_EVENTS = 8`.
- `snapshot.js`: one `ArrayBuffer` per snapshot. Header `Int32Array(24)` at offset 0: `magic 0x464c4154, version, tick, lightBits (Float32 bit pattern), nOrgs, width, height, flags, selectedSlot, terrainDirty, offsets of each section, byteLength, eventsCount, achievedTps×100, speed`. Sections, each 4-byte aligned: organisms (compact SoA over living slots in slot order: `x, y: Float32; size, hue: Float32; species: Int32; slot: Int32; id: Uint32; energyFrac, ageFrac: Uint8; flagsByte: Uint8` with bits `sick, dietClass (2 bits), visionClass (2 bits)`; `heading: Int8` as `round(heading/π × 127)`), terrain `Uint8` (only when `FLAG_TERRAIN`), plants and carcass `Float32` (always), pheromone 4 × `Float32` (only when `FLAG_PHEROMONE`), selected record (only when `FLAG_SELECTED` and the selected id is alive: `Float32Array` = genome ++ inputs(17) ++ outputs(8) ++ `[energy, energyMax, age, lifespanTicks, x, y, heading, species, generation, parentId, sick, body]`), events since the last snapshot (`Int32` 6 per event, from `world.events`). `snapshotByteLength(cfg)` = worst case; `encodeSnapshot(world, buffer, { flags, selectedId, terrainDirty, tps, speed }) → byteLength`; `decodeSnapshot(buffer) → { header fields…, orgs: { n, x, y, … subarrays }, terrain?, plants, carcass, pher?, selected?, events }` creating only typed-array views (no copies). `class SnapshotPool { constructor(byteLength, n = 2); acquire() → ArrayBuffer | null; release(buffer) }`.
- `scheduler.js`: `class Scheduler { constructor({ now, post }) ; world = null ; speed = 1 ; paused = false ; acc = 0 ; lastNow ; achievedTps ; handle(msg) ; pump() → { ticks, behind } }`. `handle`: `load` → `makeConfig(config)`, `new World(cfg, seed)`, `runGenesis`, queue `interventions[]`, post `loaded { seed, tick, width, height, hash }`; `setSpeed(n)` (0 pauses); `pause`/`resume` (visibility); `intervene(ev)` → `queueIntervention(world, { ...ev, tick: max(ev.tick ?? 0, world.tick + 1) })`; `select(id)`; `requestSnapshot(flags)` → mark pending; `releaseSnapshot(buffer)` → pool.release; `snapshotState` and `hash` → post replies (state snapshot bytes are defined in P4-01; until then `snapshotState` posts `{ type: 'stateSnapshot', unsupported: true }`). `pump()`: `dt = now() − lastNow`; `acc += dt/1000 × speed × cfg.sim.tps`; if `acc > cfg.sim.tps` (one wall second behind) then `acc = cfg.sim.tps`, `behind = true`; run `world.step()` while `acc ≥ 1` and `now() − start < budgetMs` (`cfg.sim.batchBudgetMs` 12; constructor option overrides for the fallback); after ticks, if a snapshot is pending and a buffer is free, encode and post with transfer; post `chronicle` events from `chronicle.flush()` and `stats` when a new sample landed; post `status { tick, tps, speed, pop, behind }` at most every 250 ms of `now()`.
**Acceptance tests:**
- `test/unit/protocol.test.js`: `"every MSG name is unique"`.
- `test/unit/snapshot.test.js`: `"encode/decode round-trips header, organisms, plants and carcass"`, `"terrain is present only with FLAG_TERRAIN and pheromones only with FLAG_PHEROMONE"`, `"the selected record carries genome, inputs, outputs and scalars for a living id and is absent for a dead one"`, `"encoding into a reused buffer allocates no new ArrayBuffer (same buffer identity)"`, `"pool refuses a third acquire until a release"`.
- `test/unit/scheduler.test.js` (fake `now`, captured `post`): `"runs speed × tps ticks per simulated second"`, `"speed 0 and pause run nothing; resume continues"`, `"when the budget is blown the wall-clock target is dropped, not the simulation"` (a `now` that jumps 10 s → at most `tps` ticks run and `behind` is true), `"requestSnapshot posts one buffer with a transfer list and a second request without release is served only after release"`, `"hash command replies with world.hash()"`, `"two schedulers loaded with the same seed have equal hashes after the same pumps"`, `"intervene queues for the next tick at the earliest"`.
**Out of scope:** Worker glue, rendering, UI.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P1-09

### P1-13: Worker glue, main-thread fallback, organism and light rendering
**Goal:** Run the simulation in a Web Worker (or on the main thread when Workers are unavailable), receive snapshots and draw terrain, plants, carcasses, organisms and the day/night tint.
**Files touched:** `src/sim/worker.js`, `src/sim/main-thread.js`, `src/ui/sim-client.js`, `src/render/renderer.js`, `src/render/terrain-layer.js`, `src/render/organism-layer.js`, `src/render/lens-layer.js`, `src/main.js`, `test/unit/sim-client.test.js`, `test/unit/organism-layer.test.js`, `test/unit/lens-layer.test.js`, `test/e2e/smoke.spec.js`.
**Design constraints:**
- SPEC §3.2–§3.3, §6.4, §6.5, §10 (no `SharedArrayBuffer`; Worker with fallback). Renderer never mutates sim state; it reads decoded snapshot views only.
- `worker.js`: `const s = new Scheduler({ now: () => performance.now(), post: (m, t) => self.postMessage(m, t) })`; `self.onmessage = e => s.handle(e.data)`; pumping loop: a `MessageChannel` whose `port1.onmessage` calls `s.pump()` then `port2.postMessage(0)` (fallback `setTimeout(0)`); starts on `load`, stops while paused.
- `main-thread.js`: `createMainThreadSim()` → `{ postMessage(msg, transfer), onmessage, terminate() }` with the same `Scheduler` and `budgetMs = cfg.sim.fallbackBudgetMs` (6), pumping via `setTimeout(0)`.
- `sim-client.js`: `class SimClient { constructor(transport) ; send(type, payload = {}, transfer = []) ; on(type, handler) → unsubscribe ; }` where `transport` is a `Worker` or the fallback object. `createSim()` picks `new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' })` when `typeof Worker === 'function'`, else the fallback.
- Rendering: `terrain-layer.paintTerrain(imageData, snapshot)` adds the plant tint on grass/scrub/mud and carcass whitening exactly as the mockup's `renderTerrain` formulas; water gets no animation (deterministic frames). `organism-layer.drawOrganisms(ctx, snap, colorMode)` draws `fillRect` squares of side `round(size × 2)` px at `(x·4, y·4)` centred, colour `hsl(hue 55% 62%)` (`colorMode` `'self'` only here; the rest in P2-07). `lens-layer.drawNight(ctx, L, w, h)`: fill `rgba(8,14,34, 0.72·(1 − L))` then the warm band `rgba(227,140,58, 0.18·max(0, 1 − |L − 0.18|/0.18))`. `renderer.draw(snapshot, { night: true })`: re-paint terrain `ImageData` only when `header.terrainDirty` or every 6th snapshot (SPEC §6.5), then organisms, then night, then `present()`.
- `main.js`: `createSim()`, `client.send('load', { seed })`, per rAF: if no snapshot outstanding, `send('requestSnapshot', { flags })`; on `snapshot`: `decodeSnapshot`, `renderer.draw`, `send('releaseSnapshot', { buffer }, [buffer])`. Set `document.documentElement.dataset.painted = '1'` after the first draw and `dataset.tick` from `status` events. Terrain is no longer generated on the main thread.
**Acceptance tests:**
- `test/unit/sim-client.test.js` (fake transport): `"send forwards {type, ...payload} and the transfer list"`, `"on routes events by type and unsubscribes"`.
- `test/unit/organism-layer.test.js` (recording fake 2D context): `"one fillRect per living organism at x·4, y·4 with side round(size·2)"`, `"colour is derived from hue"`.
- `test/unit/lens-layer.test.js`: `"night alpha is 0 at L = 1 and 0.72 at L = 0"`, `"the warm band peaks at L = 0.18 and is 0 at L ≥ 0.36"`.
- `test/e2e/smoke.spec.js` (extend): `"the tick advances (data-tick increases within 3 s)"`, `"the page makes no network requests after load except same-origin assets"`.
**Out of scope:** Input handling, UI chrome, idle captions, sprites.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`; in `npm run dev` organisms move and night falls. Implement a `?worker=0` query switch in `main.js` that forces `createMainThreadSim()`, and verify both paths in the browser.
**Depends on:** P1-12

### P1-14: App state machine, input contract, floating cluster, battery pause
**Goal:** Wire SPEC §5.4's input contract (pan, pinch, wheel, tap, keys), the floating zoom/speed cluster, the idle/station mode switch (station is bare for now) and pause-on-hidden.
**Files touched:** `src/ui/app.js`, `src/ui/input.js`, `src/render/hud.js`, `src/style.css`, `src/main.js`, `index.html`, `test/ui/app.test.js`, `test/ui/input.test.js`, `test/e2e/input.spec.js`.
**Design constraints:**
- SPEC §5.4 exactly; §10 (hit targets ≥ 40 px, safe-area insets, no hover-only affordance). Keys never fire when `event.target` is `input`, `textarea`, `select` or `contenteditable`, or when `ctrlKey/metaKey` is held.
- `app.js`: `createApp({ root, sim, renderer, camera, doc = document, win = window })` — every DOM/global is injectable so jsdom tests can stub the renderer (`getContext` is not available in jsdom). State: `mode: 'idle' | 'station'`, `speed ∈ {0,1,4,16}`, `zoom`. `setMode`, `setSpeed(n)` → `sim.send('setSpeed', { speed: n })` and updates the cluster, `zoomBy(f, anchor)`, `fitWorld()`. Root gets class `idle` or `station` (mockup: `#app.idle`). Station in Phase 1 shows only the cluster at full opacity; chrome arrives in P2-08.
- `input.js`: `attachInput(canvas, handlers)` with pointer events: one-pointer drag pans (`dx/dy / zoom`), a tap is a `pointerup` with total movement ≤ 4 px and no second pointer, two pointers pinch (zoom about the midpoint, `zoom = startZoom × dist/startDist`), `wheel` zooms `exp(−deltaY × 0.0015)` about the cursor with `passive: false` and `preventDefault`. Keyboard: `space` toggles pause/1×, `1 2 3` → 1×/4×/16×, `+`/`=` and `−` zoom by 1.4, `0` fits, `Escape` → idle, any other key in idle → station. `L`, `T/A/M/K`, `E` are reserved for lenses (P2-09, P3-02) and do nothing yet.
- `hud.js`: cluster markup and CSS from the mockup (`#hud`, `.hgrp`, buttons ≥ 40×38 px, `bottom: calc(14px + env(safe-area-inset-bottom))`), dimmed to 0.4 opacity in idle, full in station. Zoom label tap = fit.
- Battery (SPEC §8): on `visibilitychange` hidden → `sim.send('pause')` and stop the rAF loop; visible → `resume` and restart.
- Debug handle for tests: `win.__flatland = { get mode(), get camera(), get speed() }` (read-only getters).
**Acceptance tests:**
- `test/ui/app.test.js` (jsdom docblock; stub sim and renderer): `"boots into idle"`, `"any key opens the station and Escape returns to idle"`, `"speed keys and cluster buttons send setSpeed"`, `"space toggles pause"`, `"keys are ignored while an input has focus"`, `"hidden document pauses the sim and visible resumes it"`.
- `test/ui/input.test.js` (jsdom `PointerEvent` polyfill if missing): `"a drag of > 4 px pans and is not a tap"`, `"a tap fires onTap with world coordinates"`, `"two pointers pinch and change the zoom"`, `"wheel zooms about the cursor"`.
- `test/e2e/input.spec.js`: `"drag pans (camera x changes)"`, `"pinch changes the zoom label"` (pixel-7 project via `page.touchscreen` / CDP `Input.dispatchTouchEvent`), `"tap on the map opens the station"`, `"key 2 shows 4× active in the cluster"`.
**Out of scope:** Idle captions and auto-camera (P1-15), station chrome (P2-08+), lenses.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`.
**Depends on:** P1-13

### P1-15: Idle mode — auto-camera, caption, ticker, clock, fonts
**Goal:** Make idle the default experience per SPEC §5.1: a drifting auto-camera over points of interest, a caption, the newest chronicle line, the world clock, a hint, and the bundled fonts.
**Files touched:** `src/ui/idle.js`, `src/ui/format.js`, `src/style.css`, `src/main.js`, `src/ui/app.js`, `package.json` (fontsource deps), `test/ui/idle.test.js`, `test/unit/format.test.js`.
**Design constraints:**
- SPEC §5.1, §5.5, §6.5 (`prefers-reduced-motion`: cut instead of glide), §3 rule 9 (fonts bundled: `@fontsource/silkscreen` latin 400/700, `@fontsource/ibm-plex-mono` latin 400/500, `@fontsource/ibm-plex-sans` latin 400/500 — import the per-weight `latin-<w>.css` files only, in `main.js`; no Google Fonts URL anywhere), §8 (idle snapshot cadence 30 fps: request a snapshot every other rAF while idle).
- `idle.js`: `createIdle({ app, camera, cfg, reduceMotion, random = Math.random })` (UI-side randomness is allowed; it never reaches the sim). Candidates from the latest snapshot: recent `EV_HUNT` (≤ 400 ticks old, weight 3), recent `EV_BIRTH` (≤ 300 ticks, weight 2), the densest 8×8-tile cell of organisms (weight 1, follows the cell centre), a random carnivore-class organism to follow (weight 2), and when `L < 0.08` a wide night shot at zoom 1.4 (weight 1.5). Pick weighted-random, hold for 8–12 s wall-clock, glide `cam += (target − cam) × 0.03` per frame at zoom 3.2 unless `reduceMotion` (then cut). Following a target updates the target position from each snapshot by `id`. User pan/pinch/wheel suspends the auto-camera for 10 s (`IDLE_OVERRIDE_MS = 10000`).
- Caption: eyebrow = kind (`A hunt`, `A birth`, `A herd`, `Following`, `Night`, `Watching`) and a sentence using `regionName` from `src/core/names.js` (pure, allowed in UI) and the species name (Phase 1: `lineage ${species}`; P2-04 supplies names via the species table in the snapshot). Ticker: newest chronicle entry as `Y1 D1 06:00 · text` (`format.js`: `tag(tick, cfg)`, `clockParts(tick, cfg)`). Clock block: big `HH:MM` and `Year · Day · Season`. Hint with the "open the field station" button. Markup and CSS per the mockup's `#idleui`, `.cap`, `.ticker`, `.hint`, `#idleclock`, `.vig`.
- Light tint remains the P1-13 night layer; idle shows it always.
**Acceptance tests:**
- `test/unit/format.test.js`: `"tag renders Y1 D1 06:00 at tick 0"`, `"clockParts splits year/day/time/season"`.
- `test/ui/idle.test.js`: `"picks a hunt POI when a recent hunt event exists (random stubbed)"`, `"a user pan suspends the auto-camera for the override window"`, `"caption contains the region name"`, `"reduced motion cuts to the target in one frame"`, `"ticker shows the newest chronicle entry"`, `"idle requests snapshots at half the frame rate"`.
**Out of scope:** POI memory (P3-09), station chrome, sprites.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`; `npm run dev`: the camera drifts, captions change, the clock runs; `grep -r "fonts.googleapis" src index.html` returns nothing.
**Depends on:** P1-14

### P1-16: Phase 1 end — push, preview, phone checks
**Goal:** Close Phase 1 with a green suite, a pushed branch and the owed phone checks recorded.
**Files touched:** `docs/PROGRESS.md`, `docs/development.md` (how to run headless/sweep, how to force the main-thread fallback).
**Design constraints:** Phase-end template (Conventions). Phone checklist to record verbatim: "(1) idle mode plays full-bleed with the day/night tint visible; (2) pinch zoom and one-finger pan work and the auto-camera resumes after ~10 s; (3) the floating cluster is thumb-tappable and sits above the gesture bar; (4) 16× keeps the UI responsive; (5) backgrounding the tab pauses the clock and foregrounding resumes it; (6) `?worker=0` still runs".
**Acceptance tests:** None new; `npm run test:all` and `npm run test:ui` green.
**Out of scope:** Any source change other than docs.
**Verification:** `npm run typecheck && npm run lint && npm run test:all && npm run build && npm run test:ui && npm run headless -- --ticks 30000`; `git push`.
**Depends on:** P1-15, P1-11

## Phase 2 — Evolution

### P2-01: Mutation and genetic distance
**Goal:** Implement SPEC §4.6 mutation (small, rare-large, slow hue) and trait-block Euclidean distance, and make every birth mutate.
**Files touched:** `src/core/genome.js`, `src/core/ecology.js` (birth calls `mutate`), `src/core/config.js` (`genome.*`), `test/unit/genome.test.js`, `test/unit/breeding.test.js` (update the exact-copy test to set `genome.pMut = 0`).
**Design constraints:**
- Determinism (SPEC §3.1): `mutate(rng, genome, offset, cfg, opts = {})` consumes `world.rng` in gene-index order: for each gene `k` of the whole genome (traits and weights): `if rng.chance(pMut)` → `g += rng.gaussian() × σ`; then independently `if rng.chance(pBig)` → `g += rng.gaussian() × 4σ`; `opts.forceBig` (used by immigration, P3-06) makes the big step unconditional. For the `hue` gene, `σ` is multiplied by `genome.hueScale`. Clamp to `[0,1]` with `fmath.clamp`. Keys (⚠️): `genome.sigmaMut` 0.05, `genome.pMut` 0.15, `genome.pBig` 0.01, `genome.hueScale` 0.2.
- `distance(genome, aOff, bOff)` (and `distanceTo(genome, off, centroid, cOff)`) = Euclidean over the 24 trait genes only (SPEC §4.6: weights excluded). `MAX_TRAIT_DISTANCE = sqrt(24)` exported.
- Births (P1-08 resolve): after copying the parent genome, `mutate(world.rng, store.genome, childOffset, cfg)`, then `applyPhenotype`.
**Acceptance tests:** `test/unit/genome.test.js` (extend): `"mutation keeps every gene in [0,1] over 10,000 mutations of an extreme genome"`, `"with pMut = 1 and pBig = 0 the per-gene change has sd ≈ σ (±15%)"`, `"with pMut = 0 and pBig = 1 the change has sd ≈ 4σ"`, `"with pMut = pBig = 0 nothing changes"`, `"hue changes with sd ≈ σ·hueScale"`, `"distance is symmetric, zero for identical trait blocks and ignores the weight block"`, `"mutation is deterministic for a given rng state"`. `test/unit/breeding.test.js`: `"the child copies the genome exactly when pMut = pBig = 0"` (renamed), `"the child differs from the parent with default mutation rates"`.
**Out of scope:** Brain evaluation, speciation.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run headless -- --ticks 5000`.
**Depends on:** P1-16

### P2-02: Brain forward pass over the SoA
**Goal:** Evaluate the SPEC §4.7 feed-forward network from the genome's weight block into the output vector, allocation-free.
**Files touched:** `src/core/brain.js`, `src/core/world.js` (scratch `hidden: Float32Array(brain.hidden)`), `src/core/config.js` (`brain.weightScale`, `brain.enabled`), `test/unit/brain.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): `fmath.tanh/exp` only; fixed loop order; no allocation.
- Layout (from `genome.js`, P1-02): weights start at `TRAIT_COUNT`; `W1[i][k]` at `24 + i·hidden + k` for input `i ∈ [0,17)`, hidden `k`; `W2[k][j]` at `24 + 17·hidden + k·8 + j` for `k ∈ [0, hidden]` where `k = hidden` is the output bias row. Gene → weight: `w = (g − 0.5) × 2 × brain.weightScale` (2.0).
- `forward(cfg, genome, gOff, inputs, inOff, outputs, outOff, hidden)`: `h_k = tanh(Σ_i W1[i][k]·in_i)`; `z_j = Σ_k W2[k][j]·h_k + W2[hidden][j]`; activations: `turn = tanh(z)`, all others `sigmoid(z) = 1/(1 + exp(−z))`. Helpers `getW1/setW1/getW2/setW2(genome, off, cfg, …)` for tests and the prior. `brain.enabled` (default true) selects `forward` over the P1 reflex policy — wiring is P2-03; this task only adds the function and the flag.
- Brain state for the inspector is already the `inputs`/`outputs` slices (SPEC §4.5 "last inputs/outputs").
**Acceptance tests:** `test/unit/brain.test.js`: `"a hand-computed toy network (two non-zero inputs, one hidden unit, one output) matches within 1e-6"`, `"all-0.5 genes give zero weights: turn 0, others 0.5"`, `"the output bias row shifts outputs without inputs"`, `"weight accessors round-trip through the SoA layout"`, `"forward allocates nothing (same scratch buffers, heap check over 100k calls < 1 MB)"`.
**Out of scope:** Wiring into `step()`, priors.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P2-01

### P2-03: Brains drive behaviour; seeded genesis prior; reflex layer retained
**Goal:** Replace the Phase 1 policy with the evolved brain while keeping the bootstrap reflex layer, and initialise genesis brains from a seeded prior so the founders survive long enough to evolve.
**Files touched:** `src/core/world.js`, `src/core/brain.js` (prior), `src/core/genesis.js`, `src/core/config.js` (`genesis.brainPrior`, `genesis.brainNoise`), `test/unit/brain.test.js`, `test/unit/world.test.js`, `test/unit/genesis.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3). SPEC §4.7 ⚠️: the reflex layer (`reflexLayer` from P1-06) stays regardless of brain output when `brain.reflexLayer` is true. SPEC §1.1: no hand-authored behaviour beyond bootstrap reflexes — the prior is that bootstrap, expressed as weights.
- In the loop: `gather` → (`cfg.brain.enabled ? brain.forward(...) : reflex.policy(...)`) → `reflexLayer` → act. The wander noise that the reflex policy used is gone when the brain runs (brains are deterministic functions; variety comes from genomes).
- Prior (`brain.writePrior(genome, off, cfg)`), in gene space, for `hidden ≥ 6` (if `brain.hidden < 6`, write only what fits, in this order): hidden 0 ← `foodSin` (w = 2), hidden 1 ← `threatSin` (w = 3), hidden 2 ← `threatProx` (w = 3), hidden 3 ← `hunger` (w = 2), hidden 4 ← `threatCos` (w = 2), hidden 5 ← `foodMag` (w = 2); every other `W1` = 0. `W2`: `turn` ← `+1.5·h0 − 2.0·h1 − 1.0·h4`; `throttle` ← `+2.0·h2 + 1.0·h3 − 0.5·h5`, bias `−0.5`; `eat` ← `+2.0·h3 + 1.5·h5`, bias `−0.5`; `breed` bias `+2.0`; `emit*` bias `−2.0`; all else 0. Gene value = `w/(2·weightScale) + 0.5`, clamped.
- Genesis: if `genesis.brainPrior === 'seeded'` (default ⚠️), the founder weight block = prior, and each member adds `rng.gaussian() × genesis.brainNoise` (0.1 ⚠️) per weight gene, clamped; if `'random'`, each weight gene = `rng.float()`. The rng call order is: trait genes, then weight genes, per member, in slot order.
**Acceptance tests:** `test/unit/brain.test.js` (extend): `"a prior brain turns toward food, away from a threat ahead, and eats when hungry on food"` (synthetic input vectors). `test/unit/genesis.test.js`: `"seeded prior founders differ only by noise (weight sd ≈ brainNoise)"`, `"random prior gives uniform weight genes"`. `test/unit/world.test.js` (extend): `"with brain.enabled = false the reflex policy runs (outputs equal the policy's)"`, `"the reflex layer forces eat on food when hungry even if the brain says otherwise"`.
**Out of scope:** Tuning, speciation.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak` (the reduced soak must still pass; if it fails, this task may adjust only `genesis.brainNoise` and the prior weights, and must record the change); `npm run headless -- --ticks 30000`.
**Depends on:** P2-02

### P2-04: Species table, speciation, extinction, phylogeny and lineage names
**Goal:** Measure speciation per SPEC §4.9, keep the phylogeny table with names per SPEC §4.10, and chronicle splits and extinctions.
**Files touched:** `src/core/species.js`, `src/core/names.js`, `src/core/world.js`, `src/core/genesis.js`, `src/core/chronicle.js`, `src/core/ecology.js`, `src/core/config.js` (`species.theta`, `species.centroidRate`), `test/unit/species.test.js`, `test/unit/names.test.js`, `test/unit/chronicle.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): species ids are allocated in creation order; assignment happens in `resolve()` right after each birth in queue order; `hash()` now also covers the species columns `ancestor, born, died, count, centroid` (appended after the store arrays). Names are strings and are not hashed (they are a function of hashed state plus renames, which are logged interventions).
- `species.js`: `class SpeciesTable { capacity = cfg.world.maxSpecies; n; ancestor: Int32Array (−1 for founders); born, died: Int32Array (died = −1 while alive); hue: Float32Array; count: Int32Array; centroid: Float32Array(capacity × 24); originX, originY: Float32Array; dietClassAtBirth: Uint8Array; names: string[] }`. `create(world, traitsOff, ancestor, x, y)`, `assignNewborn(world, slot)`: `d = distanceTo(child traits, centroid[parentSpecies])`; if `d > species.theta` (0.6 ⚠️) → new species (ancestor = parent's species), chronicle `split`; else the parent's species and `centroid += (traits − centroid) × species.centroidRate` (0.02 ⚠️; an EMA, so a species can drift and the split rule measures divergence from where the species *is*). `onDeath(world, slot, cause)`: `count--`; at 0 → `died = tick`, chronicle `extinct`, `counters.extinctions++`. Founders at genesis: one species per lineage, centroid = founder traits, named; the `genesis` chronicle text becomes `` `Genesis. ${n} lineages seeded: ${names.join(', ')}.` ``. If the table is full, the newborn stays in the parent's species (`counters.speciesRefused++`).
- Names (`names.js`): `speciesName(table, dietClass, terrainType, ordinal)` = `` `${regionWord(terrainType)} ${noun}` `` with nouns from `HERB_NOUNS / OMNI_NOUNS / CARN_NOUNS` by the founder's diet class, starting at index `ordinal % nouns.length` and advancing until unused; if every noun for that region word is taken, append ` II`, ` III`, … (roman numerals up to X, then decimal). Unique within a world.
- Sentences (`chronicle.js` `sentence(kind, ctx)`): `split` → `A new lineage, ${name}, splits from ${parent} in ${place}.` (subjects `[newId, parentId]`); `extinct` → `${name} are extinct. The last one ${verb} in ${place}.` with verb by cause: starved / was taken / died of old age / burned / was crushed by the meteor / died of the plague.
- Snapshots (P1-12) already carry `species` per organism; the value is now the species table id.
**Acceptance tests:**
- `test/unit/species.test.js`: `"a newborn within θ joins the parent species and moves the centroid by centroidRate"`, `"a newborn beyond θ founds a species whose ancestor is the parent species and born = tick"`, `"the last death records died = tick and never deletes the species"`, `"species counts sum to the living population after 2000 default ticks"`, `"hash changes when a centroid changes"`.
- `test/unit/names.test.js` (extend): `"species names are unique and cycle nouns then numerals"`, `"noun follows the founder's diet class"`.
- `test/unit/chronicle.test.js` (extend): `"split and extinct sentences name both lineages and a place"`, `"genesis lists lineage names"`.
**Out of scope:** Kill aggregation, `first` kinds, UI.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run headless -- --ticks 30000` (the report now shows speciation/extinction counts).
**Depends on:** P2-03

### P2-05: Evolution tuning — mutation, speciation, brain
**Goal:** Tune the Phase 2 ⚠️ keys so lineages persist and at least one speciation happens in most 30k-tick runs, and extend the reduced soak.
**Files touched:** `src/core/config.js` (⚠️ defaults only), `scripts/sweep.mjs` (columns `splits`, `extinct`, `gen`), `scripts/lib/report.mjs`, `docs/tuning.md`, `docs/sweeps/p2-05-*.txt`, `test/soak/survival.test.js`.
**Design constraints:**
- Sweep before and after (`--seeds 1..40 --ticks 30000`); both tables in the commit, the log and `docs/tuning.md` under `## P2-05 evolution`. Keys you may change: `genome.*`, `brain.hidden`, `species.theta`, `species.centroidRate`, `genesis.brainPrior`, `genesis.brainNoise`, plus any Phase 1 ⚠️ key if the Phase 1 targets regress. No literals outside `config.js`.
- Targets: `survived ≥ 28/40`; `splits ≥ 1` on ≥ 30/40 seeds; mean `splits` per 30k in `[1, 40]`; max generation ≥ 8 on surviving seeds. At most 6 iterations.
- Soak (SPEC §11 Phase 2 exit): add `"at least one speciation occurred by 30,000 ticks"` and `"living species ≥ 2 at the end"` to `test/soak/survival.test.js`; re-pin `SEED` if needed with the reason.
**Acceptance tests:** `test/soak/survival.test.js` as above; the full suite green.
**Out of scope:** Code changes outside `config.js` defaults and the two script files.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`.
**Depends on:** P2-04

### P2-06: Protocol extension — species table, phylogeny events, family record, richer status
**Goal:** Give the UI everything the station needs: the species table in snapshots, phylogeny events with names, the selected organism's family data, and population summaries in `status`.
**Files touched:** `src/sim/protocol.js`, `src/sim/snapshot.js`, `src/sim/scheduler.js`, `src/core/organisms.js` (`offspring: Uint16Array`), `src/core/ecology.js` (increment `offspring` at birth), `src/ui/sim-client.js`, `src/ui/species-store.js`, `test/unit/snapshot.test.js`, `test/unit/scheduler.test.js`, `test/unit/species-store.test.js`.
**Design constraints:**
- SPEC §6.4. Determinism: the store column `offspring` is added to `HASH_ORDER` (after `flags`).
- Snapshot: new section with `FLAG_SPECIES = 16`: for `i < table.n`: `ancestor, born, died, count: Int32`, `hue: Float32`. Organism `flagsByte` gains bit 5 = `sociality > 0.6` (for the sprite tail). Selected record gains `offspring, livingSiblings (same parent id, alive, ≠ self), livingKin (species count), speciesBorn, speciesAncestor` computed in the encoder by one pass over living slots (only when a selection exists).
- Events: `phylogeny { species: [{ id, name, ancestor, born, died, hue, count }] }` — the full table on `loaded`, then only species created, extinct or renamed since the last post (the scheduler tracks `lastPostedN` and a `dirty` set of ids the core marks via `table.dirty: Uint8Array` cleared after posting). `status` gains `light, season, herb, omni, carn, plantsFraction, speciesLiving, speciesTotal, dayFraction`.
- `species-store.js` (UI): `class SpeciesStore { byId: Map; apply(event); name(id); hue(id); list() }`.
**Acceptance tests:** `test/unit/snapshot.test.js` (extend): `"FLAG_SPECIES includes one row per species"`, `"the selected record carries family counts computed from the store"`, `"social flag bit set when sociality > 0.6"`. `test/unit/scheduler.test.js` (extend): `"loaded is followed by a full phylogeny event; a split posts a delta with the new species only"`, `"status carries population by class and species counts"`. `test/unit/species-store.test.js`: `"apply merges deltas and keeps names"`.
**Out of scope:** Rendering, station panes.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P2-04

### P2-07: Procedural sprites and colour modes
**Goal:** Draw organisms as genome-derived pixel sprites (SPEC §5.5) with the four colour modes and species highlight rings.
**Files touched:** `src/render/sprites.js`, `src/render/organism-layer.js`, `test/unit/sprites.test.js`, `test/unit/organism-layer.test.js`.
**Design constraints:**
- SPEC §5.5: body size from `size`, hue from `hue`, eye pixel light for nocturnal / dark otherwise, spines for carnivore class, a tail for the social flag, a sick marker; integer pixel scales only. Follow the mockup's `drawSprite` geometry: body side `px = clamp(round(size × 2), 1, 5) × scale`, spines = two pixels left/right of the body at row 1 and, when `px ≥ 3·scale`, two pixels above; tail = one pixel at the back-bottom corner; eye at the front (front chosen by `cos(heading) > 0`) one quarter down; sick marker = a violet `rgba(150,80,200,.6)` bar across the top row. Heading in the snapshot is `Int8` → `heading = value/127 × π`.
- `spriteColour(mode, org, speciesStore)`: `self` → `hsl(hue 55% 62%)` (carnivore class 65%/58%); `species` → species hue; `energy` → `hsl(35 + 10e, 40 + 60e %, 28 + 40e %)`; `age` → `hsl(90 8% (95 − 60a)%)`. Modes: `'self' | 'species' | 'energy' | 'age'`.
- `organism-layer.drawOrganisms(ctx, snap, { colorMode, speciesStore, highlightSpecies, selectedId })`: sprites, then white 1-px rings around members of `highlightSpecies`, then the sun-coloured ring around `selectedId` (SPEC §5.2).
**Acceptance tests:** `test/unit/sprites.test.js` (fake ctx): `"a carnivore-class sprite draws spines and a herbivore does not"`, `"nocturnal eye is light, diurnal dark"`, `"social flag draws a tail"`, `"sick draws the marker"`, `"all rects land on integer multiples of scale"`. `test/unit/organism-layer.test.js` (extend): `"highlighted species get rings and the selected organism gets the sun ring"`, `"colour mode energy varies with energyFrac"`.
**Out of scope:** Inspector portrait (uses `drawSprite` in P2-10), lenses.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build`; in the browser, sprites differ visibly between lineages.
**Depends on:** P2-06

### P2-08: Station shell and top bar
**Goal:** Build the station chrome grid (desktop and phone layouts) with the top bar, and make idle ↔ station a real mode switch.
**Files touched:** `index.html`, `src/style.css`, `src/ui/app.js`, `src/ui/station/topbar.js`, `src/ui/station/layout.js`, `test/ui/topbar.test.js`, `test/ui/app.test.js`, `test/e2e/station.spec.js`.
**Design constraints:**
- SPEC §5.1, §5.2, §5.5, §10. Layout and CSS from the mockup: `#app` grid `200px 1fr 300px` / `44px 1fr 190px`, areas `top/rail/world/insp/dock`; `#app.idle` collapses chrome; phone (`max-width: 900px`): rows `44px auto 1fr 170px`, rail becomes a horizontal strip, inspector a bottom sheet (P2-10), `.pop, .seed, .clock .season` hidden. Palette variables exactly as SPEC §5.5 and the mockup `:root`. Fonts via the bundled fontsource families (P1-15). Safe-area padding on `#top` (`padding-top: env(safe-area-inset-top)`) and `#dock`.
- Top bar contents and ids per the mockup: brand, `world #<seed hex>`, sun-arc SVG (`sunArc` from `light.js` via status `tick`), clock text, `Season · light NN% · day NN%`, speed group (mirrors the cluster), population summary (`plants % · grazers · hunters · lineages living/total`), Idle button. A `Share` button slot is reserved (P4-05).
- `topbar.js`: `createTopBar({ el, app, cfg })` with `update(status)`. `layout.js` owns the `#app` element structure (rail, world, inspector, dock containers exist but are empty until P2-09…P2-11).
- Mode switch: entering station from idle keeps the camera where it is; leaving station hides chrome, restarts the auto-camera after the override window.
**Acceptance tests:** `test/ui/topbar.test.js` (jsdom): `"renders the clock, season and light % from a status event"`, `"speed buttons reflect app speed"`, `"Idle button returns to idle"`, `"population summary shows plants %, grazers, hunters and lineages"`. `test/ui/app.test.js` (extend): `"station mode adds the chrome and idle removes it"`. `test/e2e/station.spec.js`: `"tap opens the station and the top bar shows a running clock"`, `"pixel-7: the rail is a horizontal strip and the inspector is hidden until selection"` (layout assertions via bounding boxes).
**Out of scope:** Rail contents, inspector, dock contents.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`.
**Depends on:** P2-07

### P2-09: Lens rail — Night, Energy density, colour-by, legend
**Goal:** Implement the lens rail with the Night and Energy density overlays, the colour-by radio and the terrain legend, plus the lens compositor.
**Files touched:** `src/ui/station/rail.js`, `src/render/lens-layer.js`, `src/render/renderer.js`, `src/ui/app.js`, `src/ui/input.js` (keys `L`, `E`), `test/ui/rail.test.js`, `test/unit/lens-layer.test.js`.
**Design constraints:**
- SPEC §5.2 (lenses are overlays on one map, toggled independently; turning Night off is night vision), §5.4 keys, §6.5 (`globalAlpha` compositing; lens layers as independent passes — Decisions §12.3).
- Lens state on the app: `{ night: true, energy: false, scent: [false, false, false, false] }` and `colorMode`. Rail chips per the mockup (`.chip`, swatch, key hint), scent chips are **added in P3-02**, not here. Legend with the six terrain colours plus carcass.
- Energy density: an overlay canvas at 1 px/tile: for each organism add `energyFrac × 0.6` alpha to a 3×3-tile stamp centred on its tile (clamped), painted with the sun colour and composited at `globalAlpha 0.7`. Implemented as `paintEnergy(imageData, snap)` (node-testable) plus the draw call.
- `renderer.draw(snap, lensState)` runs the passes in order: terrain, energy (if on), organisms, night (if on).
**Acceptance tests:** `test/ui/rail.test.js`: `"chips toggle lens state and reflect it with the on class"`, `"colour-by is a radio: exactly one on"`, `"keys L and E toggle night and energy"`. `test/unit/lens-layer.test.js` (extend): `"paintEnergy stamps 3×3 around each organism scaled by energyFrac and clamps alpha"`.
**Out of scope:** Scent lenses, pheromone snapshot flags.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build`; in the browser, `L` toggles night and `E` shows the energy heat.
**Depends on:** P2-08

### P2-10: Inspector, selection, tooltip, follow, bottom sheet
**Goal:** Select an organism by tap, show its record in the inspector (bottom sheet on phones), with live brain inputs, the genome glyph, family and Follow/Close.
**Files touched:** `src/ui/station/inspector.js`, `src/ui/station/tooltip.js`, `src/ui/app.js`, `src/ui/input.js`, `src/render/renderer.js` (selection ring already; add `pick(snap, wx, wy, r)`), `src/style.css`, `test/ui/inspector.test.js`, `test/unit/pick.test.js`, `test/e2e/station.spec.js`.
**Design constraints:**
- SPEC §5.2 inspector list, §5.4 (tap selects; no hover dependence on touch), §10 (bottom sheet on phones). Picking: nearest organism within 2.5 tiles of the tap in the latest snapshot; ties by lowest id. Selecting sends `select({ id })`; the app then requests snapshots with `FLAG_SELECTED`. Deselect on Close or when the selected id disappears from a snapshot (dead) — then the inspector shows "…died" for 3 s then empties.
- Content per mockup ids: portrait (sprite at 3× via `drawSprite`), lineage name (`<input>` present but `disabled` until P4-04, with `title="naming arrives in Phase 4"`), diet badge coloured by class, `gen N · #id`, current goal + place (`goal` derived in the UI from the outputs: `eat ≥ 0.5` → "grazing"/"feeding", `throttle > 0.7 ∧ threatProx > 0` → "fleeing", `throttle > 0.7 ∧ foodMag > 0 ∧ carnivore class` → "hunting", `throttle > 0.3` → "foraging", else "resting"), energy and age bars, `sees best at NN% light · class` and `NN% acuity` (acuity computed in the UI from `L`, λ, σ with plain `Math.exp` — UI is not core), the 17 brain inputs as labelled bars, the genome radial glyph over the 8 traits the mockup lists, family lines (`Name ← Ancestor`, `parent #id · N living siblings`, `N offspring · N living kin · lineage born Y D HH:MM`), Follow / Close.
- Follow: the camera tracks the selected organism's position from each snapshot (`renderer.camera`), zoom to 4 if lower; any manual pan cancels follow. Tooltip (mouse only, `pointerType === 'mouse'`): organism → `Name · goal · energy NN`; tile → `terrain · plants NN%` (scent added in P3-02).
- Phone: `#insp.open` bottom sheet, max-height 60%, close on Close; the sheet must not cover the floating cluster (cluster gets `bottom` raised while the sheet is open).
**Acceptance tests:** `test/unit/pick.test.js`: `"pick returns the nearest organism within r and −1 otherwise, ties by lowest id"`. `test/ui/inspector.test.js` (jsdom, fake selected record): `"renders name, diet, generation, energy and age bars"`, `"renders 17 brain input bars"`, `"derives the goal from outputs"`, `"Close clears the selection and sends select null"`, `"Follow moves the camera to the organism"`, `"the sheet opens on phone width and closes with Close"`, `"a dead selection empties the inspector"`. `test/e2e/station.spec.js` (extend): `"clicking an organism opens the inspector with a sprite"`.
**Out of scope:** Naming, chronicle, phylogeny.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`.
**Depends on:** P2-09

### P2-11: Dock — chronicle pane and live phylogeny tree
**Goal:** Add the dock with tabs, the chronicle list and the horizontal phylogeny time-tree whose branches highlight living members on the map.
**Files touched:** `src/ui/station/dock.js`, `src/ui/station/chronicle-pane.js`, `src/ui/station/phylogeny-pane.js`, `src/ui/app.js`, `src/style.css`, `test/ui/dock.test.js`, `test/ui/chronicle-pane.test.js`, `test/ui/phylogeny-pane.test.js`.
**Design constraints:**
- SPEC §4.11, §5.2. Tabs: Chronicle, Phylogeny, Charts (placeholder pane with the text "Charts arrive in Phase 3"), Hand of God (placeholder "Phase 4"). No "Design notes" toggle (mockup-only).
- Chronicle: newest first, capped at the latest 500 entries in the DOM; each row `<time tag> <text>` with classes by kind (`intervention → god`, `extinct → ext`, `split → spl`); filter chips arrive in P3-07. Entries come from `chronicle` events and are kept in a UI-side array.
- Phylogeny: SVG per the mockup's `renderPhylo`: x = time from 0 to `max(tick, DAY)`, one row per species, a line from `born` to `died ?? now`, width by `count`, dashed link from the ancestor's row, label `name · count` or `name †`. Redrawn at most every 10 frames and only while the pane is visible. Hover (mouse) or tap (touch) on a branch sets `app.highlightSpecies`; leaving/tapping again clears it. Species counts come from the snapshot species section (P2-06), names from the species store.
**Acceptance tests:** `test/ui/dock.test.js`: `"tabs switch panes and only one pane is on"`. `test/ui/chronicle-pane.test.js`: `"renders entries newest first with time tags and kind classes"`, `"caps the DOM at 500 rows"`. `test/ui/phylogeny-pane.test.js`: `"renders one line per species and a dashed link per ancestor"`, `"tapping a branch sets the highlight and tapping again clears it"`, `"does not redraw while hidden"`.
**Out of scope:** Charts, Hand of God, filters.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`.
**Depends on:** P2-10

### P2-12: Phase 2 end — push, preview, phone checks
**Goal:** Close Phase 2 with a green suite, a pushed branch and the owed phone checks recorded.
**Files touched:** `docs/PROGRESS.md`, `docs/development.md`.
**Design constraints:** Phase-end template. Phone checklist verbatim: "(1) tap opens the station; the rail strip scrolls sideways; dock tabs are reachable; (2) tapping a creature opens the bottom-sheet inspector with live brain bars, and Close dismisses it without covering the cluster; (3) tapping a phylogeny branch rings its members; (4) the pixel font renders (no fallback sans) and text is legible at arm's length; (5) Escape/Idle returns to idle and the auto-camera resumes".
**Acceptance tests:** None new; `npm run test:all` and `npm run test:ui` green.
**Out of scope:** Source changes.
**Verification:** `npm run typecheck && npm run lint && npm run test:all && npm run build && npm run test:ui && npm run headless -- --ticks 30000`; `git push`.
**Depends on:** P2-11, P2-05

## Phase 3 — Swarm and pressure

### P3-01: Pheromone channels — decay, diffusion, emission, sensing
**Goal:** Implement SPEC §4.8's four stigmergic channels and wire emission (brain outputs × genes) and sensing (gradient along heading × genes) into the loop.
**Files touched:** `src/core/pheromone.js`, `src/core/world.js`, `src/core/senses.js`, `src/core/config.js` (`pheromone.*`), `test/unit/pheromone.test.js`, `test/unit/senses.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): row-major loops; diffusion writes into `world.pherScratch` (one `Float32Array(w·h)`, allocated in the constructor) then copies back (no buffer swapping, so `HASH_ORDER` stays fixed). Bounded `O(tiles)` per step.
- `decay(world)`: `pher[c][i] *= pheromone.decay[c]` every tick (⚠️ `[.985, .96, .98, .97]`). `diffuse(world)` every `pheromone.diffuseEvery` (4 ⚠️) ticks: `new = p + rate_c × (mean of 4-neighbours − p)` with edge tiles averaging over existing neighbours (`pheromone.diffusion` ⚠️ `[.2,.2,.2,.2]`). Values clamp to `[0, 1]`.
- Emission in `act`: for each channel `c`: `pher[c][tile] = min(1, pher[c][tile] + outputs.emit_c × pheno.emit_c × pheromone.emitRate)` (`emitRate` 0.1 ⚠️), only when `outputs.emit_c ≥ 0.05`.
- Sensing in `gather`: `ahead = pher[c][tile at position + 2·(cos h, sin h)]`, `behind = pher[c][tile at position − 2·(cos h, sin h)]` (clamped in-bounds), `input = clamp(pheno.sense_c × (ahead − behind) × pheromone.senseGain, −1, 1)` (`senseGain` 4 ⚠️).
- Step order: `applyDue; growPlants; decayCarcasses; pheromone.decay; if tick % diffuseEvery === 0: pheromone.diffuse; grid.rebuild; …` (SPEC §6.3).
**Acceptance tests:** `test/unit/pheromone.test.js`: `"decay multiplies each channel by its rate"`, `"diffusion conserves total mass on an interior region and spreads a point"`, `"edge tiles do not leak"`, `"emission adds output × gene × emitRate, capped at 1"`, `"pheromone.enabled = false leaves all channels at zero"`, `"hash changes when a channel changes"`. `test/unit/senses.test.js` (extend): `"pheromone input is positive when the channel is stronger ahead and scales with the sense gene"`.
**Out of scope:** Lenses, tuning.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak && npm run headless -- --ticks 30000`.
**Depends on:** P2-12

### P3-02: Scent lenses
**Goal:** Show the four channels as heat overlays, toggled from the rail and keys, and include scent in the tile tooltip.
**Files touched:** `src/ui/station/rail.js`, `src/render/lens-layer.js`, `src/render/renderer.js`, `src/ui/input.js`, `src/ui/app.js`, `src/ui/station/tooltip.js`, `src/style.css`, `test/ui/rail.test.js`, `test/unit/lens-layer.test.js`.
**Design constraints:**
- SPEC §5.2, §5.4, §6.4 (pheromone grids are in the snapshot only when a scent lens is on → `FLAG_PHEROMONE`). Chips `Scent 1..4` with swatches `#48c2d8`, `#d85cb5`, `#e3d24a`, `#7fbb6a`; keys `T`, `A`, `M`, `K`.
- `paintScent(imageData, snap, lensState)`: per tile take the strongest enabled channel; colour = its swatch; alpha `min(255, v × 420)`; composited over terrain before organisms.
- Tooltip tile line becomes `terrain · plants NN% · scent a/b/c/d` (percent of each channel).
**Acceptance tests:** `test/ui/rail.test.js` (extend): `"scent chips and keys toggle channels independently and set the pheromone snapshot flag"`. `test/unit/lens-layer.test.js` (extend): `"paintScent picks the strongest enabled channel per tile and scales alpha"`.
**Out of scope:** Core changes.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build`; with `T` on, trails glow behind moving herds.
**Depends on:** P3-01

### P3-03: Disease
**Goal:** Implement contact-transmitted disease with kin-biased transmission, resistance, energy cost, lethality and plague chronicle entries (SPEC §4.9).
**Files touched:** `src/core/disease.js`, `src/core/world.js`, `src/core/chronicle.js`, `src/core/config.js` (`disease.*`), `test/helpers.js` (`infect(world, slot)`), `test/unit/disease.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): sick organisms iterate in slot order; candidate contacts via the grid in query order; new infections go into `world.newlySick: Uint8Array` and are applied in `resolve()` so a contact cannot relay in the same tick.
- Per sick `i` (`store.sick[i] > 0`), for each living `j ≠ i` within `disease.contactRadius` (1.0) with `sick[j] === 0`: `dist = distance(traits i, traits j) / MAX_TRAIT_DISTANCE`; `p = disease.contactRate × max(0, 1 − disease.kinBias × dist) × (1 − pheno.resistance[j])` (SPEC ⚠️ `p·(1 − dist/dist_max)`; `contactRate` 0.02, `kinBias` 1.0); `rng.chance(p)` → `newlySick[j] = 1`. Also each healthy organism catches it spontaneously with `disease.spontaneousRate` (1e-6 ⚠️) so outbreaks can start without the Hand of God. Infection sets `sick = disease.durationTicks` (1200 ⚠️), stored in `Uint16` (clamp the config to 65535).
- Per tick for sick `i`: `cost = disease.costPerTick × (1 − resistance)` (0.03 ⚠️) paid like metabolism (realised → dissipated); `sick--`; at 0: `rng.chance(disease.lethality × (1 − resistance))` (0.15 ⚠️) → `dying = DISEASE`, else recovered.
- Chronicle `plague`: when a species' sick count crosses `disease.outbreakThreshold` (10) upward and its cooldown (`disease.chronicleCooldown`, one day) has passed: `Plague among the ${name} in ${place}: ${n} sick.` (place = region of the first sick member found in slot order). Sick counts per species are maintained incrementally in `SpeciesTable.sick: Int32Array`.
- `disease.enabled` (true) gates everything. The sprite sick marker already reads `sick > 0` (P2-07).
**Acceptance tests:** `test/unit/disease.test.js`: `"spreads by contact within contactRadius and not beyond"`, `"an identical-genome neighbour is infected at contactRate and a maximally distant one never (kinBias = 1)"`, `"resistance 1 is immune and pays nothing"`, `"a sick organism pays costPerTick × (1 − resistance) into dissipated, ledger exact"`, `"at the end of the timer it dies with lethality 1 and recovers with 0"`, `"a plague entry appears once when the threshold is crossed"`, `"disease.enabled = false never infects"`.
**Out of scope:** The plague intervention (P4-02), tuning.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak && npm run headless -- --ticks 30000`.
**Depends on:** P3-01

### P3-04: Regrowth debt
**Goal:** Make overgrazed tiles regrow from a lower base for a while so herds must move (SPEC §4.9).
**Files touched:** `src/core/ecology.js`, `src/core/world.js` (`debt: Uint16Array(w·h)` in the constructor and `HASH_ORDER`), `src/core/config.js` (`regrowth.*`), `test/unit/ecology.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1). When grazing takes a tile below `regrowth.zeroThreshold` (0.01) and `regrowth.enabled`: `debt[t] = regrowth.debtTicks` (3600 ⚠️, clamp to 65535). Growth `base` is multiplied by `regrowth.debtFactor` (0.3 ⚠️) while `debt[t] > 0`; `debt[t]--` each tick in the growth loop. Debt is not energy; the ledger is unaffected.
**Acceptance tests:** `test/unit/ecology.test.js` (extend): `"a tile grazed to zero regrows at debtFactor × rate for debtTicks, then at the full rate"`, `"regrowth.enabled = false never sets debt"`, `"debt is hashed"`.
**Out of scope:** Tuning.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`.
**Depends on:** P3-03

### P3-05: Seasons on plants and the famine entry
**Goal:** Verify the seasonal light cycle starves winter plants and chronicle famines.
**Files touched:** `src/core/ecology.js`, `src/core/chronicle.js`, `src/core/world.js` (`famineArmed` flag, hashed as a byte), `src/core/config.js` (`famine.plantFraction`), `test/unit/ecology.test.js`, `test/unit/chronicle.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1). Seasons already act through `L` (SPEC §4.3); no new growth mechanic. `famine`: at each stats sample, if `plantsFraction < famine.plantFraction` (0.1 ⚠️) and `famineArmed` → add `Famine. The plants are down to ${pct}% in ${season}.` (subjects: none; place: the region of the tile with the most plants remaining) and disarm; re-arm when `plantsFraction > 2 × famine.plantFraction`.
**Acceptance tests:** `test/unit/ecology.test.js` (extend): `"plant growth summed over a mid-winter day is less than over a mid-summer day"`. `test/unit/chronicle.test.js` (extend): `"famine fires once on crossing below the threshold and re-arms above twice the threshold"`.
**Out of scope:** Temperature (P5-01).
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P3-04

### P3-06: Immigration
**Goal:** When a diet class falls below its floor, a small logged group arrives at a map edge with genomes from the extinct or nearest lineage plus a large mutation (SPEC §4.9).
**Files touched:** `src/core/ecology.js`, `src/core/species.js`, `src/core/ledger.js` (`immigration` input term), `src/core/chronicle.js`, `src/core/world.js`, `src/core/config.js` (`immigration.*`), `test/unit/ecology.test.js`, `test/unit/ledger.test.js`, `test/invariants/energy.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): checked every `immigration.checkEvery` (600) ticks after `species.markExtinct` (SPEC §6.3 order); rng consumed in a fixed order (edge, positions, genomes).
- Classes: herbivore (`dietClass === 'herbivore'`) and carnivore (`'carnivore'`); omnivores count toward neither floor. If `count(class) < floor` (`floorHerbivores` 20, `floorCarnivores` 4 ⚠️) and `tick − lastImmigration[class] ≥ immigration.cooldownTicks` (1800 ⚠️): source species = the most recently extinct species of that class (by `died`), else the living species of that class with the largest count, else (no such species ever) a fresh founder genome as in genesis. Group of `immigration.groupSize` (8 ⚠️): traits = source centroid; weight block = the weight block of the living organism of that class with the lowest slot, else the prior; then `mutate(…, { forceBig: true })`. A **new species** is created with `ancestor = source species` (so the phylogeny shows the return). Edge = `rng.int(4)` (`west, east, north, south`), positions spread along the edge on the first land tile inward (ring scan as in genesis). `energy = genesis.energyFraction × energyMax`; the created `energy + body` is added to `ledger.immigration` and the identity becomes `stocks + dissipated == genesis + sunlight + hand + immigration`.
- Chronicle `migration`: herbivores → `A herd of ${name} crosses in from the ${edge} edge.`; carnivores → `${name} arrive from the ${edge} edge, hungry.`; `counters.immigrations++`; `EV_IMMIGRATION = 4` event for the idle camera.
**Acceptance tests:** `test/unit/ecology.test.js` (extend): `"immigration fires at the floor, at an edge, with groupSize members and a migration entry"`, `"not again before cooldownTicks"`, `"the new species descends from the extinct one"`, `"immigration.enabled = false never fires"`. `test/unit/ledger.test.js` (extend): `"immigration is an input term and the identity holds"`. `test/invariants/energy.test.js`: runs unchanged and must still pass.
**Out of scope:** Tuning.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak && npm run headless -- --ticks 30000`.
**Depends on:** P3-05

### P3-07: Kill aggregation, `first` events, every chronicle sentence, chronicle filter
**Goal:** Aggregate kills per lineage per day into hunt summaries, add the `first` kinds, make every SPEC §4.11 kind produce a sentence, and add filtering to the chronicle pane.
**Files touched:** `src/core/chronicle.js`, `src/core/world.js` (`firsts` bitfield, hashed), `src/core/species.js`, `src/ui/station/chronicle-pane.js`, `src/style.css`, `test/unit/chronicle.test.js`, `test/ui/chronicle-pane.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): the kill table is fixed-size (`KILL_ROWS = 256` triples `prey, predator, count` in `Int32Array`s plus `lastX, lastY`); when full, further pairs go to an overflow counter per prey species (`KILL_OVERFLOW = 64` rows). Flushed at dawn (`tick % ticksPerDay === 0`) in row order.
- Sentences (`hunt-summary`): one per prey species with kills ≥ 1: `n === 1` → `One of the ${prey} was taken by ${pred} near ${place}.`; `n ≥ 2` → `A hard night for the ${prey} — ${n} taken by ${pred}.` (the predator with the most kills; add ` and others` if more than one predator species); subjects `[preyId, predId]`; place = region of the last kill.
- `first` kinds (each fires once per world; bits in `world.firsts`): first carnivore-class species whose ancestor was not carnivore-class → `The ${name} are the first hunters to rise from the ${ancestor}.`; first species with centroid `visionPeak < 0.35` → `The ${name} have taken to the night.`; first water crossing is P5-03. Checked in `species.assignNewborns` when a species is created and in a daily centroid scan.
- Every `KIND` has a `sentence(kind, ctx)` case: `intervention` and `naming` produce text now (used by P4-02/P4-04): `intervention` → `⚡ ${text}`; `naming` → `You named the ${old} ${new}.`; `weather` → P5-02 fills in but the case exists with a generic `${text}`.
- Chronicle pane: filter chips `All · Lineages (split, extinct, first) · Hunts · World (famine, plague, migration, weather) · ⚡ Hand`, remembered per session in `localStorage` (UI only).
**Acceptance tests:** `test/unit/chronicle.test.js` (extend): `"kills are aggregated per prey lineage per day and flushed at dawn"`, `"singular and plural hunt sentences"`, `"every KIND produces a non-empty sentence with a place"` (table-driven over `KIND`), `"first hunters and first night fire exactly once"`. `test/ui/chronicle-pane.test.js` (extend): `"filter chips hide entries of other kinds"`.
**Out of scope:** Idle POI memory (P3-09), Hand of God.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run headless -- --ticks 30000` (the last 10 chronicle lines now include hunt summaries).
**Depends on:** P3-06

### P3-08: Charts — population by lineage, diversity with light
**Goal:** Add the Charts dock pane with the population-per-lineage and Shannon-diversity charts fed by stats events.
**Files touched:** `src/sim/scheduler.js` (stats event payload), `src/ui/station/charts.js`, `src/ui/station/dock.js`, `src/style.css`, `test/unit/scheduler.test.js`, `test/ui/charts.test.js`.
**Design constraints:**
- SPEC §5.2, §6.5 (charts on their own canvases, redrawn only when visible and data changed; DPR-aware). `stats` event payload: `{ tick, light, pop, herb, omni, carn, plantsFraction, diversity, species: [[id, count], …] }` (built in the scheduler from the core sample; allocation in `sim` is fine). UI keeps the last 240 samples.
- Population chart: one polyline per species (colour = species hue, thinner when extinct), y = max count over the window, grid lines. Diversity chart: area fill of `light` (sun colour, alpha .14) under a diversity line (good colour), label `H = x.xx`. Draw with the mockup's `chart()` pattern.
**Acceptance tests:** `test/unit/scheduler.test.js` (extend): `"stats events carry species counts"`. `test/ui/charts.test.js` (fake ctx): `"draws one polyline per species"`, `"draws the light area under the diversity line"`, `"does not draw while the pane is hidden or when data is unchanged"`.
**Out of scope:** Trophic flow (P4-07).
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build`.
**Depends on:** P3-07

### P3-09: Idle POI memory and narrative captions
**Goal:** Give the idle auto-camera a bounded memory so captions can carry continuity (Decisions §12.2).
**Files touched:** `src/ui/idle.js`, `test/ui/idle.test.js`.
**Design constraints:**
- Ring of 16 past POIs `{ kind, organismId, speciesId, tick }`. When the new POI's `organismId` matches a previous one: `Following` caption → `the same ${noun}, ${ordinal} night running` if the previous sighting was on an earlier world day, else `still following ${name}`; when only the `speciesId` repeats for a hunt: `the ${name} again`. Ordinals up to "tenth". Never allocates per frame (array reuse).
- Immigration events (`EV_IMMIGRATION`) become a POI kind `Arrivals` with the edge in the caption.
**Acceptance tests:** `test/ui/idle.test.js` (extend): `"a repeated organism target on a later day says 'second night running'"`, `"a repeated species hunt says 'again'"`, `"the ring never exceeds 16"`, `"an immigration event yields an Arrivals POI"`.
**Out of scope:** Core.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build`.
**Depends on:** P3-08

### P3-10: Pressure tuning, pinned seeds and the full soak
**Goal:** Tune the Phase 3 ⚠️ keys, choose the pinned seeds with the sweep, and land the full SPEC §9.3 soak.
**Files touched:** `src/core/config.js` (⚠️ defaults only), `scripts/sweep.mjs` (columns `immig plagues maxShare% noct/crep/diur avgH`), `scripts/lib/report.mjs`, `docs/tuning.md`, `docs/sweeps/p3-10-*.txt`, `test/soak/ecology.test.js`.
**Design constraints:**
- Sweep before and after: `--seeds 1..40 --ticks 100000`. Keys you may change: `pheromone.*`, `disease.*`, `regrowth.*`, `famine.plantFraction`, `immigration.*`, and any earlier ⚠️ key if an earlier target regresses. At most 6 iterations; record everything.
- Pin two seeds that pass all §9.3 assertions with margin; record in the test file why (their sweep rows).
- `test/soak/ecology.test.js` (SPEC §9.3), 100,000 ticks per pinned seed at the default size, sampling every `stats.sampleEvery`: `"population is never zero and both herbivores and carnivores are present at the end"`, `"living species ≥ 3 at the end and mean Shannon diversity ≥ H_MIN"` (`H_MIN = 0.8` ⚠️, a named constant with a comment), `"at least one speciation and one extinction occurred"`, `"no species exceeds 70% of the population in more than 20% of samples"`, `"vision peaks at the end are not all in one class"`, `"the energy identity holds within 1e-3 at the end"`, `"positions in bounds and no NaN throughout"`. Keep `survival.test.js`.
**Acceptance tests:** `test/soak/ecology.test.js` as above.
**Out of scope:** Code changes outside `config.js` defaults and the scripts.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak` (expect several minutes).
**Depends on:** P3-09

### P3-11: Phase 3 end — push, preview, phone checks
**Goal:** Close Phase 3.
**Files touched:** `docs/PROGRESS.md`, `docs/development.md`.
**Design constraints:** Phase-end template. Phone checklist verbatim: "(1) scent lenses toggle from the strip and render as heat without frame drops; (2) charts are readable in the 170 px dock; (3) chronicle filter chips are tappable; (4) over ten minutes of idle, hunt summaries, a famine or plague, and a migration appear in the ticker; (5) sick creatures show the marker".
**Acceptance tests:** None new; `npm run test:all` and `npm run test:ui` green.
**Out of scope:** Source changes.
**Verification:** `npm run typecheck && npm run lint && npm run test:all && npm run build && npm run test:ui`; `git push`.
**Depends on:** P3-10

## Phase 4 — Keep and share

### P4-01: Save records, state snapshots, restore, and the restore determinism case
**Goal:** Implement SPEC §5.6/§6.2 `save.js`: `{ seed, configDiff, interventions }` records, full state encode/restore, and prove restore-then-continue equals a continuous run.
**Files touched:** `src/core/save.js`, `src/core/config.js` (`diffConfig`, `applyDiff`), `src/core/world.js` (`World.fromState`), `src/sim/scheduler.js` (`snapshotState`, `load` with `state`), `test/unit/save.test.js`, `test/unit/config.test.js`, `test/invariants/determinism.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §3.4): a restored world must hash identically to the source at the same tick and stay identical afterwards. Everything `hash()` covers must be in the state, plus: `chronicle.entries` (JSON, UTF-8 section), species `names`, `stats` rings and counters, `ledger` doubles, `pending` and `interventions` arrays (JSON), `events` ring, `firsts`, `famineArmed`, `lastImmigration`, kill table, `terrain.rerolls`.
- `diffConfig(cfg)` → plain object of dotted keys whose value differs from `DEFAULTS` (arrays compared element-wise); `applyDiff(diff)` → `makeConfig` result. `encodeRecord({ seed, config, interventions })` → JSON string with `configDiff`; `decodeRecord(str)`.
- `encodeState(world, buffer?)` → `ArrayBuffer` (writes into `buffer` if given and large enough; `stateByteLength(world)` reports the size; the scheduler preallocates two); layout: header `Int32Array(8)` `[magic 0x464c5354, version, tick, byteLength, sectionCount, …]`, then sections `[id: Int32, byteLength: Int32, bytes…]` 4-byte aligned. `restoreState(world, buffer)` in place; `World.fromState(cfg, seed, buffer)`. `stateHash(buffer)` = FNV-1a over the buffer.
- Scheduler: `snapshotState` → posts `{ type: 'stateSnapshot', state, hash: world.hash(), tick, record }` with `state` transferred; `load({ seed, config, interventions, state? })` restores from `state` when given and then queues only interventions with `tick > world.tick`.
**Acceptance tests:** `test/unit/save.test.js`: `"encodeRecord/decodeRecord round-trip and the diff contains only changed keys"`, `"encodeState/restoreState gives an identical hash and identical chronicle, names and stats"`, `"stateHash is stable across two encodes of the same world"`, `"restore rejects a buffer with a wrong magic or version"`. `test/unit/config.test.js` (extend): `"diffConfig of DEFAULTS is empty and applyDiff(diffConfig(c)) equals c"`. `test/invariants/determinism.test.js` (extend): `"a world restored from a state snapshot at tick 2,500 and stepped to 5,000 matches the continuous run"`.
**Out of scope:** IndexedDB, share links, UI.
**Verification:** `npm run typecheck && npm run lint && npm test`.
**Depends on:** P3-11

### P4-02: Interventions — every kind in core, replay determinism, ⚡ chronicle
**Goal:** Implement all Hand of God kinds plus rename and config as replayable intervention events (SPEC §3.6, §5.3), and prove replay determinism.
**Files touched:** `src/core/interventions.js`, `src/core/world.js`, `src/core/chronicle.js`, `src/core/species.js`, `src/core/config.js` (`interventions.*`), `test/unit/interventions.test.js`, `test/invariants/determinism.test.js`, `test/invariants/energy.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §3.6): events apply at the start of their tick in log order; tile loops row-major within the radius; organisms affected in slot order. Every applied event is appended to `world.interventions` and chronicled with kind `intervention` and the `⚡` prefix.
- Kinds and effects (radii in tiles, `interventions.<kind>.*` keys, none ⚠️):
  - `fire { x, y }` radius `fire.radius` 6: plants in radius → 0 (realised loss → `dissipated`, `flows.fire`), organisms in radius → `dying = FIRE` (their mass becomes carcass in the normal death pass). Text `Fire sweeps ${place}. ${n} dead.`
  - `meteor { x, y }` radius `meteor.radius` 5: terrain → ROCK, plants → 0 (dissipated), carcass and soil unchanged, organisms → `dying = METEOR`; sets `world.terrainDirty = true`. Text `A meteor strikes ${place}. ${n} dead.`
  - `plague { x, y }` radius `plague.radius` 4: `sick = disease.durationTicks` for organisms in radius. Text `Plague seeded in ${place}; ${n} carriers.`
  - `river { x, y }` radius `river.radius` 2: terrain → WATER, plants → 0 (dissipated); organisms standing on those tiles move to the nearest land tile (ring scan). `terrainDirty`. Text `Water opened in ${place}.`
  - `meadow { x, y }` radius `meadow.radius` 2.5 (`i² + j² ≤ 6`): non-water tiles → GRASS, `plants = max(plants, meadow.plants)` (0.5) with the created mass → `ledger.hand`. `terrainDirty`. Text `Meadow laid down in ${place}.`
  - `rain {}` (P1-04) text `Rain. Every green tile drinks.`
  - `rename { speciesId, name }`: `name` trimmed, ≤ 40 chars, made unique by the P2-04 rule; chronicle kind `naming` (not `intervention`, no ⚡), `table.dirty[id] = 1`.
  - `config { diff }`: `world.cfg = applyDiff({ ...diffConfig(world.cfg), ...diff })`; keys that change buffer sizes (`world.*`, `brain.hidden`, `stats.historyLength`) are rejected with a thrown `Error`. Text `Config changed: ${keys}.`
- `applyDue` handles all kinds; `queueIntervention` validates the kind and required fields.
- Snapshot header `terrainDirty` (P1-12) is set from `world.terrainDirty`, which the scheduler clears after encoding a snapshot that carried terrain.
**Acceptance tests:** `test/unit/interventions.test.js`: one test per kind asserting the effect and the ⚡ chronicle line (`"fire clears plants, kills in radius and dissipates the plant mass"`, `"meteor turns tiles to rock permanently"`, `"plague infects in radius"`, `"river paints water and displaces standers to land"`, `"meadow paints grass and its plant mass is counted as hand"`, `"rename changes the species name uniquely and logs naming"`, `"config changes a numeric key and rejects size keys"`), `"every applied event is appended to world.interventions in order"`. `test/invariants/determinism.test.js` (extend): `"a world replayed from {seed, interventions} with two interventions (fire at 1,000, meteor at 3,000) matches the original at 5,000"`. `test/invariants/energy.test.js` (extend): add a fire at 3,000 and a meteor at 7,000 to the run; the 1e-3 assertion is unchanged.
**Out of scope:** UI.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`.
**Depends on:** P4-01

### P4-03: Hand of God pane
**Goal:** The dock's Hand of God tab with six tools that send interventions on tap and show up in the chronicle.
**Files touched:** `src/ui/station/god-pane.js`, `src/ui/station/dock.js`, `src/ui/app.js`, `src/ui/input.js`, `src/style.css`, `test/ui/god-pane.test.js`, `test/e2e/god.spec.js`.
**Design constraints:**
- SPEC §5.3 (six tools, no spawn, no delete), §5.4 (touch path: tap with a tool armed). Tool buttons and copy per the mockup; Rain fires immediately; the others arm the cursor (`#view.god`) until a tap on the map sends `intervene({ kind, x, y })` in tile coordinates; the tool stays armed until toggled off or the tab changes. Hint text under the tools.
**Acceptance tests:** `test/ui/god-pane.test.js`: `"selecting a tool arms it and a tap sends intervene with tile coordinates"`, `"rain sends immediately without a tap"`, `"switching tabs disarms the tool"`. `test/e2e/god.spec.js`: `"a fire writes a ⚡ line to the chronicle"` (both projects).
**Out of scope:** Core.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`.
**Depends on:** P4-02

### P4-04: Lineage naming
**Goal:** Enable renaming a lineage from the inspector as a logged intervention.
**Files touched:** `src/ui/station/inspector.js`, `src/ui/species-store.js`, `test/ui/inspector.test.js`, `test/e2e/station.spec.js`.
**Design constraints:**
- SPEC §3.6, §4.10, §5.2. The name input is enabled; on `change` (blur or Enter) with a non-empty trimmed value different from the current name → `intervene({ kind: 'rename', speciesId, name })`. The UI never sets the name itself; it waits for the `phylogeny` delta (so the unique-ified name shows). Keys typed into the input never trigger shortcuts (P1-14 rule).
**Acceptance tests:** `test/ui/inspector.test.js` (extend): `"changing the name sends a rename intervention and does not change the label until the phylogeny delta arrives"`, `"typing 'l' in the name input does not toggle the night lens"`. `test/e2e/station.spec.js` (extend): `"renaming shows a 'You named…' chronicle line and the new name in the phylogeny"`.
**Out of scope:** Core.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`.
**Depends on:** P4-03

### P4-05: Share links, replay-to-tick, platform adapter
**Goal:** Encode a world as `?w=` (SPEC §5.6), load one by replaying to its tick and continuing live, and add the Share button through the platform adapter.
**Files touched:** `src/persist/share.js`, `src/platform/web.js`, `src/sim/scheduler.js`, `src/ui/station/topbar.js`, `src/ui/app.js`, `src/main.js`, `test/unit/share.test.js`, `test/unit/scheduler.test.js`, `test/ui/topbar.test.js`, `test/e2e/share.spec.js`.
**Design constraints:**
- SPEC §5.6, §10 (`platform/` adapter with one web implementation). `share.js`: `encodeShare({ seed, configDiff, interventions, tick })` → base64url of a compact JSON array `[version, seed, configDiff, ops]` where `ops` is the compacted log: a sequence of `["ff", n]` (advance `n` ticks) and `[kind, …params]` entries with tick deltas folded into `ff` records, ending with a final `ff` to `tick`. `decodeShare(str)` → `{ seed, configDiff, interventions (with absolute ticks), tick }`. Reject unknown versions.
- Scheduler `load({ …, replayTo })`: after genesis/queue, run `world.step()` in budget-sized batches (posting `status { replaying: true, progress }`) until `tick === replayTo`, ignoring `speed` during replay, then continue live at the requested speed. Replay is not throttled by wall-clock.
- `platform/web.js`: `share({ url, title })` → `navigator.share` when available else `navigator.clipboard.writeText` and return `'shared' | 'copied' | 'unavailable'`; `wakeLock()` → request a screen wake lock when `navigator.wakeLock` exists (used in idle mode; released in station and on hidden); `haptic()` no-op.
- Top bar `Share` button: asks the sim for the current record (`snapshotState` reply's `record` + `tick`), builds the URL, calls `platform.share`, shows a 2 s toast (`Link copied` / `Shared`). On boot, `?w=` takes precedence over `?seed=` and over the auto-save (P4-06).
**Acceptance tests:** `test/unit/share.test.js`: `"encode/decode round-trips seed, diff, interventions and tick"`, `"compaction folds intervention-free stretches into ff records and the encoded size of a 100k-tick log with 3 events is under 200 bytes"`, `"unknown version throws"`. `test/unit/scheduler.test.js` (extend): `"replayTo runs to the tick regardless of speed and then continues live"`. `test/ui/topbar.test.js` (extend): `"Share builds a ?w= URL and calls the platform adapter"`. `test/e2e/share.spec.js`: `"a share link reloads into the same clock and population"` (fire at some tick, take the link, open it in a new page, compare `data-tick` after replay and the population summary).
**Out of scope:** IndexedDB.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build && npm run test:ui`.
**Depends on:** P4-04

### P4-06: Auto-save, resume and background verification
**Goal:** Persist seed + log + state to IndexedDB, resume instantly on reload, and verify the resumed state by a bounded background replay (Decisions §12.4).
**Files touched:** `src/persist/db.js`, `src/persist/autosave.js`, `src/sim/scheduler.js`, `src/ui/app.js`, `src/ui/station/topbar.js` (`New world` button), `src/main.js`, `src/core/config.js` (`persist.*`), `package.json` (`fake-indexeddb` dev dep), `test/unit/db.test.js`, `test/unit/autosave.test.js`, `test/unit/scheduler.test.js`.
**Design constraints:**
- SPEC §5.6, §10 (one `persist` interface, IndexedDB implementation). `db.js`: `openStore(name = 'flatland') → { get(key), put(key, value), del(key) }` over one object store; errors reject, never throw synchronously.
- Scheduler: keeps `checkpoint` (state buffer) and `checkpointTick`, refreshed when `tick % persist.verifyReplayTicks === 0` (2000 ⚠️) into a preallocated buffer. `snapshotState` reply now includes `checkpoint` (copied, transferred) and `checkpointTick`. `load({ …, state, verify: { checkpoint, checkpointTick, expectedHash } })`: after restoring `state`, if `persist.verifyOnResume` (true ⚠️) and a checkpoint is present, create `verifier = World.fromState(cfg, seed, checkpoint)`, queue the interventions in `(checkpointTick, tick]`, and on each `pump()` spend up to half the budget stepping the verifier until `verifier.tick === tick`, then compare `verifier.hash()` to `expectedHash`; post `status { verify: 'ok' | 'mismatch', at: tick }`; on mismatch the main thread logs `console.error('[flatland] determinism mismatch after resume', …)`. The verifier is dropped afterwards.
- `autosave.js`: `startAutosave({ sim, db, intervalMs = persist.autosaveSeconds × 1000 })` — on interval and on `visibilitychange: hidden`, send `snapshotState`; on the reply, `put('world', { record, state, hash, tick, checkpoint, checkpointTick, savedAt })`. Boot order in `main.js`: `?w=` → share load; else `?seed=` → fresh; else saved `world` → resume with verification; else fresh with a random seed (`crypto.getRandomValues`, UI side) and `history.replaceState` to `?seed=`. `New world` button: `del('world')` and reload with a new random seed.
**Acceptance tests:** `test/unit/db.test.js` (fake-indexeddb): `"put/get/del round-trip"`. `test/unit/autosave.test.js` (fake timers, stub sim): `"saves on the interval and on hidden"`. `test/unit/scheduler.test.js` (extend): `"resume with a valid checkpoint reports verify ok"`, `"a tampered state reports verify mismatch"`, `"verification never runs more than verifyReplayTicks ticks"`.
**Out of scope:** PWA, e2e (P4-09 adds the resume spec).
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build`; in the browser: reload resumes with the same clock; the console shows no mismatch.
**Depends on:** P4-05

### P4-07: Trophic energy-flow chart
**Goal:** Add the third chart (SPEC §5.2): energy flow per sample between the trophic pools.
**Files touched:** `src/core/stats.js`, `src/sim/scheduler.js`, `src/ui/station/charts.js`, `test/unit/stats.test.js`, `test/ui/charts.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): `stats.sample` stores per-interval deltas of `ledger.flows` (`photosynthesis, grazing, predation, scavenging, decay, metabolism`) in ring columns, computed against a `prevFlows` copy kept in the stats object. Stats events carry `flows: { … }`.
- Chart: stacked area of the six flows per sample over the window, legend with the six colours, redrawn under the same visibility rule as the others.
**Acceptance tests:** `test/unit/stats.test.js` (extend): `"flow deltas per sample sum to the ledger flow differences"`. `test/ui/charts.test.js` (extend): `"draws six stacked areas with a legend"`.
**Out of scope:** —
**Verification:** `npm run typecheck && npm run lint && npm test && npm run build`.
**Depends on:** P4-06

### P4-08: PWA — manifest, icons, service worker, bundle budget
**Goal:** Make Flatland installable and offline (SPEC §2, §6.6, §10) with generated icons and a size budget test.
**Files touched:** `vite.config.js`, `package.json` (`vite-plugin-pwa`), `scripts/make-icons.mjs`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/icons/icon.svg`, `index.html` (`theme-color`, `apple-touch-icon`, manifest link), `src/main.js` (SW registration via `virtual:pwa-register`), `test/unit/bundle-size.test.js`, `test/unit/make-icons.test.js`, `test/e2e/pwa.spec.js`.
**Design constraints:**
- SPEC §6.6: `vite-plugin-pwa` with `strategies: 'generateSW'`, `registerType: 'autoUpdate'`, `workbox.globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}']`, `navigateFallback: 'index.html'`; no `devOptions`. Manifest: `name: Flatland`, `short_name: Flatland`, `description`, `display: standalone`, `orientation: any`, `theme_color: #0e1410`, `background_color: #0e1410`, `start_url: /`, icons 192 and 512 (`purpose: any`) and maskable 512 (`purpose: maskable`).
- `make-icons.mjs`: a 16×16 pixel-art bitmap (a green tile with a small orange creature) scaled by nearest-neighbour to 192/512 and a maskable variant with 20% safe padding, written as PNG using only `node:zlib` (deflate) and a local CRC32; deterministic bytes. Commit the outputs.
- Budget (SPEC §8): `test/unit/bundle-size.test.js` builds (`child_process`, 120 s timeout) and asserts the gzip total of `dist/**/*.{js,css,woff2}` plus `index.html` ≤ 400 kB; prints the breakdown. Fonts must stay within this; if over, drop Plex Sans 500 first (record it).
**Acceptance tests:** `test/unit/make-icons.test.js`: `"produces valid PNG signatures and the expected dimensions"`. `test/unit/bundle-size.test.js`: `"gzipped bundle including fonts is ≤ 400 kB"`. `test/e2e/pwa.spec.js`: `"the manifest is linked and served with the required fields"`, `"a service worker is registered after load"`.
**Out of scope:** `assetlinks.json`, TWA.
**Verification:** `node scripts/make-icons.mjs && npm run build && npm run test:ui && npm test`; `npm run preview` → Chrome devtools Application → Manifest shows installable, no warnings.
**Depends on:** P4-07

### P4-09: E2E completeness pass on desktop and Pixel 7
**Goal:** Make sure every SPEC §9.4 browser check exists, runs on both projects, and is stable.
**Files touched:** `test/e2e/*.spec.js`, `test/e2e/README.md`, `playwright.config.js`.
**Design constraints:**
- SPEC §9.4 list: no console errors; first frame under budget; tap opens station; pinch changes the zoom label; drag pans; a fire writes a ⚡ line; a share link reloads into the same clock and population; the PWA installs (manifest + SW). Add: `"a reload resumes at or after the previous tick"` (auto-save). `README.md` maps each bullet to its spec and test name.
- Run each spec 3× locally (`--repeat-each 3`); fix flakiness by waiting on state (`data-tick`, `data-painted`), never by sleeping.
**Acceptance tests:** All of `test/e2e/**` green on `chromium-desktop` and `pixel-7`, including the new resume spec.
**Out of scope:** New features.
**Verification:** `npm run build && npx playwright test --repeat-each 3`.
**Depends on:** P4-08

### P4-10: Phase 4 end — push, preview, phone checks
**Goal:** Close Phase 4.
**Files touched:** `docs/PROGRESS.md`, `docs/development.md`, `docs/deployment.md` (PWA notes).
**Design constraints:** Phase-end template. Phone checklist verbatim: "(1) Chrome offers Add to Home Screen; the installed app launches standalone with the dark theme colour; (2) airplane mode after a first load still runs the app; (3) Share opens the system share sheet with a working link; (4) closing and reopening the tab resumes at the same clock with no console mismatch; (5) fire, meteor and river are placeable by tap and appear in the chronicle; (6) renaming a lineage from the bottom sheet works with the on-screen keyboard and no shortcut fires".
**Acceptance tests:** None new; `npm run test:all` and `npm run test:ui` green.
**Out of scope:** Source changes.
**Verification:** `npm run typecheck && npm run lint && npm run test:all && npm run build && npm run test:ui`; `git push`.
**Depends on:** P4-09

## Phase 5 — Weather and polish

### P5-01: Temperature
**Goal:** Add the lagged ambient temperature and the preferred-temperature metabolic cost (SPEC §4.3).
**Files touched:** `src/core/light.js` (season offset helper), `src/core/world.js` (`ambient` scalar, hashed), `src/core/config.js` (`temperature.*`), `src/sim/scheduler.js` (status `temperature`), `src/ui/station/topbar.js`, `test/unit/temperature.test.js`, `test/unit/metabolism.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): `ambient` is a `Float32`-rounded scalar on the world, updated once per tick before organisms act; included in `hash()` after `nextId`.
- `target = clamp(temperature.base + temperature.dayGain × L + temperature.seasonAmp × sin(2π(yearFrac − 0.125)), 0, 1)`; `ambient += (target − ambient) × temperature.lag` (`base` 0.35, `dayGain` 0.4, `seasonAmp` 0.2, `lag` 0.002 per tick, all ⚠️; `temperature.enabled` true). Metabolism cost multiplier `× (1 + temperature.costGain × |pheno.prefTemp − ambient|)` (`costGain` 1.0 ⚠️).
- Status carries `temperature`; the top bar season text becomes `Spring · light 40% · day 55% · temp 42%`.
**Acceptance tests:** `test/unit/temperature.test.js`: `"ambient lags the target (after dusk it cools over many ticks, not at once)"`, `"mid-winter nights are colder than mid-summer nights"`, `"temperature.enabled = false keeps ambient at base"`. `test/unit/metabolism.test.js` (extend): `"the cost rises with the gap between preferred and ambient temperature"`.
**Out of scope:** Weather, tuning.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`.
**Depends on:** P4-10

### P5-02: Weather events — rain and fog
**Goal:** Add rare discrete rain (moisture pulse) and fog (vision penalty) events with chronicle entries (SPEC §4.3).
**Files touched:** `src/core/weather.js`, `src/core/world.js` (`moisture`, `fogTicks` scalars, hashed), `src/core/ecology.js`, `src/core/senses.js`, `src/core/chronicle.js`, `src/core/config.js` (`weather.*`), `test/unit/weather.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1): one `rng.chance` per event type per tick at a fixed point in `step()` (right after `applyDue`), in the order rain then fog.
- Rain: `rng.chance(weather.rainRate)` (1/(3·ticksPerDay) ⚠️) → `moisture = weather.rainMoisture` (1.0 ⚠️); each tick `moisture *= weather.moistureDecay` (0.995 ⚠️); plant growth `base` is multiplied by `(1 + moisture)` (energy still comes from sunlight; the ledger is unchanged). Fog: `rng.chance(weather.fogRate)` (1/(6·ticksPerDay) ⚠️) → `fogTicks = weather.fogTicks` (600 ⚠️); while `fogTicks > 0` every vision range is multiplied by `weather.fogVision` (0.5 ⚠️). Events are not triggered while one of the same kind is active.
- Chronicle kind `weather`: `Rain over the valley.` / `Fog settles on ${place}.` (place = region of the map centre). `weather.enabled` true.
**Acceptance tests:** `test/unit/weather.test.js`: `"rain sets moisture, which decays and boosts growth while the ledger stays exact"`, `"fog halves vision range while active"`, `"each event writes a weather entry"`, `"weather.enabled = false never rolls"`.
**Out of scope:** UI beyond the chronicle line (the idle caption may show `Weather` as a POI kind if trivial).
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`.
**Depends on:** P5-01

### P5-03: Swimming
**Goal:** Let organisms with a high swim gene cross water at a cost, and chronicle the first crossing (SPEC §4.2, §4.11).
**Files touched:** `src/core/world.js`, `src/core/reflex.js`, `src/core/senses.js`, `src/core/chronicle.js`, `src/core/config.js` (`swim.*`), `test/unit/movement.test.js`, `test/unit/chronicle.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1). `pheno.swim ≥ swim.threshold` (0.6 ⚠️) → water is passable at `terrain.moveCost[WATER]` (3; `swim.moveCost` overrides it when set, default 2.5 ⚠️); non-swimmers keep the P1-06 block. Plants are never on water; carcasses can be. The food sampler counts water samples as 0 for non-swimmers and normally for swimmers.
- `first` bit: the first organism whose tile is WATER after a move → `The ${name} are the first to cross water.`
**Acceptance tests:** `test/unit/movement.test.js` (extend): `"a swimmer enters water at the swim cost and a non-swimmer does not"`. `test/unit/chronicle.test.js` (extend): `"the first water crossing fires once"`.
**Out of scope:** Rivers changing over time.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`.
**Depends on:** P5-02

### P5-04: Mating with crossover
**Goal:** Add optional sexual reproduction gated by sociality and kin proximity (Decisions §12.1).
**Files touched:** `src/core/ecology.js`, `src/core/genome.js` (`crossover`), `src/core/organisms.js` (`parent2: Uint32Array`, hashed), `src/core/config.js` (`breeding.crossover.*`), `test/unit/breeding.test.js`, `test/unit/genome.test.js`.
**Design constraints:**
- Determinism (SPEC §3.1, §6.3): mate = the nearest living same-species organism within `breeding.crossover.mateRadius` (3 ⚠️) with `age > maturityTicks` and `pheno.sociality ≥ breeding.crossover.socialityMin` (0.5 ⚠️), ties lowest slot; found during the loop and stored in `world.mateOf: Int32Array`. In `resolve()`, if `breeding.crossover.enabled` (true ⚠️) and the parent's own sociality ≥ min and the mate is still alive: child genome = per-gene uniform crossover (`rng.chance(0.5)` picks parent or mate, gene order) then `mutate`; `parent2 = mate id`; the mate pays nothing. Otherwise asexual as before.
- `genome.crossover(rng, genome, aOff, bOff, outOff)`. Inspector family shows `parents #a × #b` when `parent2 ≠ 0` (UI change allowed in `src/ui/station/inspector.js`, add it to Files touched).
**Acceptance tests:** `test/unit/genome.test.js` (extend): `"crossover takes every gene from one of the two parents"`. `test/unit/breeding.test.js` (extend): `"with a social mate in range the child mixes both genomes and records parent2"`, `"an asocial parent breeds asexually"`, `"crossover.enabled = false never sets parent2"`.
**Out of scope:** Sexes, mate choice beyond proximity.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`.
**Depends on:** P5-03

### P5-05: Phase 5 tuning
**Goal:** Tune the Phase 5 ⚠️ keys with the sweep while keeping every soak invariant green.
**Files touched:** `src/core/config.js` (⚠️ defaults only), `scripts/sweep.mjs` (columns `swimmers crossings rain fog`), `docs/tuning.md`, `docs/sweeps/p5-05-*.txt`, `test/soak/ecology.test.js` (re-pin seeds if needed, with reasons).
**Design constraints:**
- Sweep before and after (`--seeds 1..40 --ticks 100000`). Keys you may change: `temperature.*`, `weather.*`, `swim.*`, `breeding.crossover.*`, and earlier ⚠️ keys if targets regress. Targets: all P3-10 targets still met; `survived ≥ 30/40`; mean diversity not lower than the P3-10 "after" table by more than 10%; if crossover lowers diversity beyond that, set `breeding.crossover.enabled` default to `false` and record why.
**Acceptance tests:** `test/soak/ecology.test.js` and `test/soak/survival.test.js` green.
**Out of scope:** Code outside defaults and the scripts.
**Verification:** `npm run typecheck && npm run lint && npm test && npm run test:soak`.
**Depends on:** P5-04

### P5-06: Performance pass and `docs/performance.md`
**Goal:** Measure the SPEC §8 budgets that can be measured without a phone, fix cheap regressions, and record everything.
**Files touched:** `docs/performance.md`, `test/e2e/perf.spec.js`, `scripts/perf.mjs`, plus at most two source files if a fix is needed (name them in the commit).
**Design constraints:**
- Node throughput: `scripts/perf.mjs` runs the default world for 20,000 ticks after warm-up and prints ticks/s and `process.memoryUsage()`; also the 64×40/200-organism gate number. Browser: `test/e2e/perf.spec.js` measures mean and p95 frame time over 300 frames at 1× and 16× in idle and in station on both projects using `performance.now` inside the page, and reads `performance.memory.usedJSHeapSize` when present; asserts nothing stricter than "p95 < 33 ms" (the real budget needs a real phone) and writes the numbers to the report.
- `docs/performance.md`: table per SPEC §8 with measured vs budget, the machine used, and rows marked `NOT VERIFIED (human)` for the real-phone metrics. A regression > 10% against the P1-10 throughput number is fixed here if the cause is obvious (allocation, missed grid use); otherwise recorded for the reviewer.
**Acceptance tests:** `test/e2e/perf.spec.js` `"p95 frame time under 33 ms on both projects"`; `test/invariants/throughput.test.js` still green.
**Out of scope:** Architectural changes.
**Verification:** `node scripts/perf.mjs && npm run build && npm run test:ui && npm test`.
**Depends on:** P5-05

### P5-07: Blog post draft
**Goal:** Draft the launch post from real numbers in the repo.
**Files touched:** `docs/blog-post.md`.
**Design constraints:** ~800–1200 words, Markdown: what Flatland is (SPEC §1's three properties), how a world is a seed plus its history (§3.4) with a real share link from a headless run, what actually evolved in the pinned seeds (numbers from `npm run headless -- --seed <pinned> --ticks 100000`: speciations, first hunters, night niches), determinism and the fmath decision, and a "try it" section. No invented results; every number cites the command that produced it.
**Acceptance tests:** None (docs). `npm run lint` (prettier) passes on the file.
**Out of scope:** Publishing.
**Verification:** `npm run lint`.
**Depends on:** P5-06

### P5-08: Phase 5 end — push, preview, phone checks
**Goal:** Close the build.
**Files touched:** `docs/PROGRESS.md`, `docs/development.md`, `README.md`.
**Design constraints:** Phase-end template. Phone checklist verbatim: "(1) frame time at 16× feels smooth in idle and station; (2) install and airplane-mode launch still work; (3) a rain or fog line appears within an hour of watching; (4) with the OS reduce-motion setting on, the idle camera cuts instead of gliding; (5) the temperature figure changes between day and night". Also record in the log the final `npm run headless -- --ticks 100000` summary for each pinned seed.
**Acceptance tests:** None new; `npm run test:all` and `npm run test:ui` green.
**Out of scope:** Source changes.
**Verification:** `npm run typecheck && npm run lint && npm run test:all && npm run build && npm run test:ui`; `git push`.
**Depends on:** P5-07

## Spec issues
- **§4.5 vs §11 — when mating arrives.** §4.5 says crossover is Phase 3; §11 puts it in Phase 5. Resolution: Phase 5 (P5-04), §11 is the schedule of record.
- **§4.7 — input count.** The listed inputs sum to 16 plus bias = 17, not 14. Resolution: 17 inputs, fixed by layout; only `brain.hidden` is tunable. Proposed SPEC edit: replace "14 inputs" with "17 inputs (16 signals + bias)".
- **§3.1 — byte-identical on every platform vs `Math.sin` etc.** JS engines are not required to agree on the last ulp of transcendental functions, so cross-browser share links could diverge. Resolution: `src/core/fmath.js` with polynomial approximations built on correctly-rounded primitives (P0-02); eslint bans `Math.sin/cos/exp/tanh/atan2/log/pow/hypot` in core. Proposed SPEC edit: add this to §3 rule 1.
- **§4.4 — the identity has no term for interventions or immigration, and starvation would leave no carcass mass.** Rain/meadow create plant mass, immigration creates organisms, fire destroys plants. Resolution: `ledger.hand` and `ledger.immigration` input terms and fire counted as dissipation; organisms carry `energy + body`, the body paid at birth and returned at death (Decisions). Proposed SPEC edit: `stocks + dissipated == genesis + sunlight + hand + immigration`, and define body mass.
- **§4.11 — no chronicle kind for weather** although §4.3 says each weather event is a chronicle entry. Resolution: add `weather`.
- **§6.2 — `public/index.html`.** Vite requires `index.html` at the project root; `public/` is for static assets. Resolution: root `index.html`, `public/` for `_headers`, icons, manifest source.
- **§6.6 — Node 22 "pinned".** The development machine runs Node 24. Resolution: `.node-version` = `22` (Cloudflare reads it), `engines.node >= 22.12` so 24 is accepted locally; CI uses 22.
- **§5.6 — "verify against a short replay" does not say what the replay starts from.** A replay from genesis is not short. Resolution: a periodic in-worker checkpoint at multiples of `persist.verifyReplayTicks` (Decisions §12.4).
- **§5.2 — "Energy density" lens is named but not defined.** Resolution: a heat map of organism energy (P2-09).
- **§4.8 — sensing "along heading" only.** With one scalar per channel the brain cannot tell left from right, so scent-following is klinotaxis (speed/turn modulation), not direct steering. Kept as specified (P3-01); flagged so the reviewer can decide whether a lateral component (two inputs per channel) should be added later.
- **§4.9 — `N_local` species scope.** Not stated whether the local count includes other species. Resolution: all living organisms within the radius (crowding is crowding).
- **§4.9 — "running centroid".** A cumulative mean would freeze; resolution: EMA with `species.centroidRate` (P2-04), tunable.
- **§9.3 in CI on every PR.** Two pinned seeds × 100k ticks at the default size is minutes per run. Resolution: `test:soak` is a separate script; CI runs it, `npm test` does not.
- **§5.5 / mockup — fonts.** The mockup loads Google Fonts, which §3 rule 9 forbids at runtime. Resolution: `@fontsource` packages bundled by Vite (P1-15).
- **§5.4 — scent lens keys** only `T`/`A` are given. Resolution: `T A M K`, and `E` for energy density.
- **Mockup `POPCAP`** is a global population cap; §4.5 says there is none. Resolution: follow §4.5; `world.maxOrganisms` is a memory ceiling and refusals are counted, not a mechanic.
- **§7.4 — Playwright in CI** needs browser installation (`npx playwright install --with-deps chromium`); added in P0-08. Cloudflare Pages must be connected in the dashboard by a human before any preview URL resolves (P0-09 records the URL regardless).
- **§4.2 water move cost.** The table says water is impassable for non-swimmers but gives no cost for swimmers. Resolution: `terrain.moveCost[WATER] = 3`, overridable by `swim.moveCost` (P5-03).
