# Flatland build progress
Branch: build/2026-09-18
Started: 2026-09-18T15:20:35Z

## Tasks
- [x] P0-01 Repository scaffold and toolchain
- [x] P0-02 Seeded RNG, deterministic math, config module
- [x] P0-03 Light, seasons and the world clock
- [x] P0-04 Value noise
- [x] P0-05 Terrain generation and region names
- [x] P0-06 Terrain tuning sweep
- [x] P0-07 A seeded terrain renders in the browser
- [x] P0-08 Playwright smoke test and CI e2e step
- [x] P0-09 Phase 0 end — deployment docs, headers, push, preview
- [x] P1-01 Organism SoA store
- [x] P1-02 Genome layout and phenotype mapping
- [x] P1-03 World skeleton, genesis, hash, test helpers, determinism invariant
- [x] P1-04 Plants, carcasses, soil, the energy ledger and the rain intervention
- [ ] P1-05 Spatial grid and senses
- [ ] P1-06 Reflex policy, movement, metabolism, aging and death
- [ ] P1-07 Grazing, scavenging and predation
- [ ] P1-08 Density-dependent breeding (asexual, no mutation)
- [ ] P1-09 Chronicle core, stats sampling and the no-allocation invariant
- [ ] P1-10 Headless harness, ecology sweep columns and the throughput gate
- [ ] P1-11 Ecology tuning and the reduced soak test
- [ ] P1-12 Fixed-timestep scheduler, protocol and snapshot encoder
- [ ] P1-13 Worker glue, main-thread fallback, organism and light rendering
- [ ] P1-14 App state machine, input contract, floating cluster, battery pause
- [ ] P1-15 Idle mode — auto-camera, caption, ticker, clock, fonts
- [ ] P1-16 Phase 1 end — push, preview, phone checks
- [ ] P2-01 Mutation and genetic distance
- [ ] P2-02 Brain forward pass over the SoA
- [ ] P2-03 Brains drive behaviour; seeded genesis prior; reflex layer retained
- [ ] P2-04 Species table, speciation, extinction, phylogeny and lineage names
- [ ] P2-05 Evolution tuning — mutation, speciation, brain
- [ ] P2-06 Protocol extension — species table, phylogeny events, family record, richer status
- [ ] P2-07 Procedural sprites and colour modes
- [ ] P2-08 Station shell and top bar
- [ ] P2-09 Lens rail — Night, Energy density, colour-by, legend
- [ ] P2-10 Inspector, selection, tooltip, follow, bottom sheet
- [ ] P2-11 Dock — chronicle pane and live phylogeny tree
- [ ] P2-12 Phase 2 end — push, preview, phone checks
- [ ] P3-01 Pheromone channels — decay, diffusion, emission, sensing
- [ ] P3-02 Scent lenses
- [ ] P3-03 Disease
- [ ] P3-04 Regrowth debt
- [ ] P3-05 Seasons on plants and the famine entry
- [ ] P3-06 Immigration
- [ ] P3-07 Kill aggregation, `first` events, every chronicle sentence, chronicle filter
- [ ] P3-08 Charts — population by lineage, diversity with light
- [ ] P3-09 Idle POI memory and narrative captions
- [ ] P3-10 Pressure tuning, pinned seeds and the full soak
- [ ] P3-11 Phase 3 end — push, preview, phone checks
- [ ] P4-01 Save records, state snapshots, restore, and the restore determinism case
- [ ] P4-02 Interventions — every kind in core, replay determinism, ⚡ chronicle
- [ ] P4-03 Hand of God pane
- [ ] P4-04 Lineage naming
- [ ] P4-05 Share links, replay-to-tick, platform adapter
- [ ] P4-06 Auto-save, resume and background verification
- [ ] P4-07 Trophic energy-flow chart
- [ ] P4-08 PWA — manifest, icons, service worker, bundle budget
- [ ] P4-09 E2E completeness pass on desktop and Pixel 7
- [ ] P4-10 Phase 4 end — push, preview, phone checks
- [ ] P5-01 Temperature
- [ ] P5-02 Weather events — rain and fog
- [ ] P5-03 Swimming
- [ ] P5-04 Mating with crossover
- [ ] P5-05 Phase 5 tuning
- [ ] P5-06 Performance pass and `docs/performance.md`
- [ ] P5-07 Blog post draft
- [ ] P5-08 Phase 5 end — push, preview, phone checks

