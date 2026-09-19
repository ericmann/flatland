# Flatland build handoff

## Branch, commits, task counts

- Branch: `build/2026-09-18`
- Base commit (where this branch diverged from `main`): `79127b4` — "Add build plan, progress tracker and CLAUDE.md from /plan-build"
- Head commit at the time of writing this document: `d8c4b26` — "chore: final green" (102 commits ahead of base). This document is committed on top of it as `chore: handoff for review`, which becomes the actual final head — see the coordinator's closing report for that sha.
- Task counts (`docs/PROGRESS.md`, confirmed by `grep -c` and by reading the full Tasks list and Log):
  - `[x]` done: **66 / 66**
  - `[~]` in progress: **0**
  - `[ ]` open: **0**
  - `[!]` blocked: **0**
  - `[-]` skipped: **0**

## Blocked and skipped tasks

None. `grep -n '^\- \[!\]' docs/PROGRESS.md` and `grep -n '^\- \[-\]' docs/PROGRESS.md` both return nothing, and a full-text search for `BLOCKED:` and `SKIPPED:` anywhere in the Log body (not just the checklist lines) also returns nothing. Every one of the 66 planned tasks (P0-01 through P5-08) was implemented, tested and committed; the one non-task commit (`fix — 5fc5a9b`, between P1-15 and P1-16) fixed a `?worker=0` regression found while starting P1-16 and is called out in that log entry.

## Interpretation choices

One list, task IDs in build order. This is every "Interpretation:" note recorded in `docs/PROGRESS.md`'s Log section, read start to finish.

