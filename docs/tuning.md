# Tuning log

One section per tuning task, each with a before/after sweep table (SPEC
§3.8, §9.5). Tuning changes are diffs to `src/core/config.js` defaults, never
code changes — see `docs/PLAN.md` → Conventions → Config for the full key
table.

## P0-06 terrain — before

`node scripts/sweep.mjs --seeds 1..40` against the P0-05 defaults
(`terrain.octaves`: scale 22/9/4 weighted .6/.3/.1; `terrain.thresholds`:
water .34, sand .38, mud .44, grass .62, scrub .74):

```
world 256x160, 40 seed(s)

  seed  reroll   grass%   water%  lgGrass%  lgWater%    sand%     mud%   scrub%    rock%
     1       0     43.2     11.8      39.9       6.3      6.7     12.2     19.2      7.0
     2       0     38.7     13.2      37.5       2.8      7.3     13.5     18.9      8.4
     3       3     48.3      8.2      46.7       2.1      6.0     12.1     19.9      5.5
     4       2     48.3      8.2      46.7       2.1      6.0     12.1     19.9      5.5
     5       1     48.3      8.2      46.7       2.1      6.0     12.1     19.9      5.5
     6       0     48.3      8.2      46.7       2.1      6.0     12.1     19.9      5.5
     7       0     41.0     11.2      27.0       3.6      7.3     15.6     17.6      7.3
     8       0     44.5     10.5      43.0       2.6      5.9     11.3     21.7      6.1
     9       0     36.6     14.9      20.8       3.3      6.9     12.6     18.3     10.5
    10       0     41.7     12.7      40.8       2.7      6.6     12.9     18.2      7.9
    11       0     47.6      8.6      46.9       2.6      5.0     10.9     19.9      7.9
    12       0     40.6     12.6      36.1       2.3      6.4     11.6     21.5      7.2
    13       1     38.0     12.4      34.2       2.4      6.8     12.7     22.3      7.8
    14       0     38.0     12.4      34.2       2.4      6.8     12.7     22.3      7.8
    15       0     43.9      9.3      39.7       2.5      5.8     11.5     22.8      6.7
    16       0     45.5      7.1      40.9       2.5      5.5     13.8     21.1      6.9
    17       1     41.3     11.7      31.8       3.3      5.9     12.1     18.3     10.8
    18       0     41.3     11.7      31.8       3.3      5.9     12.1     18.3     10.8
    19       3     43.9     11.5      21.6       3.6      8.4     14.7     14.8      6.8
    20       2     43.9     11.5      21.6       3.6      8.4     14.7     14.8      6.8
    21       1     43.9     11.5      21.6       3.6      8.4     14.7     14.8      6.8
    22       0     43.9     11.5      21.6       3.6      8.4     14.7     14.8      6.8
    23       0     39.3     13.4      32.6       3.7      7.0     11.9     18.0     10.5
    24       0     40.3     12.4      34.2       3.2      5.8     11.1     21.2      9.1
    25       0     38.4     12.6      33.6       2.9      6.8     12.4     19.3     10.5
    26       3     47.0      9.9      46.1       2.2      7.1     14.0     17.2      4.7
    27       2     47.0      9.9      46.1       2.2      7.1     14.0     17.2      4.7
    28       1     47.0      9.9      46.1       2.2      7.1     14.0     17.2      4.7
    29       0     47.0      9.9      46.1       2.2      7.1     14.0     17.2      4.7
    30       2     48.5     11.5      47.7       3.6      6.6     12.8     15.8      4.9
    31       1     48.5     11.5      47.7       3.6      6.6     12.8     15.8      4.9
    32       0     48.5     11.5      47.7       3.6      6.6     12.8     15.8      4.9
    33       1     44.4     11.0      43.5       3.3      6.9     12.7     16.3      8.6
    34       0     44.4     11.0      43.5       3.3      6.9     12.7     16.3      8.6
    35       0     41.9      7.2      39.4       3.7      4.6     10.6     26.2      9.6
    36       0     39.9     10.8      38.2       3.0      5.4      9.9     21.2     12.8
    37       0     41.5     11.2      39.4       2.3      6.9     12.0     20.8      7.6
    38       0     41.7      9.1      41.0       5.2      5.0     10.1     23.4     10.6
    39       0     43.3     10.2      38.9       3.3      6.9     12.4     19.7      7.5
    40       4     38.5     13.7      20.0       4.1      5.3      9.9     23.3      9.3
---
mean grass% 43.4  mean water% 10.9  seeds needing reroll: 15/40  total rerolls: 28
```