## Log
(one entry per task, appended by /implement)

### P0-01 — 592e4a7
Tests: `test/unit/smoke.test.js` — "1 + 1 === 2" and one case per required
script name in `package.json`. Confirmed failing (no package.json) before
implementation.
Interpretation:
- `index.html` at repo root, not `public/index.html` — matches the Spec
  issues resolution already in PLAN.md (Vite requires root index.html).
- Dependency majors are the actual current majors at install time (vite 8,
  vitest 5, eslint 10, @eslint/js 10, eslint-config-prettier 10, typescript 7,
  jsdom 30, @playwright/test 1.63), not the plan's guessed ^7/^4/^9/^5 —
  checked via `npm view <pkg> version`. Added `globals` (17.x) for eslint
  flat-config environment globals, not listed in the plan but required to
  implement the per-directory globals rule.
- Vitest 5 removed the `poolOptions.forks.execArgv` nesting (deprecated in
  v4); `pool` and `execArgv` are top-level `test` options now. Confirmed
  `global.gc` is defined under this config.
- `src/core` "no globals at all" implemented as: base ES builtins
  (`globals.builtin`) plus an explicit denylist (`Date`, `window`, `document`,
  `fetch`, `performance`, `setTimeout` set to `'off'`) so Math/JSON/Array etc.
  still lint, but the five named globals are undefined identifiers.
- Added `docs/SPEC.md`, `docs/PLAN.md`, `docs/PROGRESS.md`, `docs/mockup.html`,
  `.claude/commands/*.md` to `.prettierignore`: pre-existing content outside
  this task's Files touched, and PLAN.md's exact `### <ID>: <title>` headings
  are grepped by the implement/review commands.
Verified: `npm install` (generated package-lock.json, committed), `npm run
typecheck`, `npm run lint`, `npm test` (14/14), `npm run build`, `npm run dev`
served "Flatland" at `/`. Could not run a from-scratch `npm ci` locally (the
sandbox denies `rm -rf node_modules`); CI's first run will exercise `npm ci`
against the committed lockfile.
No config keys introduced (none needed yet).

### P0-02 — 4a808cb
Tests: `test/unit/rng.test.js` (9 cases incl. state save/restore and fork),
`test/unit/fmath.test.js` (9 cases, all six functions plus TAU/clamp/lerp),
`test/unit/config.test.js` (10 cases incl. the DOCS-completeness walk).
Confirmed all three failing with "Cannot find module" before implementation.
Config keys introduced (all documented in `DOCS`): `world.width` (256, ⚠️),
`world.height` (160, ⚠️), `world.maxOrganisms` (2000), `world.cellSize` (8),
`time.ticksPerDay` (1800, ⚠️), `time.daysPerYear` (24, ⚠️).
Interpretation:
- `fmath.js` implements sin/cos/atan2 via Taylor series with range reduction
  and a half-angle CORDIC-style reduction for atan2 (built only from
  `+ − × ÷`, `Math.sqrt`, `Math.floor`, `Math.abs`); exp/log/tanh via
  Taylor series with binary range reduction. Measured max errors are ~1e-14
  to ~1e-16 (9+ orders of margin over the required 1e-6), verified with a
  20,000-point sweep per function against `Math.*` outside the test suite.
  PI/TAU/LN2 are hardcoded nearest-double literals, not `Math.PI`/`Math.LN2`
  property reads, per the "only these primitives" constraint.
