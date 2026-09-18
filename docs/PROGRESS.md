# Flatland build progress
Branch: build/2026-09-18
Started: 2026-09-18T15:20:35Z

## Tasks
- [x] P0-01 Repository scaffold and toolchain
- [x] P0-02 Seeded RNG, deterministic math, config module
- [x] P0-03 Light, seasons and the world clock
- [ ] P0-04 Value noise
- [ ] P0-05 Terrain generation and region names
- [ ] P0-06 Terrain tuning sweep
- [ ] P0-07 A seeded terrain renders in the browser
- [ ] P0-08 Playwright smoke test and CI e2e step
- [ ] P0-09 Phase 0 end — deployment docs, headers, push, preview
- [ ] P1-01 Organism SoA store
- [ ] P1-02 Genome layout and phenotype mapping
- [ ] P1-03 World skeleton, genesis, hash, test helpers, determinism invariant
- [ ] P1-04 Plants, carcasses, soil, the energy ledger and the rain intervention
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

### P0-03 — pending sha (see commit)
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