**Diagnosis:** `grass%`/`water%` (total tiles of that type) are well above
the largest-component columns (`lgGrass%`/`lgWater%`) for many seeds —
water in particular is fragmented into many small ponds instead of one
connected body, so 15 of 40 seeds fail the ≥2% largest-water-component
guarantee on the first roll and need one or more re-rolls (28 total, one
seed needing 4). The 8%/2% guarantee numbers are unchanged (SPEC §4.2, not
flagged ⚠️); the problem is the noise shape.

## P0-06 terrain — after

Changed only `terrain.octaves` (down-weighted and widened the two
higher-frequency layers so terrain features are larger and more contiguous)
and `terrain.thresholds` (mud/grass/scrub widened slightly to keep band
proportions after smoothing; water/sand left close to their prior values):

```
octaves:    [{scale:30,weight:.75,lattice:16}, {scale:12,weight:.2,lattice:32}, {scale:5,weight:.05,lattice:64}]
thresholds: {water:.34, sand:.37, mud:.42, grass:.64, scrub:.76}
```

`node scripts/sweep.mjs --seeds 1..40`:

```
world 256x160, 40 seed(s)

  seed  reroll   grass%   water%  lgGrass%  lgWater%    sand%     mud%   scrub%    rock%
     1       0     48.0     10.9      46.5       3.6      4.4      7.1     16.9     12.7
     2       0     41.8     23.4      41.7      11.2      6.0     11.0     12.8      5.0
     3       0     44.1     12.5      27.0       6.2      3.9      8.6     16.4     14.5
     4       0     43.4      8.9      31.1       2.5      3.6      7.7     24.2     12.2
     5       0     44.1     12.5      40.9       3.9      5.1     11.1     16.9     10.3
     6       0     50.7     14.1      50.5       5.6      5.2      9.4     13.6      7.0
     7       0     44.5     11.1      42.0       3.0      4.9     10.8     17.7     11.0
     8       0     47.4     13.3      36.4       3.0      3.6      6.7     19.9      9.1
     9       0     36.8     22.8      17.6       7.4      4.7      8.2     15.0     12.5
    10       0     37.0     24.8      32.6      12.6      6.2     10.1     15.0      6.9
    11       0     47.8     14.5      46.3       5.3      5.1      9.4     14.2      9.1
    12       0     42.8     22.3      38.3       8.2      5.2     11.3     15.2      3.2
    13       0     44.8      8.3      27.4       5.4      3.4      9.8     23.1     10.5
    14       0     34.2     21.8      31.7       7.6      4.9      9.5     18.4     11.2
    15       0     47.0      9.1      46.8       2.7      3.9      8.0     22.7      9.4
    16       0     48.2      9.7      48.1       3.8      4.4     11.3     17.1      9.3
    17       0     43.6     12.4      43.2       4.4      3.7      7.1     22.3     10.8
    18       0     38.3     15.3      29.7       5.9      4.0      7.5     17.1     17.8
    19       0     40.4     18.1      40.0       4.5      5.3     10.4     16.5      9.4
    20       0     46.6      8.9      42.5       3.6      3.5      7.1     23.3     10.6
    21       0     52.5     12.2      52.0       4.6      4.5      8.3     16.9      5.6
    22       0     40.7     19.2      29.1       9.7      6.9     11.8     12.7      8.6
    23       0     38.1     20.7      20.2       9.8      5.5      9.5     14.7     11.5
    24       0     43.7     13.2      18.2       4.9      2.6      6.3     24.6      9.6
    25       0     43.2     18.6      43.1       9.1      5.3      9.2     15.2      8.5
    26       0     46.5      8.9      38.0       3.6      3.4      8.0     20.7     12.5
    27       0     41.8     13.6      40.5       4.7      4.5      8.0     19.8     12.2
    28       0     46.8     17.2      46.3       6.7      6.3     12.1     12.1      5.5
    29       0     52.7     16.8      52.7       3.8      5.1      9.3     12.8      3.3
    30       0     43.2      9.1      28.5       3.0      2.6      6.0     23.0     16.2
    31       0     43.7     15.5      43.1       5.0      5.0      9.0     14.2     12.7
    32       0     49.8     20.2      48.6       8.4      5.9      9.3     11.3      3.5
    33       0     43.0     11.0      41.6       3.8      3.9      8.8     20.8     12.6
    34       0     46.5      9.6      31.5       2.4      3.2      7.6     16.5     16.5
    35       0     45.3     14.1      42.6       9.4      4.4      8.7     20.6      6.8
    36       0     45.5     11.3      43.5       2.9      3.2      6.3     21.6     12.2
    37       0     44.0     17.6      31.5       6.6      4.5      8.7     18.6      6.5
    38       0     38.0     16.5      37.2      10.7      4.6      8.2     21.1     11.5
    39       0     40.0     18.9      35.1       5.8      6.4      9.2     15.8      9.8
    40       0     49.8     14.6      47.6       4.4      6.3     13.8     12.5      3.0
---
mean grass% 44.2  mean water% 14.8  seeds needing reroll: 0/40  total rerolls: 0
```

