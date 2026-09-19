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

    // P5-06 perf pass: profiling the default 256x160 world showed this
    // function as the single largest cost in a 20,000-tick run (~28% of
    // samples) — every one of its four in-bounds checks re-evaluated on
    // every tile, even though only the outermost ring of tiles is ever
    // missing a neighbour. Interior tiles (the vast majority) always
    // have all 4 in-bounds, so `n` is always 4 and this loop computes the
    // exact same `sum`/`mean`/`clamp` as the general case below with no
    // branches — same left-to-right summation order (left, right, up,
    // down) as the border case, and `/4` on a `Float32` sum is exact
    // (power-of-two divisor), so results are bit-identical, not just
    // numerically close.
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const i = row + x;
        const sum = p[i - 1] + p[i + 1] + p[i - width] + p[i + width];
        const mean = sum / 4;
        scratch[i] = clamp(p[i] + rate * (mean - p[i]), 0, 1);
      }
    }

    // Border tiles (first/last row, first/last column): fewer than 4
    // in-bounds neighbours, so the general case applies. The two loops
    // below visit each border tile exactly once (the row loop covers
    // both corners of each end row; the column loop then covers only the
    // interior of each end column), and the `width > 1`/`height > 1`
    // guards keep a 1-wide or 1-tall world (test fixtures use these) from
    // being visited twice.
    for (let x = 0; x < width; x++) {
      diffuseBorderTile(p, scratch, rate, x, 0, width, height);
      if (height > 1) diffuseBorderTile(p, scratch, rate, x, height - 1, width, height);
    }
    for (let y = 1; y < height - 1; y++) {
      diffuseBorderTile(p, scratch, rate, 0, y, width, height);
      if (width > 1) diffuseBorderTile(p, scratch, rate, width - 1, y, width, height);
    }

    p.set(scratch);
  }
}

/**
 * One border tile's 4-neighbour mean (however many of the 4 are in
 * bounds), written into `scratch[i]` — the general case `diffuse()`'s
 * interior fast path above skips for the tiles it knows are all in
 * bounds. Identical arithmetic to the single loop this replaced.
 * @param {Float32Array} p
 * @param {Float32Array} scratch
 * @param {number} rate
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {void}
 */
function diffuseBorderTile(p, scratch, rate, x, y, width, height) {
  const i = y * width + x;
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
