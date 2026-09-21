/**
 * Terrain generation (SPEC §4.2): six types from seeded multi-octave value
 * noise, thresholded, with a contiguity guarantee for grass and water,
 * re-rolling with seed+1 up to a configured limit.
 *
 * Determinism (SPEC §3.1): all randomness comes from an `Rng` constructed
 * inside this module from `seed ^ 0x7e44a1` (a fixed salt distinguishing
 * the terrain stream from anything else that might reuse the same raw
 * seed number); nothing else. Component labelling uses an iterative flood
 * fill on a preallocated `Int32Array` stack — no recursion.
 */
import { Rng } from './rng.js';
import { makeNoise, fbm } from './noise.js';
import { sin, TAU } from './fmath.js';

export const TERRAIN = Object.freeze({
  WATER: 0,
  SAND: 1,
  MUD: 2,
  GRASS: 3,
  SCRUB: 4,
  ROCK: 5,
});

export const TERRAIN_NAMES = Object.freeze(['water', 'sand', 'mud', 'grass', 'scrub', 'rock']);

/** Salt distinguishing the terrain Rng stream (see module doc). */
const TERRAIN_SALT = 0x7e44a1;

const PI = TAU / 2;

/**
 * Classify a noise value into a TERRAIN type using the configured
 * thresholds (SPEC §4.2): value < water -> WATER, < sand -> SAND,
 * < mud -> MUD, < grass -> GRASS, < scrub -> SCRUB, else ROCK.
 * @param {number} v
 * @param {{water: number, sand: number, mud: number, grass: number, scrub: number}} thresholds
 * @returns {number}
 */
function classify(v, thresholds) {
  if (v < thresholds.water) return TERRAIN.WATER;
  if (v < thresholds.sand) return TERRAIN.SAND;
  if (v < thresholds.mud) return TERRAIN.MUD;
  if (v < thresholds.grass) return TERRAIN.GRASS;
  if (v < thresholds.scrub) return TERRAIN.SCRUB;
  return TERRAIN.ROCK;
}

/**
 * The fraction of all tiles occupied by the largest 4-connected component
 * of the given terrain type. Iterative flood fill (a preallocated stack,
 * no recursion) so this scales to large maps without blowing the call
 * stack (SPEC §4.2's contiguity guarantee).
 * @param {Uint8Array} terrain
 * @param {number} w
 * @param {number} h
 * @param {number} type
 * @returns {number}
 */
function largestComponentFraction(terrain, w, h, type) {
  const total = w * h;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  let best = 0;

  for (let start = 0; start < total; start++) {
    if (seen[start] || terrain[start] !== type) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let count = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      count++;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) {
        const n = idx - 1;
        if (!seen[n] && terrain[n] === type) {
          seen[n] = 1;
          stack[sp++] = n;
        }
      }
      if (x < w - 1) {
        const n = idx + 1;
        if (!seen[n] && terrain[n] === type) {
          seen[n] = 1;
          stack[sp++] = n;
        }
      }
      if (y > 0) {
        const n = idx - w;
        if (!seen[n] && terrain[n] === type) {
          seen[n] = 1;
          stack[sp++] = n;
        }
      }
      if (y < h - 1) {
        const n = idx + w;
        if (!seen[n] && terrain[n] === type) {
          seen[n] = 1;
          stack[sp++] = n;
        }
      }
    }
    if (count > best) best = count;
  }

  return best / total;
}

/**
 * Generate one candidate terrain map for a given (possibly re-rolled) seed.
 * @param {number} seed
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {Uint8Array}
 */
function generateOnce(seed, cfg) {
  const w = cfg.world.width;
  const h = cfg.world.height;
  const rng = new Rng((seed ^ TERRAIN_SALT) >>> 0);
  const octaves = cfg.terrain.octaves;
  const layers = octaves.map(
    (/** @type {{scale: number, weight: number, lattice: number}} */ o) => ({
      noise: makeNoise(rng, o.lattice),
      scale: o.scale,
      weight: o.weight,
    }),
  );
  const thresholds = cfg.terrain.thresholds;
  const terrain = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = fbm(layers, x, y);
      // Wetter edges: a gentle sinusoidal bias across the width, as in the
      // reference mockup, so shorelines tend to form near the map edges.
      // P6-05: was a hard-coded 0.05 (CLAUDE.md rule 7 — every tunable is
      // a config key); now cfg.terrain.edgeWetness, default unchanged so
      // this is a pure refactor at the default (verified byte-for-byte
      // via a headless hash, see the P6-05 log entry).
      v += cfg.terrain.edgeWetness * sin((x / w) * PI);
      terrain[y * w + x] = classify(v, thresholds);
    }
  }

  return terrain;
}

/**
 * @typedef {Object} TerrainResult
 * @property {Uint8Array} terrain
 * @property {number} rerolls
 * @property {number} grassFraction
 * @property {number} waterFraction
 */

/**
 * Generate the terrain grid for a world, re-rolling with seed+1, seed+2, …
 * up to `cfg.terrain.maxRerolls` times until the grass and water
 * contiguity guarantees (SPEC §4.2) are met, then throwing if none of the
 * attempts qualify.
 * @param {number} seed
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {TerrainResult}
 */
export function generateTerrain(seed, cfg) {
  const w = cfg.world.width;
  const h = cfg.world.height;
  const maxRerolls = cfg.terrain.maxRerolls;

  for (let attempt = 0; attempt <= maxRerolls; attempt++) {
    const terrain = generateOnce(seed + attempt, cfg);
    const grassFraction = largestComponentFraction(terrain, w, h, TERRAIN.GRASS);
    const waterFraction = largestComponentFraction(terrain, w, h, TERRAIN.WATER);
    if (
      grassFraction >= cfg.terrain.minGrassFraction &&
      waterFraction >= cfg.terrain.minWaterFraction
    ) {
      return { terrain, rerolls: attempt, grassFraction, waterFraction };
    }
  }

  throw new Error(`terrain: no valid map after ${maxRerolls} rerolls`);
}
