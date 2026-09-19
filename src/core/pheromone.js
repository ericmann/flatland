/**
 * The four stigmergic pheromone channels (SPEC §4.8): `world.pher[0..3]`,
 * each an independent `Float32Array(width*height)` grid that decays every
 * tick, diffuses to its 4-neighbour mean on a cadence, and carries
 * emission from organisms' brain outputs. Sensing (the ahead-minus-behind
 * gradient) lives in `senses.js`, not here.
 *
 * Determinism (SPEC §3.1, §6.3): row-major loops only; `diffuse()` writes
 * into `world.pherScratch` (one shared scratch buffer, allocated once in
 * `world.js`'s constructor) then copies back into `world.pher[c]` — never
 * swaps buffers — so `HASH_ORDER` and the store's layout stay fixed.
 * Bounded `O(tiles)` per channel per call.
 */
import { clamp } from './fmath.js';
import { TRAIT, TRAIT_COUNT, BRAIN_OUTPUTS } from './genome.js';

/** Number of pheromone channels (SPEC §4.8). */
export const CHANNELS = 4;

/**
 * `reflex.js`'s `OUTPUT.emit0..emit3` indices, duplicated locally: `world.js`
 * already imports `reflex.js` (which imports `world.js` for `DEATH`), so
 * `pheromone.js` importing `OUTPUT` from `reflex.js` would cycle back
 * through `world.js` — same reason `ecology.js` duplicates `OUTPUT.eat`.
 */
const OUTPUT_EMIT0 = 3;

/**
 * Multiply every channel by its own decay rate (SPEC §4.8), every tick.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function decay(world) {
  if (!world.cfg.pheromone.enabled) return;
  const rates = world.cfg.pheromone.decay;
  for (let c = 0; c < CHANNELS; c++) {
    const p = world.pher[c];
    const rate = rates[c];
    for (let i = 0; i < p.length; i++) {
      p[i] *= rate;
    }
  }
}

/**
 * 4-neighbour diffusion (SPEC §4.8), run every `pheromone.diffuseEvery`
 * ticks by the caller. Edge tiles average over only their in-bounds
 * neighbours, so nothing leaks off the grid.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function diffuse(world) {
  if (!world.cfg.pheromone.enabled) return;
  const { width, height } = world;
  const rates = world.cfg.pheromone.diffusion;
  const scratch = world.pherScratch;

  for (let c = 0; c < CHANNELS; c++) {
    const p = world.pher[c];
    const rate = rates[c];
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const i = row + x;
        let sum = 0;
        let n = 0;
        if (x > 0) {
          sum += p[i - 1];
          n++;
        }
        if (x < width - 1) {
          sum += p[i + 1];
          n++;
        }
        if (y > 0) {
          sum += p[i - width];
          n++;
        }
        if (y < height - 1) {
          sum += p[i + width];
          n++;
        }
        const mean = n > 0 ? sum / n : p[i];
        scratch[i] = clamp(p[i] + rate * (mean - p[i]), 0, 1);
      }
    }
    p.set(scratch);
  }
}

/**
 * Deposit into all 4 channels at organism `i`'s current tile, from its
 * emit outputs × emit genes (SPEC §4.8), only where the output clears the
 * 0.05 emission gate. Called from `world.js`'s per-organism loop, after
 * `act()` has moved the organism.
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function emit(world, i) {
  if (!world.cfg.pheromone.enabled) return;
  const store = world.store;
  const outOff = i * BRAIN_OUTPUTS;
  const pOff = i * TRAIT_COUNT;
  const tile = Math.floor(store.y[i]) * world.width + Math.floor(store.x[i]);
  const emitRate = world.cfg.pheromone.emitRate;

  for (let c = 0; c < CHANNELS; c++) {
    const outVal = world.outputs[outOff + OUTPUT_EMIT0 + c];
    if (outVal < 0.05) continue;
    const gene = store.pheno[pOff + TRAIT.emit0 + c];
    world.pher[c][tile] = Math.min(1, world.pher[c][tile] + outVal * gene * emitRate);
  }
}
