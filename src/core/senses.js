/**
 * The 17-value brain input vector (SPEC §4.5, §4.7): vision, threat, food,
 * kin density, pheromones (zero until P3-01), terrain, and a bias unit.
 *
 * Determinism (SPEC §3.1, §6.3): reads `world.grid` (already rebuilt this
 * tick) and writes into the preallocated `world.inputs`/`world.queryOut`;
 * no allocation. Nearest-candidate ties resolve to the lowest slot,
 * checked explicitly since the grid returns candidates cell-major, not in
 * global slot order.
 */
import { sin, cos, atan2, wrapAngle, exp, clamp, TAU } from './fmath.js';
import { TRAIT, TRAIT_COUNT } from './genome.js';
import { TERRAIN } from './terrain.js';

/** Input vector layout (= genome.js's BRAIN_INPUTS = 17). */
export const INPUT = Object.freeze({
  L: 0,
  hunger: 1,
  ageFrac: 2,
  threatSin: 3,
  threatCos: 4,
  threatProx: 5,
  foodSin: 6,
  foodCos: 7,
  foodMag: 8,
  kin: 9,
  pher0: 10,
  pher1: 11,
  pher2: 12,
  pher3: 13,
  terrainVis: 14,
  terrainCost: 15,
  bias: 16,
});

const COMPASS_DIRECTIONS = 8;

/**
 * Unit vectors for the 8 compass directions, precomputed once at module
 * load rather than recomputed with `cos`/`sin` on every
 * `directionalSample` call — these 8 angles are compile-time constants,
 * and `directionalSample` runs up to twice per organism per tick, so this
 * removes up to 16 fmath transcendental calls per organism per tick
 * (found while chasing the P1-10 throughput gate; see the P1-10 log entry).
 * @type {[number, number][]}
 */
const COMPASS_UNIT = Array.from({ length: COMPASS_DIRECTIONS }, (_, k) => {
  const angle = (k * TAU) / COMPASS_DIRECTIONS;
  return [cos(angle), sin(angle)];
});

/**
 * Scratch result for `directionalSample`, reused across calls instead of
 * allocating a fresh object each time (SPEC §3.5: no per-tick allocation).
 * Safe because `gather` only ever calls `directionalSample` synchronously,
 * one at a time, reading the result immediately.
 */
const sampleScratch = { rawX: 0, rawY: 0, maxSample: 0 };

/**
 * The flat tile index for a world position, or -1 if out of bounds.
 * @param {import('./world.js').World} world
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function tileAt(world, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= world.width || iy >= world.height) return -1;
  return iy * world.width + ix;
}

/**
 * Sample a scalar grid (plants or carcass) in 8 compass directions at a
 * fixed distance from (x, y), returning the weighted direction sum and
 * the single largest sample. Out-of-bounds samples (and, when
 * `excludeWater` is set, water-tile samples) count 0.
 * @param {import('./world.js').World} world
 * @param {number} x
 * @param {number} y
 * @param {number} distance
 * @param {Float32Array} field
 * @param {boolean} excludeWater
 * @returns {{ rawX: number, rawY: number, maxSample: number }}
 */
function directionalSample(world, x, y, distance, field, excludeWater) {
  let rawX = 0;
  let rawY = 0;
  let maxSample = 0;
  for (let k = 0; k < COMPASS_DIRECTIONS; k++) {
    const ux = COMPASS_UNIT[k][0];
    const uy = COMPASS_UNIT[k][1];
    const idx = tileAt(world, x + distance * ux, y + distance * uy);
    let sample = 0;
    if (idx !== -1 && !(excludeWater && world.terrain[idx] === TERRAIN.WATER)) {
      sample = field[idx];
    }
    rawX += ux * sample;
    rawY += uy * sample;
    if (sample > maxSample) maxSample = sample;
  }
  sampleScratch.rawX = rawX;
  sampleScratch.rawY = rawY;
  sampleScratch.maxSample = maxSample;
  return sampleScratch;
}