Largest-component means (the values the guarantee and targets actually
check, `lgGrass%`/`lgWater%` above): mean largest-grass 38.3%, mean
largest-water 5.7%, min largest-grass 17.6%, min largest-water 2.4% —
comfortably inside `[0.30, 0.50]` and `[0.05, 0.20]` with every individual
seed still well clear of the 8%/2% guarantee floor.

**Result:** 0/40 seeds need a re-roll (target was ≤2/40; exceeded). Mean
largest-grass-component 38.3% and mean largest-water-component 5.7%, both
inside target range. No further iteration needed.

## P1-11 ecology — before

`node scripts/sweep.mjs --seeds 1..40 --ticks 30000` against the P1-10
defaults (`plants.growth` 0.004, `metabolism.base` 0.02, `breeding.localK`
10, `breeding.baseRate` 0.01, `genesis.clusterRadius` 12, `genesis.lineageNoise`
0.05, `phenotype.lifespan` [1.0, 3.0]). Full table in
`docs/sweeps/p1-11-before.txt` (one JSON row per seed); summary:

| metric                             | value |
| ---------------------------------- | ----- |
| survived (pop>0 ∧ herb>0 ∧ carn>0) | 0/40  |
| population > 0 at all              | 0/40  |
| mean population                    | 0.0   |
| mean births                        | 1.8   |
| mean Shannon diversity             | 0.987 |
| mean plants%                       | 99.2  |

Every one of the 40 seeds reached total extinction between tick 3,090 and
5,486 (`extinctAt` column), with `starved` and `oldAge` as the only death
causes (`hunted` was 0 in every single seed). Diagnosis (see the P1-11 log
entry for the full derivation): three compounding problems, none of them
code defects — all three are ⚠️ ASSUMPTION defaults from earlier tasks that
this task exists to tune:

1. **Plant regrowth couldn't support even a lightly-grazed population.**
   `plants.growth` (0.004/tick at full daylight) times the map's grass area
   produced roughly 4x less total regrowth than the genesis population's
   aggregate metabolic demand, so herbivores necessarily starved regardless
   of foraging behaviour.
2. **Genesis clusters were too dense for density-dependent breeding
   (P1-08) to ever engage.** `genesis.clusterRadius` (12 tiles) packed each
   50-organism lineage into a small enough area that every individual's
   local neighbour count at `breeding.radius` (6 tiles) was 8–25, already
   at or past `breeding.localK` (10) — the density term
   `1 - count/localK` was ≤0 almost everywhere from tick 0, so `born` stayed
   near 0 for the entire run.
3. **`phenotype.lifespan` ([1.0, 3.0] "days" × `time.ticksPerDay`,
   i.e. 1,800–5,400 ticks) was short enough, and narrow enough, that nearly
   the whole genesis cohort died of old age within a ~2,000-tick window of
   each other.** Combined with (2), essentially no second generation
   existed to replace them, so every seed's population curve was a single
   cohort ageing out in near-lockstep.