- Sanity-checked the eslint core rules (P0-01) actually fire by linting a
  throwaway file with `Math.random`, `Date.now`, `Math.sin`, `window`,
  `for...in` and bare `console` — all seven flagged, file then deleted.
- `Rng.chance(0)`/`chance(1)` still consume no randomness by short-circuit
  (documented in the JSDoc); not tested for that specific property beyond
  "always false"/"always true" over 1000 draws each.
- `makeConfig` validates non-finite numbers anywhere in the override tree
  (not just top-level), and deep-freezes the whole result recursively.

### P0-03 — 0c05290
Tests: `test/unit/light.test.js` (12 cases: lightAt zero/peak/night bounds,
config-independence, dayFraction range and mid-summer peak, season quarter
boundaries and year rollover, clock text at the three named boundary ticks
plus a day-increment case, sunArc angle/up). Confirmed failing with "Cannot
find module" before implementation.
Interpretation:
- `sunArc`'s `angle = π(1 − u/f)` is π at dawn (u=0) and falls to 0 at dusk
  (u→f), not the reverse — I initially wrote the test backwards and had to
  correct it; this matches the mockup's arc glyph, which places the sun dot
  at the left (cx = 20+17·cos(π) = 3) at dawn and sweeps right as the angle
  falls to 0 at dusk. `up` (not specified in the design constraint's return
  shape beyond the field name) is defined as `u < f`, i.e. "sun currently
  above the horizon" — the only reading consistent with "holds at π through
  the night" needing a distinct signal for night vs. day at angle=π.
- `u(tick, cfg)` and `yearFracOf(tick, cfg)` use a positive-safe modulo
  (`((x % m) + m) % m`) so negative ticks (not expected in normal operation
  but not excluded by the type) don't produce a negative day/year fraction.
No config keys introduced (light.js only reads `time.ticksPerDay` /
`time.daysPerYear` from P0-02).