/**
 * Gather the 17-value brain input vector for organism `i` and write it
 * into `world.inputs[i*17 .. i*17+17)`.
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function gather(world, i) {
  const cfg = world.cfg;
  const store = world.store;
  const inputs = world.inputs;
  const off = i * 17;

  const x = store.x[i];
  const y = store.y[i];
  const heading = store.heading[i];
  const pOff = i * TRAIT_COUNT;
  const lambda = store.pheno[pOff + TRAIT.visionPeak];
  const sigma = store.pheno[pOff + TRAIT.visionWidth];
  const R = store.pheno[pOff + TRAIT.visionRange];
  const size = store.pheno[pOff + TRAIT.size];
  const diet = store.pheno[pOff + TRAIT.diet];

  const L = world.light;
  const dAcuity = (L - lambda) / sigma;
  const acuity = exp(-(dAcuity * dAcuity));
  const range = R * (0.25 + 0.75 * acuity);

  inputs[off + INPUT.L] = L;
  inputs[off + INPUT.hunger] = 1 - store.energy[i] / store.energyMax[i];
  inputs[off + INPUT.ageFrac] = Math.min(1, store.age[i] / store.lifespanTicks[i]);

  const minDiet = cfg.predation.minDiet;
  const maxRatio = cfg.predation.maxPreySizeRatio;

  // One grid query at this organism's own vision range serves both the
  // threat scan (organisms that could eat *me*) and the prey scan
  // (organisms *I* could eat), since both use the same range.
  const n = world.grid.queryRange(x, y, range, world.queryOut);
  const queryOut = world.queryOut;
  const mySpecies = store.species[i];

  let bestThreatSlot = -1;
  let bestThreatDist = Infinity;
  const canHunt = diet >= minDiet;
  let bestPreySlot = -1;
  let bestPreyDist = Infinity;

  for (let k = 0; k < n; k++) {
    const j = queryOut[k];
    if (j === i || store.species[j] === mySpecies) continue;
    const jOff = j * TRAIT_COUNT;
    const jx = store.x[j];
    const jy = store.y[j];
    const dx = jx - x;
    const dy = jy - y;
    const d2 = dx * dx + dy * dy;
    const tIdx = tileAt(world, jx, jy);
    const vis = tIdx === -1 ? 1 : cfg.terrain.visibility[world.terrain[tIdx]];
    const effRange = range * vis;
    if (d2 > effRange * effRange) continue;
    const d = Math.sqrt(d2);

    const jDiet = store.pheno[jOff + TRAIT.diet];
    const jSize = store.pheno[jOff + TRAIT.size];

    // Threat: j could eat me.
    if (jDiet >= minDiet && size <= jSize * maxRatio) {
      if (d < bestThreatDist || (d === bestThreatDist && j < bestThreatSlot)) {
        bestThreatDist = d;
        bestThreatSlot = j;
      }
    }
    // Prey: I could eat j.
    if (canHunt && jSize <= size * maxRatio) {
      if (d < bestPreyDist || (d === bestPreyDist && j < bestPreySlot)) {
        bestPreyDist = d;
        bestPreySlot = j;
      }
    }
  }

  let threatSin = 0;
  let threatCos = 0;
  let threatProx = 0;
  if (bestThreatSlot !== -1) {
    const dx = store.x[bestThreatSlot] - x;
    const dy = store.y[bestThreatSlot] - y;
    const theta = atan2(dy, dx);
    const rel = wrapAngle(theta - heading);
    threatSin = sin(rel);
    threatCos = cos(rel);
    threatProx = 1 - bestThreatDist / range;
  }
  inputs[off + INPUT.threatSin] = threatSin;
  inputs[off + INPUT.threatCos] = threatCos;
  inputs[off + INPUT.threatProx] = threatProx;

  // Plant gradient: direction from the raw 8-direction weighted sum,
  // magnitude from the single greenest sample (not the raw vector's own
  // magnitude, so opposite-direction cancellation doesn't understate a
  // tile that is lush in multiple directions at once).
  const capMaxPlants = Math.max(...cfg.terrain.plantCap);
  const plantSample = directionalSample(world, x, y, cfg.senses.sampleDistance, world.plants, true);
  const plantRawLen = Math.sqrt(
    plantSample.rawX * plantSample.rawX + plantSample.rawY * plantSample.rawY,
  );
  const plantDirX = plantRawLen > 1e-9 ? plantSample.rawX / plantRawLen : 0;
  const plantDirY = plantRawLen > 1e-9 ? plantSample.rawY / plantRawLen : 0;
  const plantMag = capMaxPlants > 0 ? plantSample.maxSample / capMaxPlants : 0;
  const plantVecX = plantDirX * plantMag;
  const plantVecY = plantDirY * plantMag;

  let preyVecX;
  let preyVecY;
  if (bestPreySlot !== -1) {
    const dx = store.x[bestPreySlot] - x;
    const dy = store.y[bestPreySlot] - y;
    const dist = bestPreyDist > 1e-9 ? bestPreyDist : 1e-9;
    const mag = 1 - bestPreyDist / range;
    preyVecX = (dx / dist) * mag;
    preyVecY = (dy / dist) * mag;
  } else {
    const carcassSample = directionalSample(
      world,
      x,
      y,
      cfg.senses.sampleDistance,
      world.carcass,
      false,
    );
    const rawLen = Math.sqrt(
      carcassSample.rawX * carcassSample.rawX + carcassSample.rawY * carcassSample.rawY,
    );
    const dirX = rawLen > 1e-9 ? carcassSample.rawX / rawLen : 0;
    const dirY = rawLen > 1e-9 ? carcassSample.rawY / rawLen : 0;
    const mag = Math.min(1, carcassSample.maxSample);
    preyVecX = dirX * mag;
    preyVecY = dirY * mag;
  }

  const foodX = (1 - diet) * plantVecX + diet * preyVecX;
  const foodY = (1 - diet) * plantVecY + diet * preyVecY;
  const foodLen = Math.sqrt(foodX * foodX + foodY * foodY);
  let foodSin = 0;
  let foodCos = 0;
  if (foodLen >= 1e-6) {
    const theta = atan2(foodY, foodX);
    const rel = wrapAngle(theta - heading);
    foodSin = sin(rel);
    foodCos = cos(rel);
  }
  inputs[off + INPUT.foodSin] = foodSin;
  inputs[off + INPUT.foodCos] = foodCos;
  inputs[off + INPUT.foodMag] = clamp(foodLen, 0, 1);

  // Kin density: a second query, at kinRadius (reuses queryOut; safe,
  // since the threat/prey candidates above are already fully processed).
  const kinRadius = cfg.senses.kinRadius;
  const kn = world.grid.queryRange(x, y, kinRadius, queryOut);
  let kinCount = 0;
  for (let k = 0; k < kn; k++) {
    const j = queryOut[k];
    if (j === i || store.species[j] !== mySpecies) continue;
    const dx = store.x[j] - x;
    const dy = store.y[j] - y;
    if (dx * dx + dy * dy <= kinRadius * kinRadius) kinCount++;
  }
  inputs[off + INPUT.kin] = Math.min(1, kinCount / cfg.senses.kinNorm);

  inputs[off + INPUT.pher0] = 0;
  inputs[off + INPUT.pher1] = 0;
  inputs[off + INPUT.pher2] = 0;
  inputs[off + INPUT.pher3] = 0;

  const hereIdx = tileAt(world, x, y);
  const hereType = hereIdx === -1 ? TERRAIN.GRASS : world.terrain[hereIdx];
  const hereVis = cfg.terrain.visibility[hereType];
  const hereCost = cfg.terrain.moveCost[hereType];
  inputs[off + INPUT.terrainVis] = (hereVis - 0.45) / (1.3 - 0.45);
  inputs[off + INPUT.terrainCost] = clamp((hereCost - 1) / 0.6, 0, 1);

  inputs[off + INPUT.bias] = 1;
}
