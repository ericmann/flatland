/**
 * Tile-scalar energy stocks (plants, carcasses, soil) and the trophic
 * links between them and organisms — grazing, scavenging, predation
 * (SPEC §4.4, §4.5). Row-major tile loops, slot-order organism loops,
 * `fmath` only, no allocation (SPEC §3.1, §6.3).
 */
import { TERRAIN } from './terrain.js';
import { TAU } from './fmath.js';
import { TRAIT, TRAIT_COUNT, BRAIN_OUTPUTS, applyPhenotype, mutate } from './genome.js';
import { DEATH, EV_HUNT, EV_BIRTH, recordEvent } from './world.js';

/**
 * reflex.js's OUTPUT.eat and OUTPUT.breed indices, duplicated here as
 * literals rather than imported: importing from reflex.js would create a
 * three-way import cycle (ecology -> reflex -> world -> ecology) on top of
 * the existing world <-> ecology cycle, since reflex.js already imports
 * DEATH from world.js. reflex.js's OUTPUT enum is
 * `{ turn:0, throttle:1, eat:2, emit0..3:3-6, breed:7 }`.
 */
const OUTPUT_EAT = 2;
const OUTPUT_BREED = 7;

/**
 * Fill every tile's plant level to `plants.initialFill` of its cap
 * (SPEC §4.4 "initial plants at genesis"). Called once, from the `World`
 * constructor, before any organism exists.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function fillInitialPlants(world) {
  const caps = world.cfg.terrain.plantCap;
  const fillFrac = world.cfg.plants.initialFill;
  const plants = world.plants;
  const terrain = world.terrain;
  for (let i = 0; i < plants.length; i++) {
    plants[i] = Math.fround(fillFrac * caps[terrain[i]]);
  }
}

/**
 * Grow plants for one tick (SPEC §4.4): `base = growth * L * (1 - p/cap)`,
 * `fromSoil = min(soil*uptake, base*soilBoost*soil)`, `want = base +
 * fromSoil`, scaled down to fit under cap if needed. The realised growth
 * (`applied`) is attributed to `ledger.sunlight`/`flows.photosynthesis`
 * and `flows.uptake` in proportion to the (possibly scaled) base/fromSoil
 * split, so the two attributions always sum to exactly `applied`. The
 * mechanical soil depletion is accounted separately, with any Float32
 * rounding gap against the intended `fromSoil'` going to `dissipated`.
 * Tiles with cap = 0 are skipped; the whole call is a no-op at L = 0.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function growPlants(world) {
  if (!world.cfg.plants.enabled) return;
  const L = world.light;
  if (L <= 0) return;

  const cfg = world.cfg;
  const caps = cfg.terrain.plantCap;
  const growth = cfg.plants.growth;
  const soilBoost = cfg.plants.soilBoost;
  const uptakeRate = cfg.soil.uptake;
  const plants = world.plants;
  const soil = world.soil;
  const terrain = world.terrain;
  const ledger = world.ledger;

  for (let i = 0; i < plants.length; i++) {
    const cap = caps[terrain[i]];
    if (cap <= 0) continue;

    const p = plants[i];
    const s = soil[i];
    const base = growth * L * (1 - p / cap);
    const fromSoil = Math.min(s * uptakeRate, base * soilBoost * s);
    let baseAdj = base;
    let fromSoilAdj = fromSoil;
    let want = base + fromSoil;
    const room = cap - p;
    if (want > room && want > 0) {
      const scale = room / want;
      baseAdj = base * scale;
      fromSoilAdj = fromSoil * scale;
      want = room;
    }
    if (want <= 0) continue;

    const beforeP = p;
    plants[i] = Math.fround(beforeP + want);
    const applied = plants[i] - beforeP;

    let realisedS = 0;
    if (fromSoilAdj > 0) {
      const beforeS = soil[i];
      soil[i] = Math.fround(beforeS - fromSoilAdj);
      realisedS = beforeS - soil[i];
    }

    // sunlight is exactly the intended photosynthesis share (baseAdj); the
    // soil transfer is exactly what was actually removed from the soil
    // array (realisedS), not the intended fromSoilAdj. Their sum will not
    // in general equal the realised plant growth `applied` (each array
    // rounds independently to Float32) — that residual, in either
    // direction, is dissipated, per the realised-vs-intended rule.
    ledger.sunlight += baseAdj;
    ledger.flows.photosynthesis += baseAdj;
    ledger.flows.uptake += realisedS;
    ledger.dissipated += baseAdj + realisedS - applied;
  }
}

/**
 * Decay carcasses into soil for one tick (SPEC §4.4), slower on mud. The
 * realised carcass removal (`Δ`) is credited to `flows.decay`; the gap
 * between `Δ` and soil's own realised addition goes to `dissipated`.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function decayCarcasses(world) {
  if (!world.cfg.carcass.enabled) return;

  const cfg = world.cfg;
  const carcass = world.carcass;
  const soil = world.soil;
  const terrain = world.terrain;
  const ledger = world.ledger;
  const decayRate = cfg.carcass.decay;
  const decayMudRate = cfg.carcass.decayMud;

  for (let i = 0; i < carcass.length; i++) {
    const c = carcass[i];
    if (c <= 0) continue;
    const rate = terrain[i] === TERRAIN.MUD ? decayMudRate : decayRate;
    const intended = c * rate;

    const beforeC = c;
    carcass[i] = Math.fround(beforeC - intended);
    const delta = beforeC - carcass[i]; // realised removal

    const beforeS = soil[i];
    soil[i] = Math.fround(beforeS + delta);
    const realisedS = soil[i] - beforeS;

    ledger.dissipated += delta - realisedS;
    ledger.flows.decay += delta;
  }
}

/**
 * Eat, when the organism's `eat` output gates on (SPEC §4.4): plants first
 * (herbivore efficiency), then carcass (carnivore efficiency), each capped
 * by `organisms.biteSize` and by remaining room under `energyMax`. The
 * amount actually removed from the source and the amount actually gained
 * are each accounted as realised Float32 deltas; digestive inefficiency
 * (source removed minus energy gained) is dissipated — the general
 * realised-vs-intended rule (see the P1-06 fix to `growPlants`), not the
 * literal "want" quantity, which is an intended, not realised, amount.
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function eatMeal(world, i) {
  if (world.outputs[i * BRAIN_OUTPUTS + OUTPUT_EAT] < 0.5) return;

  const store = world.store;
  const cfg = world.cfg;
  const ledger = world.ledger;
  const pOff = i * TRAIT_COUNT;
  const d = store.pheno[pOff + TRAIT.diet];
  const tile = Math.floor(store.y[i]) * world.width + Math.floor(store.x[i]);
  const biteSize = cfg.organisms.biteSize;

  const effH = cfg.energy.etaHerb * (1 - d);
  if (effH > 1e-6) {
    const room = store.energyMax[i] - store.energy[i];
    let want = Math.min(world.plants[tile], biteSize);
    if (want * effH > room) want = room / effH;
    if (want > 0) {
      const beforeP = world.plants[tile];
      world.plants[tile] = Math.fround(beforeP - want);
      const realisedTaken = beforeP - world.plants[tile];
      const beforeE = store.energy[i];
      store.energy[i] = Math.fround(beforeE + realisedTaken * effH);
      const realisedGain = store.energy[i] - beforeE;
      ledger.dissipated += realisedTaken - realisedGain;
      ledger.flows.grazing += realisedTaken;
    }
  }

  const effC = cfg.energy.etaCarn * d;
  if (effC > 1e-6) {
    const room = store.energyMax[i] - store.energy[i];
    let want = Math.min(world.carcass[tile], biteSize);
    if (want * effC > room) want = room / effC;
    if (want > 0) {
      const beforeC = world.carcass[tile];
      world.carcass[tile] = Math.fround(beforeC - want);
      const realisedTaken = beforeC - world.carcass[tile];
      const beforeE = store.energy[i];
      store.energy[i] = Math.fround(beforeE + realisedTaken * effC);
      const realisedGain = store.energy[i] - beforeE;
      ledger.dissipated += realisedTaken - realisedGain;
      ledger.flows.scavenging += realisedTaken;
    }
  }
}

/**
 * Find this organism's nearest killable target within `predation.reach`
 * (SPEC §4.5): a different species, no larger than
 * `size * predation.maxPreySizeRatio`, only if this organism's own diet
 * clears `predation.minDiet`. Ties resolve to the lowest slot. Writes
 * `world.attackTarget[i]` (-1 if none or ineligible).
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function huntTarget(world, i) {
  const store = world.store;
  const cfg = world.cfg;
  const pOff = i * TRAIT_COUNT;
  const d = store.pheno[pOff + TRAIT.diet];

  world.attackTarget[i] = -1;
  if (d < cfg.predation.minDiet) return;

  const size = store.pheno[pOff + TRAIT.size];
  const reach = cfg.predation.reach;
  const maxRatio = cfg.predation.maxPreySizeRatio;
  const x = store.x[i];
  const y = store.y[i];
  const mySpecies = store.species[i];

  const n = world.grid.queryRange(x, y, reach, world.queryOut);
  const queryOut = world.queryOut;
  let bestSlot = -1;
  let bestDist = Infinity;

  for (let k = 0; k < n; k++) {
    const j = queryOut[k];
    if (j === i || store.species[j] === mySpecies) continue;
    const jSize = store.pheno[j * TRAIT_COUNT + TRAIT.size];
    if (jSize > size * maxRatio) continue;
    const dx = store.x[j] - x;
    const dy = store.y[j] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) continue;
    const dist = Math.sqrt(d2);
    if (dist < bestDist || (dist === bestDist && j < bestSlot)) {
      bestDist = dist;
      bestSlot = j;
    }
  }

  world.attackTarget[i] = bestSlot;
}

/**
 * Resolve every organism's predation attempt (SPEC §4.4, §6.3), in
 * attacker slot order, before the death pass: a prey already dead or
 * already dying this tick cannot be killed twice. On a successful kill
 * (probability `predation.killChance`), the attacker's gain and the
 * carcass remainder are each realised Float32 deltas; the residual
 * (prey's total value minus both realised additions) is dissipated —
 * this single combined term is exactly the sum of the digestive
 * inefficiency and both sides' independent Float32 rounding, algebraically
 * (see the P1-07 log entry for the derivation). The prey's energy and
 * body are zeroed here so the generic death pass in `resolve()` (world.js)
 * adds nothing more for it.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function resolvePredationKills(world) {
  const store = world.store;
  const cfg = world.cfg;
  const ledger = world.ledger;
  const attackTarget = world.attackTarget;

  for (let i = 0; i < store.highWater; i++) {
    if (!store.alive[i]) continue;
    const j = attackTarget[i];
    if (j === -1 || j === i) continue;
    if (!store.alive[j] || world.dying[j] !== 0) continue;
    if (!world.rng.chance(cfg.predation.killChance)) continue;

    const pOff = i * TRAIT_COUNT;
    const d = store.pheno[pOff + TRAIT.diet];
    const effC = cfg.energy.etaCarn * d;
    const E = Math.max(0, store.energy[j]) + store.body[j];
    const room = Math.max(0, store.energyMax[i] - store.energy[i]);

    let taken = 0;
    if (effC > 1e-6) {
      taken = Math.min(E, room / effC);
    }

    const beforeI = store.energy[i];
    store.energy[i] = Math.fround(beforeI + taken * effC);
    const realisedGainI = store.energy[i] - beforeI;

    const tileJ = Math.floor(store.y[j]) * world.width + Math.floor(store.x[j]);
    const remainder = E - taken;
    const beforeCarcass = world.carcass[tileJ];
    world.carcass[tileJ] = Math.fround(beforeCarcass + remainder);
    const realisedCarcass = world.carcass[tileJ] - beforeCarcass;

    ledger.dissipated += E - realisedGainI - realisedCarcass;
    ledger.flows.predation += E;

    recordEvent(world, EV_HUNT, store.x[j], store.y[j], store.species[i], store.species[j]);

    // Prey's value is fully consumed above; zero it so resolve()'s
    // generic death handling adds nothing more for this slot.
    store.energy[j] = 0;
    store.body[j] = 0;
    world.dying[j] = DEATH.HUNTED;
  }
}

/**
 * Check breeding eligibility for one organism and, if it passes the
 * density-dependent roll, queue it in `world.birthQueue` (SPEC §4.5).
 * Eligible when `breeding.enabled`, `outputs.breed >= 0.5`,
 * `energy > breedEnergy`, `age > maturityTicks`; breeding probability is
 * `baseRate * max(0, 1 - N/localK)`, N = living organisms of any species
 * within `breeding.radius` (excluding self).
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function checkBreeding(world, i) {
  if (!world.cfg.breeding.enabled) return;

  const store = world.store;
  if (world.outputs[i * BRAIN_OUTPUTS + OUTPUT_BREED] < 0.5) return;
  if (store.energy[i] <= store.breedEnergy[i]) return;
  if (store.age[i] <= store.maturityTicks[i]) return;

  const cfg = world.cfg;
  const radius = cfg.breeding.radius;
  const x = store.x[i];
  const y = store.y[i];

  const n = world.grid.queryRange(x, y, radius, world.queryOut);
  const queryOut = world.queryOut;
  let count = 0;
  for (let k = 0; k < n; k++) {
    const j = queryOut[k];
    if (j === i) continue;
    const dx = store.x[j] - x;
    const dy = store.y[j] - y;
    if (dx * dx + dy * dy <= radius * radius) count++;
  }

  const p = cfg.breeding.baseRate * Math.max(0, 1 - count / cfg.breeding.localK);
  if (world.rng.chance(p)) {
    world.birthQueue[world.birthQueueLength++] = i;
  }
}

/**
 * Resolve every queued birth, in queue order (= slot order), after kills
 * and deaths have already freed this tick's dead slots (SPEC §4.5, §6.3):
 * a parent that died this tick is skipped, since `resolve()` (world.js)
 * has already freed it by the time this runs. The child's genome is a
 * mutated copy of the parent's (SPEC §4.6; crossover is P5-04). The parent pays the
 * child's starting energy plus its body mass; the sum of realised changes
 * (parent's loss vs. child's energy + body) must be zero, with any
 * Float32 rounding gap going to `dissipated` — the same realised-vs-
 * intended rule used throughout `src/core`.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function resolveBirths(world) {
  const store = world.store;
  const cfg = world.cfg;
  const ledger = world.ledger;
  const queue = world.birthQueue;
  const n = world.birthQueueLength;

  for (let q = 0; q < n; q++) {
    const parent = queue[q];
    if (!store.alive[parent]) continue; // died this tick; resolve() already freed it

    const slot = store.alloc();
    if (slot === -1) {
      world.counters.capacityRefused++;
      continue;
    }

    const gLen = store.genomeLength;
    const pGOff = parent * gLen;
    const cGOff = slot * gLen;
    for (let k = 0; k < gLen; k++) {
      store.genome[cGOff + k] = store.genome[pGOff + k];
    }
    mutate(world.rng, store.genome, cGOff, cfg);
    applyPhenotype(cfg, store, slot);

    const childEnergyIntended = cfg.breeding.childEnergyFraction * store.energy[parent];
    const cost = childEnergyIntended + store.body[slot];

    if (store.energy[parent] < cost) {
      store.free(slot);
      continue;
    }

    const beforeParent = store.energy[parent];
    store.energy[parent] = Math.fround(beforeParent - cost);
    const realisedParentLoss = beforeParent - store.energy[parent];

    store.energy[slot] = Math.fround(childEnergyIntended);

    ledger.dissipated += realisedParentLoss - store.energy[slot] - store.body[slot];
    ledger.flows.births += realisedParentLoss;

    const px = store.x[parent];
    const py = store.y[parent];
    let cx = px + world.rng.range(-0.5, 0.5);
    let cy = py + world.rng.range(-0.5, 0.5);
    cx = Math.max(0, Math.min(world.width - 1e-3, cx));
    cy = Math.max(0, Math.min(world.height - 1e-3, cy));
    const tile = Math.floor(cy) * world.width + Math.floor(cx);
    if (world.terrain[tile] === TERRAIN.WATER) {
      cx = px;
      cy = py;
    }

    store.x[slot] = cx;
    store.y[slot] = cy;
    store.heading[slot] = TAU * world.rng.float();
    store.age[slot] = 0;
    store.species[slot] = store.species[parent]; // inherited by default; assignNewborn may override below
    store.generation[slot] = store.generation[parent] + 1;
    store.parent[slot] = store.id[parent];
    store.sick[slot] = 0;
    store.flags[slot] = 0;
    store.offspring[slot] = 0;
    store.offspring[parent]++;

    const parentSpecies = store.species[parent];
    world.species.assignNewborn(world, slot);

    world.counters.born++;
    recordEvent(world, EV_BIRTH, cx, cy, store.species[slot], parentSpecies);
  }

  world.birthQueueLength = 0;
}