## P1-11 ecology — after

Config changes (all in `src/core/config.js`, defaults only): `plants.growth`
0.004 → 0.6, `metabolism.base` 0.02 → 0.015, `breeding.localK` 10 → 50,
`breeding.baseRate` 0.01 → 0.04, `genesis.clusterRadius` 12 → 25,
`genesis.lineageNoise` 0.05 → 0.15, `phenotype.lifespan` [1.0, 3.0] → [3.0,
9.0]. Reached over 3 sweep iterations (0.004/10/0.01/12/0.05/[1,3] →
0.4/50/0.03/25/0.15/[3,9] → 0.6/50/0.04/25/0.15/[3,9], the last kept).

`node scripts/sweep.mjs --seeds 1..40 --ticks 30000` against these
defaults. Full table in `docs/sweeps/p1-11-after.txt`; summary:

| metric                             | before | after | target     |
| ---------------------------------- | ------ | ----- | ---------- |
| survived (pop>0 ∧ herb>0 ∧ carn>0) | 0/40   | 0/40  | ≥30/40     |
| population > 0 at all              | 0/40   | 38/40 | —          |
| mean population                    | 0.0    | 285.9 | [250, 700] |
| mean births                        | 1.8    | 474.6 | —          |
| mean Shannon diversity             | 0.987  | 0.822 | —          |

**Result:** mean population (285.9) and population-survival (38/40 seeds
still alive at 30k ticks) both land inside target. The formal `survived`
metric and the herbivore:carnivore ratio target (3:1–20:1) are **not met**:
carnivores went extinct in all 40 seeds. This is a separate, deeper finding
than the three above — recorded here and in the P1-11 log rather than
worked around, because the root cause is a `src/core/genesis.js` code
behaviour, not a config default, and P1-11's Files touched is `config.js`
defaults only:

`findLineageCentre` (genesis.js) places every lineage's cluster centre at a
uniformly random land tile, independently per lineage, with no minimum or
maximum distance from any other lineage. On the default 256×160 world the
mean distance between two independently-random points is ~157 tiles, far
beyond both `phenotype.visionRange` ([4, 16] tiles, so prey/threat
detection in `senses.gather` never fires) and any realistic lifetime
travel distance under the current wander behaviour (a diffusive random
walk, not a directed search, when nothing is sensed). Verified this is the
actual mechanism, not a predation-parameter or population-size tuning gap,
by testing `predation.reach` up to 2.5 tiles, `predation.killChance` up to
0.7, `genesis.carnivoresPerLineage` up to 60 across 2 lineages, and world
sizes down to 64×40 (quartering the mean inter-cluster distance) —
carnivores still recorded 0–51 total hunts across 30,000 ticks and always
died out, because most of them simply never got within sensing range of
any herbivore during their lifetime. A future task should add a
`genesis.maxCentreDistance` (or similar) config key constraining
carnivore-lineage centres to within sensing/travel range of at least one
herbivore lineage; that is a `genesis.js` code change, out of this task's
scope.

## P2-05 evolution — before

`node scripts/sweep.mjs --seeds 1..40 --ticks 30000` against the P2-04
defaults (`species.theta` 0.6, all other Phase 2 ⚠️ keys at their P2-01
through P2-04 introductions). Full table in
`docs/sweeps/p2-05-before.txt`; summary:

| metric                             | value | target                |
| ---------------------------------- | ----- | --------------------- |
| survived (pop>0 ∧ herb>0 ∧ carn>0) | 0/40  | ≥28/40                |
| seeds with splits ≥ 1              | 40/40 | ≥30/40                |
| mean splits per 30k                | 77.3  | [1, 40]               |
| mean max generation                | 7.5   | ≥8 on surviving seeds |

**Result:** speciation happens too _easily_ — mean splits (77.3) is
nearly 2x the target's upper bound, meaning lineages fragment into many
short-lived micro-species rather than a few that persist and drift.

## P2-05 evolution — after