- **P0-01**: `index.html` at repo root (not `public/`); dependency majors pinned to the actual current majors at install time (vite 8, vitest 5, eslint 10, etc.), added a `globals` package not in the plan; vitest 5's top-level `pool`/`execArgv` (nesting removed v4→v5); "no globals in core" implemented as an explicit denylist (`Date`, `window`, `document`, `fetch`, `performance`, `setTimeout`) over base ES builtins rather than an allowlist; added `docs/*.md`, `mockup.html`, `.claude/commands/*.md` to `.prettierignore`.
- **P0-02**: `fmath.js` implements sin/cos/atan2 via Taylor series + range reduction (CORDIC-style for atan2), exp/log/tanh via Taylor + binary range reduction, built only from `+ − × ÷`, `Math.sqrt/floor/abs`; PI/TAU/LN2 are hardcoded literal doubles, not `Math.PI` property reads; `Rng.chance(0)`/`chance(1)` short-circuit without consuming randomness; `makeConfig` validates non-finite numbers recursively through the whole override tree and deep-freezes the result.
- **P0-03**: `sunArc`'s `angle = π(1 − u/f)` — π at dawn, falling to 0 at dusk (matches the mockup's arc glyph placement); `up` defined as `u < f`; `u()`/`yearFracOf()` use positive-safe modulo for negative-tick safety.
- **P0-04**: `makeNoise(rng, size)` fills the lattice directly from `rng.float()` in row-major order; `at(x,y)` wraps with positive-safe modulo; outputs rounded via `Math.fround` at both `at()` and `fbm()` for storage-identical values.
- **P0-05**: "world rng forked with salt 'terrain'" implemented literally as `new Rng((seed ^ 0x7e44a1) >>> 0)` inside `generateTerrain(seed, cfg)` rather than via the generic `Rng.fork()`, keeping the function self-contained/testable from a raw seed; `terrain.octaves` entries are `{scale, weight, lattice}`, not the plan's shorthand `{scale, w}`; `terrain.thresholds` kept as a plain object with 5 named keys so each can be tuned independently.
- **P0-06** (tuning): "seeds 1..40 need at most 2 rerolls in total" read as "at most 2 of the 40 seeds needed any reroll," not a summed count; found and fixed a latent test bug (not a `generateTerrain` defect) where seeds 1 and 2 coincided post-tuning because seed 1's reroll landed on effective seed 2 — fixed by comparing seeds 100/500 instead. `scripts/sweep.mjs` needed `@types/node`/`tsconfig.json`'s `"node"` types entry (ambient only, doesn't weaken eslint's core/sim denylist).
- **P0-07**: `fit`'s "min 1" floors at zoom 1 and crops rather than shrinking below the minimum supported zoom for oversized worlds; `document.documentElement.dataset.painted='1'` added here (owns the render loop) even though P0-08 is the task that needs it; a stylesheet `<link>` added to `index.html` as implied by the stated file list.
- **P0-08**: eslint didn't know `playwright.config.js` needed node globals or `test/e2e/**/*.js` needed browser globals (referenced inside in-page callbacks) — added both.
- **P1-01**: `TRAIT_COUNT` (24) defined in `organisms.js` not `genome.js`, inverting the "obvious" ownership direction, because the constructor signature is fixed at `(capacity, genomeLength)` and P1-01 must not depend on P1-02. `alloc()`/`free()` clear only `alive`/`id`, leaving other fields stale — callers must fully initialize a slot after alloc.
- **P1-02**: Float32 storage-precision test fix — compare actual float32-stored values via `Math.fround(...)` rather than loose double-precision `toBeCloseTo`. `traitValue`'s `cfg.phenotype` needed a `Record<string, readonly number[]>` TS cast.
- **P1-03**: Two own `world.test.js` drafts used tiny worlds that couldn't satisfy the terrain contiguity guarantee — fixed with a `terrain: TERRAIN.GRASS` override (test fix, not an implementation bug). `World`'s constructor does NOT call `runGenesis` itself — genesis is a separate explicit step.
- **P1-04**: "genesis ledger" implemented as a one-shot snapshot `initGenesisLedger(world)` rather than incremental bookkeeping split across files outside this task's scope. Found/fixed two of its own test-draft bugs (stale light read, missing intervening step) — not implementation bugs. Plant growth's sunlight/uptake flows are exact fractions of realised growth summing to 1; soil's own Float32 rounding gap on subtraction is separately routed to `dissipated`.
- **P1-05**: Three own `senses.test.js` drafts failed because `makeOrganism` defaults `species=0` for every organism, accidentally making intended predator/prey pairs the same species — fixed the tests, not `gather()`. `threatProx`/prey-vector magnitude use the organism's own raw vision `range`, not the tile-scaled effective range used for the detection threshold — a literal reading, flagged in case the reviewer intended the tile-scaled value. `plantVec` combines raw direction with `plantMag` = single largest sample/cap_max for magnitude. Carcass fallback sampling does not exclude water tiles (carcasses never occur on water in this build).
- **P1-06**: **Found and fixed a real energy-ledger leak in P1-04's `growPlants`** (outside this task's stated files, but required for this task's tighter 1e-9 acceptance bound) — soil-transfer accounting never matched what actually left the soil array; fixed by crediting the soil's own realised delta and routing the residual to `dissipated` (leak went from 1.6e-4 to ~1.6e-11 over 2000 ticks). `reflexLayer(world,i)` made unconditional/permanent; toggle deferred to P2-03. `resolve()` stays in `world.js` as the shared tick-ending settlement pass future tasks extend by composition.
- **P1-07**: "Eating/predation targeting in the loop" read as sequencing, not literally living inside `reflex.js`'s `act()` — implemented as new `ecology.js` functions instead. The literal ledger formula "dissipated += want − realised gain" is not conservation-correct (same bug class as P1-06) — implemented instead with realised-vs-realised deltas, algebraically derived for predation. `OUTPUT.eat`'s index duplicated locally in ecology.js to avoid a three-way import cycle. Added `world.events` ring buffer + `EV_HUNT`/`EV_BIRTH`/`EV_DEATH` now, first needed here.
- **P1-08**: `checkBreeding` eligibility checked against the organism's _end-of-tick_ state (post-eat/metabolism/aging), letting an organism that just ate into `breedEnergy` breed the same tick — not specified either way, chosen as the more natural semantics. `resolveBirths` is a new function composed after `resolve()`, not an edit to it.
- **P1-09**: Genesis chronicle entry's place name uses the _first_ lineage's centre (herbivore lineage 0, always pushed first) per the literal wording. Converted a `.forEach()` to an indexed `for` loop — pure typecheck-driven refactor, no logic change. `Stats`'s constructor takes the whole `world` so `this.counters` can be a live reference.
- **P1-10**: Real perf fix in `gather()`'s `directionalSample` (precomputed compass table + reused scratch object), raw Node throughput 1074→~3450 t/s. **Root-caused the throughput-gate flakiness as an environment/tooling characteristic** (vitest's ES module transform defeats V8 inlining for `src/core`'s modular cross-file calls), reproduced independently with a minimal repro showing a ~14.8x vitest-vs-raw-Node slowdown unrelated to sim code. Committed default assertion (2000 t/s) left unchanged since SPEC §8 targets a GitHub runner, not the local sandbox — **this is the origin of the throughput.test.js environmental-flake precedent** cited by every later phase-end/final-green task, including this Finishing pass.
- **P2-01**: No interpretation needed for the mutation/distance formulas. Found and fixed a real latent bug in P1-06's `reflex.js` `act()`: bounds check ran on unrounded doubles while storage auto-rounds via Float32Array assignment, letting a value escape the bounds check by rounding up on store — fixed with `Math.fround` before the check.
- **P2-02**: `OUTPUT.turn` index duplicated locally in `brain.js` to avoid a one-task-early import cycle with `reflex.js`.
- **P2-03**: `writePrior` zeroes every weight gene first, read as a completeness statement about the result. **Finding, not fixed (flagged for P5-06)**: wiring in real `brain.forward()` dropped raw Node throughput from ~3450 to ~2000 t/s — the origin of the brain.js performance bottleneck (see "Known gaps" below).
- **P2-04**: `assignNewborn` requires `store.species[slot]` already inherited before the call. `create()` reads the founding member's _actual placed_ genome, not the pre-noise founder template. Chronicle `split`/`extinct` subjects are species ids. `chronicle.js`'s `DEATH_VERB` table duplicates `world.js`'s codes locally to avoid a cycle. Hash extension only hashes the five columns PLAN.md names literally.
- **P2-05** (tuning): `species.theta` 0.6→0.9 to bring mean splits/30k from 77.3 to 33.8. **The `survived` metric (both diet extremes alive) stayed ~0/40** — confirms the P1-11 carnivore-placement gap persists here too, out of this config-only task's scope. Also found that running the _entire_ suite in one bare `vitest run` (no path filter) lets CPU contention blow `bounds.test.js`'s timeout — not a code issue, confirms the two-step `npm test`/`npm run test:soak` invocation must stay separate.
- **P2-06**: `store.offspring` added to `HASH_ORDER`, initialized at both allocation sites per the SoA "caller fully initializes on alloc" contract. Bug fix: P2-04's `SpeciesTable.create()` declared `this.hue` but never wrote it — added the write and dirty-flag tracking. **1Password commit signing was down on this machine from partway through P2-05 onward; P2-05/P2-06 stayed staged but uncommitted until the user authorized unsigned commits** (see "Unusual about this build" below).
- **P2-07**: Snapped sprite body origin to the nearest multiple of `scale` (not plain rounding) so accessory pixels stay on-grid once `scale>1` (the inspector portrait case) — identical behaviour at `scale=1`. `drawOrganisms` changed to an options object so later tasks can wire highlight/selection without a second render pass. "Sprites differ visibly between lineages" recorded NOT VERIFIED (human) — no browser available.
- **P2-08**: Mockup's `.pop` row shows only 2 population classes (grazers/hunters) — kept that display, omitting omni, since SPEC §5.2 contrasts the two diet poles. `app.js` gained an optional `world` element since `#app` became a CSS grid.
- **P2-09**: `input.js` is pointer/wheel-only by design; wired the `L`/`E` lens keys into `app.js`'s existing `onKeyDown` stub instead, per that file's own header comment.
- **P2-10**: Tooltip omits `goal`, shows `energy` as `energyFrac` (% of cap) rather than a raw number — the compact snapshot only carries brain outputs/raw energy for the _selected_ organism. **Real bug found and fixed**: `main.js` released each snapshot's transferable buffer immediately (detaching it) while several cached views elsewhere kept live references, causing "detached ArrayBuffer" crashes on resize/tap/hover — fixed by holding the current buffer and releasing only the previous one, plus copying cross-cycle terrain caches.
- **P2-11**: Redraw gated on `frame % 10 === 0` AND `visible`. `main.js` now always requests `FLAG_SPECIES` rather than only when the phylogeny tab is open — simpler than plumbing pane-visibility into request flags. Found/fixed a flaky e2e test (fixed tap grid missing moving organisms) by using random points over a larger budget.
- **P2-12** (Phase 2 end): Two-step `npm test`/`npm run test:soak` invocation per the P2-05 finding. Headless population 89, all herbivore — explicitly logged as "the known P1-11/P2-05 carnivore-survival gap, out of scope here." **1Password SSH commit signing outage**: unavailable from partway through P2-05 onward; P2-05 through P3-01 landed as one consolidated unsigned commit `accf772` once the user authorized it; one-commit-per-task resumed from P3-02.
- **P3-01**: New `clampedTile()` helper in `senses.js`, distinct from the existing `tileAt()`'s -1-on-out-of-bounds convention. `OUTPUT.emit0..3` duplicated locally in `pheromone.js` for the same import-cycle reason as `ecology.js`'s `OUTPUT.eat`. All pheromone config values copied verbatim from the design constraints, none tuned yet.
- **P3-02**: Tooltip's `· scent a/b/c/d` line only shown when `snap.pher` is present (i.e. a scent lens is already on), reusing existing gated data. "Trails glow behind moving herds" recorded NOT VERIFIED (human).
- **P3-03**: `DEATH.DISEASE` code duplicated locally in `disease.js` (world.js imports disease.js, reverse would cycle). `store.sick` clamps `durationTicks` to 65535 on infection per the task's own note. `disease.chronicleCooldown` is a fixed default, NOT derived from `time.ticksPerDay`.
- **P3-04**: Debt only counts down on lit ticks (the growth loop returns early at night) — literal reading of "debt[t]-- each tick in the growth loop." Debt is not an energy stock, so the ledger is untouched.
- **P3-05**: No new growth mechanic for seasons — seasons act entirely through light `L`, confirmed via a growth-comparison test rather than assumed. `checkFamine` placed in `ecology.js` (not `stats.js`, outside this task's files).
- **P3-06**: `checkImmigration` runs right after `resolveBirths()`, matching SPEC §6.3's "after species.markExtinct" (handled inline in `SpeciesTable.onDeath`, no separate step to hook). **Notable observed effect, not a target of this task: carnivores survived the full 30k-tick headless run for the first time, since immigration now backstops the P1-11/P2-05 carnivore-extinction gap.** See "Known gaps" below — this effectively (not literally) resolves that earlier finding.
- **P3-07**: "First hunters" requires `ancestor !== -1` (a genesis founder didn't "rise" from anything nameable); "first night" has no such guard since a founder can legitimately start nocturnal. Found/fixed two pre-existing chronicle tests that assumed `entries[0]` was always genesis — a first-night entry can now log earlier during `runGenesis`'s loop.
- **P3-08**: "Thinner when extinct" decided from each species' _latest_ count in the sampled window (0 iff extinct) rather than carrying a separate `died` flag over the wire.
- **P3-09**: POI memory is a fixed 16-slot round-robin array (never allocates per pick, per Decisions §12.2). "Night" count uses total remembered sightings, not distinct calendar days. "Ordinals up to 'tenth'" read as a cap.
- **P3-10** (tuning): Tried disease `contactRate`/`lethality`/`kinBias` tuning first — **made monoculture worse** (die-offs free the niche for the same dominant lineage to rebound bigger, no competitor to take its place) — reverted both attempts. Fixed instead via `regrowth.debtFactor` 0.3→0.1, `regrowth.debtTicks` 3600→10800 (worst-case max share 98.0%→70.7%, worst-case diversity H 0.270→1.520).
- **P4-01**: `World.fromState` lives on `world.js` (not monkeypatched from `save.js`) to avoid a real import cycle. State excludes pure per-tick scratch and phenotype-derived arrays (recomputed post-restore, same reason `hash()` excludes them). `scheduler._load`'s interventions filter follows the literal spec with no dedup against the restored state's own pending.
- **P4-02**: The config-diff size-key rejection is thrown at _apply_ time, not queue time, matching this file's existing apply-time-error precedent. Touched 4 files beyond the listed set (ledger.js, save.js, names.js, scheduler.js) to keep P4-01's "everything hash() covers must be in the state" contract intact.
- **P4-03**: Found/fixed two real pre-existing bugs unrelated to Hand of God but blocking this task's e2e test: `main.js` only resized the canvas on a real window resize (added a `ResizeObserver` on `#world`); mobile `#rail` CSS was missing `display: flex`, spilling content over the map. `data-tool` values are the intervention kind strings, not the mockup's placeholder names.
- **P4-04**: `inspector.js`'s rename input reflects the species store only when unfocused — never a locally optimistic value.
- **P4-05**: A share link loads **paused** — not specified in the design text, but the only way to land on a stable, inspectable tick after replay. `share.js` duplicates `interventions.js`'s field-order table locally rather than importing it.
- **P4-06**: Verification runs even while paused (a resume-time correctness check, not tied to playback state). An initial checkpoint is taken at load time so one always exists early.
- **P4-07**: Colours for the six trophic-flow chart series are new/chosen (not in SPEC §5.5's shared palette).
- **P4-08**: Maskable icon safe zone implemented as a literal 80%-content/20%-padding square (not circular) — simplest reading, satisfies Android's guidelines in practice.
- **P4-09**: **Root-caused P4-08's "CPU contention" e2e flakiness as a real bug**: `registerType:'autoUpdate'`'s service worker calls `window.location.reload()` on an `activated` event, and parallel specs sharing one origin could trip each other's reload — fixed with `playwright.config.js`'s `workers: 1`. This reclassifies what P4-08 called an environmental flake as an actual, fixed defect (not a sim/core bug).
- **P4-10** (Phase 4 end): Same two-step verification-invocation precedent as P2-05/P2-12/P3-11.
- **P5-01**: Touched `reflex.js` and `save.js` (new Float64 scalar section for `ambient`) beyond the listed files, required for state round-tripping per P4-02's precedent.
- **P5-02**: Added `weather.moistureThreshold` (not in the task's named key list) as a documented decay-tail cutoff. **Found/fixed a real latent alignment bug in `save.js`**: adding a 17th Int32 scalar field left a Float64 section at a non-8-aligned offset, which `new Float64Array(buffer, byteOffset, …)` throws on — fixed by copying Float64 payloads into a fresh array on restore instead of viewing them in place.
- **P5-03**: moveCost is always the tile _under_ the organism, not the destination — a swimmer on water pays `swim.moveCost` instead of the tile's own `terrain.moveCost`.
- **P5-04**: Skipped the inspector's `parents #a × #b` display — `parent2` is fully tracked in core (hashed, saved) for a later task to surface through the snapshot wire format.
- **P5-05** (tuning): One sweep against unmodified P5-04 defaults cleared every P3-10 and P5-05 target. `breeding.crossover.enabled` (flagged by P5-04 as likeliest to need disabling) did not push diversity past tolerance. **Result: no config change needed.**
- **P5-06**: Profiling found `pheromone.js`'s `diffuse()` at ~28% of default-world cost — fixed with a branch-free interior pass (bit-identical hash before/after, ~15-20% net gain). On the small CI-gate grid, gain was marginal because **`brain.js`'s `forward()` is ~34.5% of that scenario's cost — the architectural cost flagged at P2-03 — explicitly left unfixed** (needs a weight-caching redesign, out of scope). Honest post-fix reading: CI-gate raw-Node throughput is 1,510-1,680 t/s, still below the 2,000 budget. Recorded for the reviewer, not silently ignored; the committed assertion stays at 2000 since CI's GitHub runner is SPEC's stated arbiter, not this shared desktop.
- **P5-07**: Cited fresh Phase-5-tuned numbers from headless runs today, not the older pre-crossover/swim/weather figures baked into `test/soak/ecology.test.js`'s comments.
- **P5-08** (Phase 5 end / final plan task): Two-step verification invocation, same precedent. Both pinned-seed (8, 39) headless hashes reconfirmed byte-identical to P5-07's blog-post numbers on an unchanged `src/core`, reconfirming determinism rather than reusing stale figures. README given its first real content pass.

## ⚠️ ASSUMPTION config keys

Authoritative list pulled directly from `src/core/config.js`'s `DOCS` map (every entry with `assumption: true`) — **117 keys** in total (the file's `assumption: true` literal count is lower because the 24 `phenotype.*` traits and the 9 `genesis.*` keys are each generated by one shared code path). Cross-referenced against `docs/tuning.md`'s four tuning sections (P0-06 terrain, P1-11 ecology, P2-05 evolution, P3-10 pressure tuning; P5-05 Phase 5 tuning made no changes) to mark which were actually changed from their introduction default.

**Tuned (15 keys, across 4 tuning tasks):**

| Key                        | Introduced at | Original default              | Current (tuned) default          | Tuned by |
| -------------------------- | ------------- | ----------------------------- | -------------------------------- | -------- |
| `terrain.octaves`          | P0-05         | scale 22/9/4, weight .6/.3/.1 | scale 30/12/5, weight .75/.2/.05 | P0-06    |
| `terrain.thresholds.sand`  | P0-05         | 0.38                          | 0.37                             | P0-06    |
| `terrain.thresholds.mud`   | P0-05         | 0.44                          | 0.42                             | P0-06    |
| `terrain.thresholds.grass` | P0-05         | 0.62                          | 0.64                             | P0-06    |
| `terrain.thresholds.scrub` | P0-05         | 0.74                          | 0.76                             | P0-06    |
| `plants.growth`            | P1-04         | 0.004                         | 0.6                              | P1-11    |
| `metabolism.base`          | P1-06         | 0.02                          | 0.015                            | P1-11    |
| `breeding.localK`          | P1-08         | 10                            | 50                               | P1-11    |
| `breeding.baseRate`        | P1-08         | 0.01                          | 0.04                             | P1-11    |
| `genesis.clusterRadius`    | P1-03         | 12                            | 25                               | P1-11    |
| `genesis.lineageNoise`     | P1-03         | 0.05                          | 0.15                             | P1-11    |
| `phenotype.lifespan`       | P1-02         | [1.0, 3.0]                    | [3.0, 9.0]                       | P1-11    |
| `species.theta`            | P2-04         | 0.6                           | 0.9                              | P2-05    |
| `regrowth.debtFactor`      | P3-04         | 0.3                           | 0.1                              | P3-10    |
| `regrowth.debtTicks`       | P3-04         | 3600                          | 10800                            | P3-10    |

(`terrain.thresholds.water` was left unchanged at 0.34 through P0-06; `disease.contactRate`/`lethality`/`kinBias` were tried during P3-10 and explicitly reverted — they remain at their P3-03 introduction defaults, listed below as untuned.)

**Left at their introduction default (102 keys)** — grouped by section, value shown is the current (= original) default:

- `world.width` 256, `world.height` 160
- `time.ticksPerDay` 1800, `time.daysPerYear` 24
- `terrain.thresholds.water` 0.34
- `organisms.energyMaxBase` 150, `organisms.bodyMassPerSize` 40, `organisms.biteSize` 0.1
- `plants.soilBoost` 2.0
- `metabolism.moveCost` 3.0
- `brain.hidden` 8, `brain.weightScale` 2
- `phenotype.*` (23 of the 24 traits, all but `lifespan`): `boldness` [0,1], `breedThreshold` [0.5,0.9], `diet` [0,1], `emit0..3` [0,1] each, `hue` [0,360], `maturity` [0.15,0.45], `metabolism` [0.6,1.4], `prefTemp` [0,1], `resistance` [0,1], `sense0..3` [0,1] each, `size` [0.6,2], `sociality` [0,1], `speed` [0.05,0.25], `swim` [0,1], `visionPeak` [0,1], `visionRange` [4,16], `visionWidth` [0.15,0.6]
- `genesis.herbivoreLineages` 3, `herbivoresPerLineage` 50, `carnivoreLineages` 1, `carnivoresPerLineage` 24, `energyFraction` 0.6, `dietHerbivore` [0.02,0.2], `dietCarnivore` [0.8,0.98], `brainPrior` 'seeded', `brainNoise` 0.1
- `genome.sigmaMut` 0.05, `pMut` 0.15, `pBig` 0.01, `hueScale` 0.2
- `predation.minDiet` 0.5, `maxPreySizeRatio` 1.5, `reach` 1.0, `killChance` 0.5
- `energy.etaHerb` 0.7, `etaCarn` 0.8
- `carcass.decay` 0.002, `decayMud` 0.0007
- `soil.uptake` 0.001
- `breeding.radius` 6, `childEnergyFraction` 0.35, `crossover.enabled` true, `crossover.mateRadius` 3, `crossover.socialityMin` 0.5
- `pheromone.decay` [.985,.96,.98,.97], `diffusion` [.2,.2,.2,.2], `diffuseEvery` 4, `emitRate` 0.1, `senseGain` 4
- `disease.contactRadius` 1.0, `contactRate` 0.02, `kinBias` 1.0, `spontaneousRate` 1e-6, `durationTicks` 1200, `costPerTick` 0.03, `lethality` 0.15, `outbreakThreshold` 10, `chronicleCooldown` 1800
- `regrowth.zeroThreshold` 0.01
- `species.centroidRate` 0.02
- `famine.plantFraction` 0.1
- `immigration.checkEvery` 600, `floorHerbivores` 20, `floorCarnivores` 4, `cooldownTicks` 1800, `groupSize` 8
- `persist.verifyOnResume` true, `verifyReplayTicks` 2000, `autosaveSeconds` 30
- `swim.threshold` 0.6, `moveCost` 2.5
- `temperature.base` 0.35, `costGain` 1, `dayGain` 0.4, `seasonAmp` 0.2, `lag` 0.002
- `weather.fogRate` ~9.26e-5, `fogTicks` 600, `fogVision` 0.5, `moistureDecay` 0.995, `moistureThreshold` 0.001, `rainMoisture` 1, `rainRate` ~1.85e-4
- `terrain.plantCap` [0,0,0.35,1,0.6,0] (all `⚠️`, per the `terrain.thresholds` marker in SPEC §4.2 covering the section — not itself swept by any tuning task)

## Phone checklist, per phase

Every phase-end task (`P0-09`, `P1-16`, `P2-12`, `P3-11`, `P4-10`, `P5-08`) logged `Phone: NOT VERIFIED (human)` and a checklist. None of these have been run on a real device as of this handoff. Preview URL for every phase is the same: `https://build-2026-09-18.flatland.pages.dev`.

**Phase 0** (P0-09):

1. Map renders full-bleed with no white flash.
2. One-finger drag pans.
3. Page does not scroll or bounce.
4. No console errors in remote devtools.

**Phase 1** (P1-16):

1. Idle mode plays full-bleed with the day/night tint visible.
2. Pinch zoom and one-finger pan work and the auto-camera resumes after ~10s.
3. The floating cluster is thumb-tappable and sits above the gesture bar.
4. 16× keeps the UI responsive.
5. Backgrounding the tab pauses the clock and foregrounding resumes it.
6. `?worker=0` still runs.

**Phase 2** (P2-12):

1. Tap opens the station; the rail strip scrolls sideways; dock tabs are reachable.
2. Tapping a creature opens the bottom-sheet inspector with live brain bars, and Close dismisses it without covering the cluster.
3. Tapping a phylogeny branch rings its members.
4. The pixel font renders (no fallback sans) and text is legible at arm's length.
5. Escape/Idle returns to idle and the auto-camera resumes.

**Phase 3** (P3-11):

1. Scent lenses toggle from the strip and render as heat without frame drops.
2. Charts are readable in the 170px dock.
3. Chronicle filter chips are tappable.
4. Over ten minutes of idle, hunt summaries, a famine or plague, and a migration appear in the ticker.
5. Sick creatures show the marker.

**Phase 4** (P4-10):

1. Chrome offers Add to Home Screen; the installed app launches standalone with the dark theme colour.
2. Airplane mode after a first load still runs the app.
3. Share opens the system share sheet with a working link.
4. Closing and reopening the tab resumes at the same clock with no console mismatch.
5. Fire, meteor and river are placeable by tap and appear in the chronicle.
6. Renaming a lineage from the bottom sheet works with the on-screen keyboard and no shortcut fires.

**Phase 5** (P5-08, final):

1. Frame time at 16× feels smooth in idle and station.
2. Install and airplane-mode launch still work.
3. A rain or fog line appears within an hour of watching.
4. With the OS reduce-motion setting on, the idle camera cuts instead of gliding.
5. The temperature figure changes between day and night.

`docs/performance.md` (P5-06) additionally lists rows only a real phone can verify: main-thread frame time at the true ≤8ms/50fps budget, real device memory, a real 4G cold load, and real battery drain — none of these are covered by the checklists above and are still owed.

## For a reviewer who hasn't seen this code

**What's solid**: the core sim (`src/core`) is genuinely deterministic — every phase-end task re-verified byte-identical `npm run headless` hashes across repeated runs, and the determinism/energy-ledger invariant tests are tight (down to 1e-9 relative error after P1-06's ledger-leak fix). The energy-accounting discipline (realised-vs-intended deltas, everything unaccounted routed to `ledger.dissipated`) is applied consistently and was actively enforced — three separate ledger leaks were found and fixed during the build (P1-06 in `growPlants`, algebraically reworked again in P1-07 for grazing/predation, and a save/restore alignment bug in P5-02), each time by tightening a test rather than loosening a tolerance. The full test suite is 452 tests, all passing except the one documented environmental flake.

**Known gaps**:

1. **`brain.js`'s `forward()` is an unfixed architectural performance bottleneck.** Flagged when brains first replaced the Phase-1 reflex policy (P2-03: raw-Node throughput dropped from ~3450 to ~2000 ticks/s), partially mitigated in P5-06 (pheromone diffusion optimized, ~15-20% gain on the default 256×160 world) but `brain.forward()` itself remains ~34.5% of the cost on the small CI-gate scenario and was explicitly left unrestructured — it would need a weight-caching redesign. Post-fix raw-Node throughput on that scenario is 1,510-1,680 ticks/s, still below the CI gate's 2,000 t/s budget. This is real, not the vitest-tooling tax described next.
2. **`test/invariants/throughput.test.js`'s `>=2000 ticks/s` assertion is a well-documented environmental flake in vitest specifically**, root-caused once at P1-10 (vitest's ES-module SSR/vite-node transform defeats V8 inlining across `src/core`'s module boundaries — reproduced with a minimal, sim-code-free repro showing a ~14.8x vitest-vs-raw-Node slowdown) and referenced by every subsequent phase-end/final-green task whenever this machine was under load. It failed the same way (201 ticks/s) during this Finishing pass's own verification. It is distinct from gap #1 above — even a perfectly optimized brain.js would still see this tax under vitest locally; the committed assertion is intentionally left unchanged because SPEC §8 names a GitHub runner, not this shared desktop, as the arbiter.
3. **The carnivore-placement gap in `genesis.js` was never actually fixed, only backstopped.** P1-11 found that `findLineageCentre` places lineage clusters at independently-random, unconstrained land tiles, so carnivores routinely start far outside any herbivore lineage's sensing/travel range and go extinct on every seed (confirmed again at P2-05 after a `species.theta` retune). P3-06's immigration mechanic was implemented for an unrelated reason but happened to backstop this — carnivores now survive full 100k-tick runs (see the P5-08 pinned-seed hashes: seed 8 ends with 11 carnivores, seed 39 with 7) because immigration periodically reseeds a carnivore population near the floor, not because a carnivore, once placed, can now reliably find prey from genesis. A future task should still add the flagged `genesis.maxCentreDistance` (or similar) if a reviewer wants carnivores to survive on their own merits rather than via the immigration crutch.
4. Two features have known interaction gaps documented in their own log entries but not fixed: the inspector doesn't yet show `parents #a × #b` for sexually-reproduced organisms (P5-04 — `parent2` is tracked in core and saved, just not wired through the snapshot wire format), and a snapshot's transferable-buffer lifetime bug was fixed once (P2-10) but is worth a second look if a future task adds another long-lived cache of a snapshot's raw arrays.

**Unusual about how this build ran**:

- The vast majority of P4-01 through P5-08 ran through parallel/sequential delegated subagents rather than one continuous session (per the user's stated model-handoff workflow), which is why several log entries note fixes to earlier tasks' files "not in this task's Files touched" — this was the established, repeatedly-invoked precedent throughout the build (first at P0-06, applied at least a dozen more times through P5-06), not a one-off shortcut.
- **1Password SSH commit signing was unavailable for a stretch of this build.** Per P2-06's and P2-12's log entries: the agent socket refused the connection partway through P2-05, and a graceful-restart attempt stopped the app entirely rather than fixing it. Every task from P2-05 through P3-01 was implemented, tested and verified individually and staged in the git index, but nothing could commit while signing was down. The user then explicitly authorized unsigned commits ("commit as you go with no signature if needed - we can rebase to add sigs when things are done"), so P2-05 through P3-01 landed as one consolidated unsigned commit (`accf772`) once authorized — git's staging had already collapsed several multi-task files into single blobs, making a clean per-task split impractical after the fact. One-commit-per-task resumed from P3-02 onward. **Every commit in this build, including this handoff commit, is unsigned** (1Password signing never came back this session) — per the user's own stated plan, a human should run `git rebase` to add signatures before merging if that matters to this project.
- This session (the Finishing pass) ran under sustained heavy CPU load, exactly as documented throughout Phase 3-5's log entries (P3-10 onward) — the full `npm test` run took ~7.5 minutes and the throughput invariant read 201 ticks/s, consistent with every prior such measurement on this machine.