### P0-04 — 2e5ecc9
Tests: `test/unit/noise.test.js` (8 cases: same-seed determinism, different
seeds differ, [0,1] bounds, neighbour smoothness at scale 22, edge wrapping
in both directions, Float32-rounded output) and `fbm` (single-layer
identity, weighted multi-layer sum). Confirmed failing with "Cannot find
module" before implementation; all 8 passed on the first implementation
attempt.
Interpretation:
- `makeNoise(rng, size)` fills the lattice directly from `rng.float()` in
  row-major order (matching the mockup's `noiseGrid`), and `at(x, y)` wraps
  lattice indices with a positive-safe modulo so negative coordinates and
  coordinates past `size` both sample validly rather than reading out of
  bounds or reflecting.
- Output is rounded with `Math.fround` at both `at()` and `fbm()` so a
  caller storing results directly into a `Float32Array` sees byte-identical
  values to calling the function again later (SPEC §3.1: no float
  order-of-operations surprises between a fresh call and a stored value).
No config keys introduced (noise.js takes lattice size and layer scale/
weight as call arguments; `terrain.octaves` is introduced by P0-05, which
owns the terrain-specific defaults).

### P0-05 — 8505118
Tests: `test/unit/terrain.test.js` (6 cases: same-seed determinism,
different seeds differ, six known types, contiguity guarantees for seeds
1..10, reroll count reported, an impossible-threshold config rerolls then
throws) and `test/unit/names.test.js` (9 cases: region thirds boundaries on
both axes, terrain word at the sampled tile, "the " prefix, regionWord enum
order, the three SPEC §4.10 noun lists). Confirmed both failing with
"Cannot find module" before implementation; all 15 passed on the first
implementation attempt after fixing one unrelated typecheck/lint issue
(JSDoc `import().DEFAULTS` needed `typeof`, an unused test import).
Config keys introduced: `terrain.octaves` (3-layer fbm config, ⚠️),
`terrain.thresholds.{water,sand,mud,grass,scrub}` (⚠️ each), 
`terrain.minGrassFraction` (0.08), `terrain.minWaterFraction` (0.02),
`terrain.maxRerolls` (16), `terrain.moveCost` (array by TERRAIN order),
`terrain.visibility` (array by TERRAIN order); the last four not flagged
⚠️ per SPEC §4.2's ⚠️ marker sitting only on "thresholds", not on the 8%/2%
guarantee numbers or the move-cost/visibility table.
Interpretation:
- "the world's rng, forked with salt 'terrain'; the fork's seed is
  seed ^ 0x7e44a1" is implemented literally rather than via `Rng.fork()`
  (P0-02's generic hash-based fork): `generateTerrain(seed, cfg)` takes a
  raw seed number (per its stated signature) and builds
  `new Rng((seed ^ 0x7e44a1) >>> 0)` internally, so the formula in the
  design constraint is satisfied exactly and the function stays
  self-contained and directly testable from a plain seed integer.
- `terrain.octaves` entries are `{ scale, weight, lattice }` (matching
  P0-04's `NoiseLayer` shape plus the lattice size needed to build each
  `makeNoise` field), not the plan's shorthand `{scale, w}` — "weight" is
  spelled out, and `lattice` is added since P0-04's `makeNoise(rng, size)`
  needs a lattice size per octave (16/32/64, from the mockup, one per
  scale) that the shorthand didn't carry a slot for.
- `terrain.thresholds` stayed a plain object with five named keys (not
  flattened into one array) so each threshold gets its own DOCS entry and
  can be tuned independently by P0-06 without touching the others.
- Sanity-checked reroll behavior manually outside the test suite: over
  seeds 1-40 at the default size, 28 total rerolls occur (max 4 for any
  one seed) before the mechanism succeeds every time — confirms the
  mechanism works; bringing that reroll count down to the P0-06 target
  (≤2/40) is P0-06's job, not this task's.

### P0-06 — 0a0dd35
Sweep (`docs/tuning.md`): before, seeds needing reroll 15/40 (28 total,
mean grass 43.4%/water 10.9% by tile count); after (re-weighted octaves
toward the low-frequency layer, widened mud/grass/scrub thresholds), 0/40
need reroll, mean largest-grass-component 38.3%/largest-water-component
5.7% (target ranges [30,50]/[5,20] met with margin; min largest-water
across seeds 2.4%, min largest-grass 17.6%, both clear of the 8%/2%
guarantee floor). Both tables in `docs/tuning.md` and this commit.
Tests: `test/unit/terrain.test.js` — kept the seeds-1..10 guarantee test
(still passes) and added `"seeds 1..40 need at most 2 rerolls in total"`;
0/40 measured, well inside the ≤2 bound.
Config keys changed (defaults only, both ⚠️): `terrain.octaves` from
scale 22/9/4 weighted .6/.3/.1 to scale 30/12/5 weighted .75/.2/.05;
`terrain.thresholds` mud .44→.42, grass .62→.64, scrub .74→.76 (water and
sand left close to their P0-05 values).
Interpretation:
- "seeds 1..40 need at most 2 rerolls in total" (acceptance test wording)
  is implemented as "at most 2 of the 40 seeds needed any reroll", not "the
  sum of every individual reroll count is ≤2" — matches the Design
  constraints' stated target phrasing ("rerolls needed on ≤ 2 of 40
  seeds") directly above it.
- Found and fixed a latent test bug while tuning, not a defect in
  generateTerrain: the P0-05 test `"different seeds give different
  terrain"` compared seeds 1 and 2 at the 64×40 test size. Under the new
  (smoother) octaves, seed 1 needed one reroll, so its accepted attempt
  used effective seed 1+1=2 — byte-identical to seed 2's own unrerolled
  attempt. This is the "re-roll with seed+1" mechanism (SPEC §4.2) working
  exactly as specified, not a bug: any two adjacent seeds can coincide this
  way whenever the lower one rerolls. Fixed by comparing two seeds
  (100, 500) far enough apart that their reroll ranges (each
  [seed, seed+maxRerolls]) can never overlap, with a comment explaining
  why. `test/unit/terrain.test.js` was not in this task's stated Files
  touched, but the Acceptance tests section explicitly requires it to gain
  a new test and keep passing, so this fix falls within that same implied
  scope.
- `scripts/sweep.mjs` needed `process.argv`, which exposed a gap in P0-01's
  tsconfig (`types: []`, so no ambient node globals were available to
  `scripts/**/*.mjs` even though that glob is in `include`). Added
  `@types/node` as a devDependency and `"node"` to `tsconfig.json`'s
  `types` array — a TypeScript-only ambient declaration; it does not weaken
  eslint's core/sim global denylist, which still fails the lint on any
  actual use of a banned global in `src/core` or `src/sim`. This touches
  `package.json`, `package-lock.json` and `tsconfig.json`, outside this
  task's stated Files touched, but was unavoidable to make `npm run
  typecheck` pass on the required `scripts/sweep.mjs`.

### P0-07 — 425c50e
Tests: `test/unit/camera.test.js` (10 cases: clamp keeps the view inside
the world / centres a smaller world / clamps z to [1,8], zoomAt keeps the
anchor fixed and snaps/clamps zoom, fit for a smaller-than-view world and
the floor-at-1 case for a larger one, screenToWorld inverts worldToScreen)
and `test/unit/terrain-layer.test.js` (2 cases: palette colour + alpha 255
per tile, TCOL has one 3-tuple per terrain type). Confirmed failing with
"Cannot find module" before implementation; all 10 camera cases needed one
fix (see Interpretation) after the first attempt, terrain-layer passed
immediately.
Beyond the stated acceptance tests, verified in a real headless Chromium
(a throwaway script, deleted after use, not part of this commit): `npm run
dev` serves the page with zero console errors; a mouse drag changes the
rendered frame (pan works); a wheel scroll changes it again (zoom works);
loading `?seed=2` after `?seed=1` produces a visibly different screenshot
(different seeds render different terrain) — this is the task's own
verification line, confirmed rather than assumed.
Interpretation:
- `fit`'s "min 1" (SPEC §6.5's zoom range is 1-8, and tiles are drawn at
  integer pixel scales) means it floors at zoom 1 and does not shrink
  further even when the world is larger than the view — it will crop
  rather than go below the platform's minimum supported zoom. My first
  draft of the acceptance test assumed the opposite (shrink-to-fit an
  oversized world) and failed against my own `fit` implementation, which
  already matched the mockup's `fitWorld` (`Math.max(1, Math.min(...))`)
  and the literal "floored at 1" wording; I corrected the test, not the
  code, and split it into the two distinct cases (world smaller than view
  vs. larger) so both behaviors are covered explicitly.
- `document.documentElement.dataset.painted = '1'` is set after the first
  `present()` even though P0-08 (Playwright smoke test) is the task that
  actually needs it and doesn't list `src/main.js` in its own Files
  touched — P0-07 is the only task that owns the render loop where this
  hook naturally belongs, so it's added now as a small forward-compatible
  addition rather than leaving P0-08 with an unowned dependency.
- `index.html` gained one line (`<link rel="stylesheet" href="/src/style.css">`)
  even though it wasn't listed in this task's Files touched — `src/style.css`
  is listed and is useless unless linked from the page; treated as
  implied by the stated file list.
No config keys introduced (this task reads `cfg.world.width/height`,
already defined in P0-02).

### P0-08 — 3808574
Tests: `test/e2e/smoke.spec.js` — "page loads with no console errors and
paints a canvas" and "first frame is painted within 1500 ms". Both green
on `chromium-desktop` and `pixel-7` (4/4) against the built preview server
(`npm run build && npm run preview -- --port 4173 --strictPort`), not
`vite dev`, so this exercises the real bundle.
Interpretation:
- eslint didn't yet know `playwright.config.js` needed node globals
  (`process`) or that `test/e2e/**/*.js` needed browser globals (`document`,
  referenced inside a `page.waitForFunction` callback that runs in-page,
  even though the file itself executes under Node) — added
  `playwright.config.js` to the existing node-globals file set and a new
  block giving `test/e2e/**/*.js` both node and browser globals. This
  touches `eslint.config.js`, not in this task's stated Files touched, but
  required to make `npm run lint` (part of Verification) pass on the two
  new files.
- `.gitignore` already ignored `test-results/` and `playwright-report/`
  per the task's own parenthetical; no change needed there.
Verified: `npx playwright install chromium` (browsers were already cached
from tooling setup); `npm run test:ui` 4/4 green on both projects; `npm run
typecheck && npm run lint && npm test` (88/88) all green.

### P0-09 — 43e7851
Tests: `test/unit/build-output.test.js` — "build copies _headers into
dist" (spawns `npm run build`, 120s timeout, reads `dist/_headers` back).
Confirmed failing with ENOENT before `public/_headers` existed.
Verified: `npm run typecheck && npm run lint && npm test` (89/89) &&
`npm run build` (confirms `dist/_headers` present) && `npm run test:ui`
(4/4) all green.
Push: succeeded (`git push -u origin HEAD`), branch `build/2026-09-18`.
Preview URL: https://build-2026-09-18.flatland.pages.dev (per Conventions:
non-alphanumeric characters in the branch name `build/2026-09-18` replaced
with `-`). The Cloudflare Pages project was connected by the human earlier
in this session, so this preview should build; it has not been opened by
a human as of this log entry.
Phone: NOT VERIFIED (human)
Phone checklist for Phase 0, to check on the preview URL above: "(1) map
renders full-bleed with no white flash; (2) one-finger drag pans; (3) page
does not scroll or bounce; (4) no console errors in remote devtools".

### P1-01 — 04326e6
Tests: `test/unit/organisms.test.js` (11 cases: lowest-free-slot alloc,
-1 and unchanged count at capacity, monotonic never-reused ids, free
reuses the slot before higher ones, genomeOf is a live view, highWater
never shrinks and bounds every living slot, slotOfId finds/loses an
organism, HASH_ORDER's exact field list and that every named field is a
real typed array, pheno/derived arrays sized by capacity). Confirmed
failing with "Cannot find module" before implementation; all 11 passed on
the first implementation attempt.
Interpretation:
- `TRAIT_COUNT` (24) is defined in `organisms.js`, not `genome.js`
  (P1-02), even though genome.js is conceptually the "layout owner"
  elsewhere in the plan. The constructor must size `pheno` and the four
  derived per-slot arrays at construction time per the stated
  `constructor(capacity, genomeLength)` signature (only two parameters, no
  room for a `traitCount` argument), and P1-01 must not depend on P1-02
  (the dependency graph runs the other way: P1-02 depends on P1-01).
  genome.js will import `TRAIT_COUNT` from `organisms.js` when it needs
  it, inverting the more "obvious" ownership direction. Flagging this for
  the reviewer since it's a real ordering constraint the plan didn't spell
  out explicitly.
- `alloc()`/`free()` clear only `alive`/`id` (and the id->slot map);
  every other field is left with whatever a previous occupant wrote,
  matching the design constraint's explicit statement for `free` ("zeroes
  nothing else") and extending the same rule symmetrically to `alloc`, so
  callers (genesis, births) are documented as required to fully
  initialize a newly allocated slot before use.
No config keys introduced (capacity and genome length are constructor
arguments, not config; `world.maxOrganisms` from P0-02 will be threaded in
by the caller in P1-03).

### P1-02 — 1033b1f
Tests: `test/unit/genome.test.js` (13 cases: TRAIT_COUNT/BRAIN_INPUTS/
BRAIN_OUTPUTS layout constants, genomeLength formula and its dependence on
brain.hidden, traitValue at gene 0/1/0.5 for every trait, dietClass and
visionClass boundaries, applyPhenotype fills pheno and all four derived
arrays consistently and does not touch other slots, phenotype/organisms/
brain.hidden keys documented as assumptions, a DEFAULTS-completeness
regression guard). Confirmed failing with "Cannot find module" before
implementation.
Config keys introduced: `organisms.energyMaxBase` (150, ⚠️),
`organisms.bodyMassPerSize` (40, ⚠️), `brain.hidden` (8, ⚠️),
`phenotype.<24 traits>` (one `[lo,hi]` pair each, all ⚠️, generated into
DOCS programmatically from a units table rather than 24 hand-written
entries).
Interpretation:
- Float32 storage precision: my first test draft compared
  `store.pheno`/`store.energyMax`/etc (Float32Array reads) against
  full-double-precision recomputations with `toBeCloseTo(x, 4-9)`, which
  failed intermittently on values where float32 rounding lands just past
  the assertion's tolerance. Fixed by reading back the actual
  float32-stored intermediate values (not the original double literals)
  and comparing with `Math.fround(...)` for exact equality — this is a
  test-precision fix, not a change to `applyPhenotype`'s logic, which was
  correct throughout.
- `traitValue`'s TypeScript signature needed a `Record<string,
  readonly number[]>` cast on `cfg.phenotype` (the frozen literal object
  type doesn't have a string index signature); a plain array cast, not
  a 2-tuple, since JSDoc tuple types didn't structurally match the frozen
  readonly array type `makeConfig` produces.

### P1-03 — e621fd8
Tests: `test/unit/world.test.js` (11 cases: genesis lands every organism on
non-water inside the map, genesis counts match config, genesis is skipped
when `organisms` is given even empty, step increments tick and light
matches `lightAt` independently, hash is stable/changes on step, hash
covers rng state, hash is a hex string, all four pheromone grids allocate
zeroed and sized, plants/carcass/soil sized, a prebuilt terrain bypasses
generation, a real `makeConfig()` result works directly) and
`test/invariants/determinism.test.js` (seeds 1..10, two independently
constructed worlds stepped 5000 ticks each produce identical hashes — the
determinism invariant SPEC §9.2 calls for). Confirmed failing with
"Cannot find module" before implementation; the determinism invariant
passed on the very first run once genesis/world/hash existed.
Config keys introduced: `world.maxSpecies` (2048, not an assumption — a
memory ceiling like `maxOrganisms`), `genesis.herbivoreLineages` (3),
`genesis.herbivoresPerLineage` (50), `genesis.carnivoreLineages` (1),
`genesis.carnivoresPerLineage` (24), `genesis.lineageNoise` (0.05),
`genesis.clusterRadius` (12), `genesis.energyFraction` (0.6),
`genesis.dietHerbivore` ([0.02,0.2]), `genesis.dietCarnivore` ([0.8,0.98])
— all nine genesis keys marked assumption: true.
Interpretation:
- Two of my own draft world.test.js cases (`allocates all four pheromone
  grids`, `allocates plants, carcass and soil grids`) used tiny worlds
  (20x15 and 10x8) with real seeded terrain generation and no override;
  terrain generation legitimately cannot satisfy the 8%/2% contiguity
  guarantee at those sizes and threw "no valid map after 16 rerolls". Both
  tests only check array sizing, not real terrain, so I gave them a
  `terrain: TERRAIN.GRASS` override to bypass generation — a test fix, not
  an implementation bug (verified separately that terrain generation
  itself succeeds cleanly for every seed the *other* genesis tests use, at
  the real 64x40 test size).
- `World.hash()`'s `HASH_ORDER` loop needed a `/** @type {*} */` escape
  hatch to index `this.store` by a dynamic string name (TypeScript's
  structural typing has no index signature for a class with named
  properties); same pattern used for `cfg.phenotype` in P1-02.
- `hashUpdate(h, bytes)` is exported (not just internal) per the design
  constraint naming it as "a helper in world.js" without specifying
  visibility; exporting it costs nothing and makes it independently
  testable later if needed.
- `World`'s constructor does not call `runGenesis` itself; genesis is a
  separate explicit step (`runGenesis(world)`), so `test/helpers.js`'s
  `makeWorld` can skip it when an `organisms` list is given, and so a
  `World` can be constructed and inspected before any population exists.

### P1-04 — pending sha (see commit)
Tests: `test/unit/ecology.test.js` (9 cases: growth zero at real night L=0,
growth matches the exact formula at soil=0, soil raises growth and is
consumed, plants never exceed cap over 500 ticks, plants.enabled=false
disables growth, carcass decays slower on mud than grass and feeds soil,
carcass.enabled=false disables decay), `test/unit/ledger.test.js` (5 cases:
genesis equals stocks total after `initGenesisLedger`, relativeError is
~0 fresh and stays <1e-3 after 500 ticks, queueIntervention rejects
past/current ticks, pending stays sorted by (tick, insertion order)), and
`test/invariants/energy.test.js` (the SPEC §9.2 invariant: relative error
<1e-3 every 100 ticks over 10,000 ticks with two rain interventions).
Confirmed all three files failing for the right reason (rain doing
nothing, decay doing nothing) before implementation; two of my own test
drafts needed fixes before passing (see Interpretation).
Config keys introduced: `terrain.plantCap` ([0,0,0.35,1,0.6,0], ⚠️),
`plants.enabled` (true), `plants.growth` (0.004, ⚠️), `plants.soilBoost`
(2.0, ⚠️), `plants.initialFill` (0.6), `carcass.enabled` (true),
`carcass.decay` (0.002, ⚠️), `carcass.decayMud` (0.0007, ⚠️),
`soil.uptake` (0.001, ⚠️), `interventions.rain.amount` (0.3).
Interpretation:
- "Initial plants at genesis: ... ledger.genesis += Σp, plus Σ(energy+
  body) of the genesis population" can't be implemented as incremental
  bookkeeping split across two files this task cannot touch: `genesis.js`
  (P1-03, creates organisms) and `test/helpers.js` (P1-03, orchestrates
  world+genesis) are both outside this task's Files touched. Resolved by
  making `ledger.genesis` a one-shot snapshot: `initGenesisLedger(world)`
  (new, in `ledger.js`) sets it to the current total of every stock,
  called explicitly once the world's terrain/plants/population are all in
  place. `fillInitialPlants` (in the `World` constructor, before any
  organism exists) only fills the plants array; it does not touch the
  ledger, avoiding any double-counting risk regardless of call order.
- Found and fixed two bugs in my own first test drafts, not in the
  implementation: (1) "plant growth is zero at L=0" checked light
  immediately after tick 0, but light near dawn is a tiny *positive*
  value, not exactly 0 — L is only exactly 0 well into the night portion
  of the day, so the test now advances to 90% through the day first. (2)
  "soil raises growth and is consumed" captured `soilBefore` but then
  compared it against itself with no step in between (always equal by
  construction) — fixed to step once after capturing "before" values and
  compare against "after". Both are documented here because they'd have
  looked like real implementation failures without this note.
- Plant growth's `ledger.sunlight`/`flows.photosynthesis` and
  `flows.uptake` are attributed as exact fractions of the realised growth
  (`applied * base'/want'` and `applied * fromSoil'/want'`), which sum to
  precisely `applied` by construction (the two fractions sum to 1) — no
  dissipation term is needed on the plant side of growth. The *soil's own*
  Float32 rounding when subtracting `fromSoil'` is accounted separately,
  with any gap against the intended amount going to `dissipated`, per the
  general realised-vs-intended rule.