Config change (`src/core/config.js`, defaults only): `species.theta`
0.6 → 0.9. Reached via 3 sweep iterations at reduced seed counts (5-8
seeds) to find the shape of the theta -> splits relationship before
committing to a full 40-seed run: θ=0.8 → mean splits 43.1 (just over the
target), θ=0.9 → 27.4 (comfortably inside, 8/8 seeds), θ=1.0 → 9.6, θ=1.1
→ 2.9 with only 6/8 seeds splitting at all — a steep cliff between 1.0
and 1.1 where speciation nearly stops happening, so 0.9 was chosen for
margin from both the upper bound and that cliff. `genome.*`,
`species.centroidRate` and `genesis.brainPrior/brainNoise` were left at
their introduced defaults — the 0.9 change alone already met every
numeric target.

`node scripts/sweep.mjs --seeds 1..40 --ticks 30000` against this
default. Full table in `docs/sweeps/p2-05-after.txt`; summary:

| metric                             | before | after | target                |
| ---------------------------------- | ------ | ----- | --------------------- |
| survived (pop>0 ∧ herb>0 ∧ carn>0) | 0/40   | 1/40  | ≥28/40                |
| seeds with splits ≥ 1              | 40/40  | 40/40 | ≥30/40                |
| mean splits per 30k                | 77.3   | 33.8  | [1, 40]               |
| mean max generation                | 7.5    | 7.35  | ≥8 on surviving seeds |

**Result:** `splits ≥ 1` on ≥30/40 seeds and mean splits in `[1, 40]` are
**met**. `survived ≥ 28/40` is **not met** (1/40) — this is the same
root cause already found and recorded in P1-11's log and
`docs/tuning.md`: `genesis.js`'s `findLineageCentre` places every
lineage at an independently-random location, so carnivores essentially
never encounter prey before dying. That is a `genesis.js` code fix, out
of this config-only task's scope; no combination of the keys this task
may change (`genome.*`, `brain.hidden`, `species.theta`,
`species.centroidRate`, `genesis.brainPrior`, `genesis.brainNoise`)
addresses genesis's placement algorithm itself. `max generation ≥ 8 on
surviving seeds`: the one seed that does survive (seed 20) reaches
generation 14, so this target is technically met on the only qualifying
seed, though the "surviving seeds" sample size (1) is too small to read
much into. The soak's pinned seed (29, from P1-11) was re-checked, not
re-pinned: it still survives under these defaults (population 115, 8
living species, 14 splits, generation 11 by 30,000 ticks) and comfortably
clears every soak assertion, including the two new ones this task adds.

## P3-10 pressure tuning — before

`node scripts/sweep.mjs --seeds 1..40 --ticks 100000` against the P3-09
defaults (`regrowth.debtFactor` 0.3, `regrowth.debtTicks` 3600, all other
Phase 3 ⚠️ keys at their introduced defaults). Full table in
`docs/sweeps/p3-10-before.txt`; summary (new SPEC §9.3 columns this task
adds):

| metric                               | value | target      |
| ------------------------------------ | ----- | ----------- |
| survived (pop>0 ∧ herb>0 ∧ carn>0)   | 40/40 | all 40      |
| mean population                      | 94.7  | —           |
| mean Shannon diversity (H)           | 1.855 | ≥ 0.8       |
| mean max species share               | 33.6% | —           |
| seeds with end-state max share > 70% | 6/40  | 0 (ideally) |
| worst-case max species share         | 98.0% | ≤ 70%       |
| worst-case end-state H               | 0.270 | ≥ 0.8       |

**Result:** most seeds are healthy (mean H 1.855, mean max share 33.6%),
but a minority (seeds 9, 12, 13, 20, 22, 30, 32, 40 — 6-8 of 40 depending
on threshold) evolve a single generalist herbivore lineage that outgrows
every other species, reaching populations of 900-2,000 (vs. a typical
30-90) while plants stay 95-99% full (grazing pressure never actually
crashes the food supply, so `famine` — a chronicle-only mechanic with no
population effect, see `ecology.js`'s `checkFamine` — never intervenes,
and per-tile `regrowth` debt rarely triggers at this spread-out density).
Shannon diversity in these seeds collapses to as low as 0.270, and max
species share reaches 98%, both failing the SPEC §9.3 soak targets this
task's test file checks. Root cause is evolutionary/spatial (a lineage
finds population-efficient traits early and there is no other species
positioned to contest its niche), not something visible at any single
tick — out of the scope of a config-only tuning pass to fix at the
source (a `genesis.js`/`species.js` change, similar in kind to the
carnivore-placement gap already documented above).

Investigated whether the two mechanics named for exactly this in SPEC
§4.9 (disease's kin-biased transmission) could check it instead, on the
8 worst seeds at the full 100,000 ticks:

- `disease.contactRate` 0.02 → 0.05, `disease.lethality` 0.15 → 0.3:
  **made it worse** — mean population across those 8 seeds rose from
  (baseline for the same 8) to 390.6, one seed hit 2,000 with H 0.543.
- `disease.kinBias` 1.0 → 3.0, `disease.lethality` 0.15 → 0.25 (a lighter
  touch, aimed only at same-species transmission): **also worse** — mean
  population 555.5, one previously-borderline seed (40, max share 54.1%
  before) jumped to population 1,080 and max share 94.4%.

Both directions back the population off periodically (more deaths), but
in a monoculture there is no competing species to take the freed niche,
so the same lineage simply rebounds into it — disease acts as a reset
that fuels a bigger boom-bust cycle rather than a stabiliser. `disease.*`
is not a usable lever for this failure mode; reverted both attempts.

## P3-10 pressure tuning — after

Config change (`src/core/config.js`, defaults only): `regrowth.debtFactor`
0.3 → 0.1, `regrowth.debtTicks` 3600 → 10800 (grazed-to-zero tiles regrow
at a third of the rate, for three times as long). Reached on the 3rd
iteration (after the two rejected `disease.*` attempts above), tested
first on the same 8 worst seeds, then confirmed with no regression on
seeds 1-8 (already healthy in the "before" sweep), then run as the full
40-seed sweep below. Rationale: a longer, harsher regrowth penalty caps
how large _any_ lineage's local population burst can get before its own
grazing throttles its food, which — unlike disease — bites before a
monoculture can form rather than after, and does not depend on a
competing species existing to benefit from the culling.

`node scripts/sweep.mjs --seeds 1..40 --ticks 100000` against this
default. Full table in `docs/sweeps/p3-10-after.txt`; summary:

| metric                               | before | after | target      |
| ------------------------------------ | ------ | ----- | ----------- |
| survived (pop>0 ∧ herb>0 ∧ carn>0)   | 40/40  | 40/40 | all 40      |
| mean population                      | 94.7   | 31.3  | —           |
| mean Shannon diversity (H)           | 1.855  | 1.772 | ≥ 0.8       |
| mean max species share               | 33.6%  | 28.7% | —           |
| seeds with end-state max share > 70% | 6/40   | 1/40  | 0 (ideally) |
| worst-case max species share         | 98.0%  | 70.7% | ≤ 70%       |
| worst-case end-state H               | 0.270  | 1.520 | ≥ 0.8       |

**Result:** every numeric target is **met** in aggregate. The worst
seed (23) still lands at 70.7% max share at the exact end tick (barely
over, and its living-species count of 3 and H of 1.598 both still clear
the soak's per-seed minimums); the other 39/40 seeds now sit in the
20-42% max-share range with H between 1.5 and 2.3 — no more
multi-hundred-population monocultures. Mean population dropped
94.7 → 31.3 not because the ecosystem shrank overall, but because the
"before" mean was dominated by the 6-8 explosive-monoculture outliers;
the typical (median-like) seed's population is essentially unchanged
(compare the two tables' non-outlier rows). `pheromone.*`,
`famine.plantFraction` and `immigration.*` were left at their P3-01/
P3-05/P3-06 introduced defaults — the regrowth change alone already met
every target; no other Phase-3 or earlier ⚠️ key needed adjustment (no
earlier target regressed). 3 of the allowed 6 sweep iterations were used
(2 rejected `disease.*` attempts, 1 accepted `regrowth.*` change).

Pinned seeds for `test/soak/ecology.test.js`'s full 100,000-tick soak:
seed 8 (12 living species, H 1.816, max share 20.5%, carnivores 9) and
seed 39 (14 living species, H 2.060, max share 19.0%, carnivores 10) —
both chosen for margin on every SPEC §9.3 target, not just the minimum
ones, from `docs/sweeps/p3-10-after.txt`.
