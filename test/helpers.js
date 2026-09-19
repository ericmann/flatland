/**
 * Shared test helpers (SPEC §9.1): build exactly the state a test needs
 * through these factories, then step the real `World.step()` — never by
 * reimplementing a formula.
 */
import { makeConfig, DEFAULTS, flatten } from '../src/core/config.js';
import { World } from '../src/core/world.js';
import { runGenesis } from '../src/core/genesis.js';
import { TRAIT_NAMES, TRAIT_COUNT, applyPhenotype } from '../src/core/genome.js';

/**
 * Deep-merge two plain override objects (test-only; core's `makeConfig`
 * only merges one override source onto DEFAULTS).
 * @param {*} a
 * @param {*} b
 * @returns {*}
 */
function mergeOverrides(a, b) {
  const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isPlain(a) || !isPlain(b)) return b;
  const out = { ...a };
  for (const key of Object.keys(b)) {
    out[key] = key in out ? mergeOverrides(out[key], b[key]) : b[key];
  }
  return out;
}

/**
 * Set a dotted path on a plain object, creating intermediate objects.
 * @param {*} obj
 * @param {string} path
 * @param {*} value
 */
function setPath(obj, path, value) {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in node)) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

/**
 * A config override object that turns every `*.enabled` mechanic off
 * except the ones named, isolating a mechanic for testing (SPEC §9.1).
 * Discovers `.enabled` keys dynamically from DEFAULTS, so it stays correct
 * as later tasks add mechanics without needing changes here.
 * @param {...string} mechanics dotted prefixes of the mechanics to leave enabled
 * @returns {*}
 */
export function isolate(...mechanics) {
  const overrides = {};
  for (const [key] of flatten(DEFAULTS)) {
    if (!key.endsWith('.enabled')) continue;
    const prefix = key.slice(0, -'.enabled'.length);
    setPath(overrides, key, mechanics.includes(prefix));
  }
  return overrides;
}

/**
 * Build a `World` for tests.
 * @param {Object} [opts]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.seed]
 * @param {number|((x: number, y: number) => number)} [opts.terrain] a TERRAIN
 *   value to fill the whole map, or a function of (x, y) -> TERRAIN value.
 *   When given, bypasses seeded terrain generation.
 * @param {Array<{x: number, y: number, energy?: number, traits?: Record<string, number>}>} [opts.organisms]
 *   When given (even an empty array), genesis is skipped and these
 *   organisms are placed instead.
 * @param {*} [opts.config] deep-merged over DEFAULTS (after width/height)
 * @returns {World}
 */
export function makeWorld({
  width = 64,
  height = 40,
  seed = 1,
  terrain,
  organisms,
  config = {},
} = {}) {
  const merged = mergeOverrides({ world: { width, height } }, config);
  const cfg = makeConfig(merged);

  /** @type {{ terrain?: Uint8Array }} */
  const worldOpts = {};
  if (terrain !== undefined) {
    const arr = new Uint8Array(width * height);
    if (typeof terrain === 'function') {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          arr[y * width + x] = terrain(x, y);
        }
      }
    } else {
      arr.fill(terrain);
    }
    worldOpts.terrain = arr;
  }

  const world = new World(cfg, seed, worldOpts);

  if (organisms === undefined) {
    runGenesis(world);
  } else {
    for (const spec of organisms) {
      makeOrganism(world, spec);
    }
  }

  return world;
}

/**
 * Allocate and fully initialize one organism directly (bypassing genesis),
 * for tests that want to build exactly the state they need.
 * @param {World} world
 * @param {Object} [opts]
 * @param {number} [opts.x]
 * @param {number} [opts.y]
 * @param {number} [opts.energy] defaults to the organism's own energyMax
 * @param {Record<string, number>} [opts.traits] partial trait name -> gene
 *   value in [0,1]; unspecified traits default to 0.5
 * @returns {number} the allocated slot
 */
export function makeOrganism(world, { x = 0, y = 0, energy, traits = {} } = {}) {
  const store = world.store;
  const slot = store.alloc();
  const gLen = store.genomeLength;
  for (let t = 0; t < TRAIT_COUNT; t++) {
    const name = TRAIT_NAMES[t];
    store.genome[slot * gLen + t] = name in traits ? traits[name] : 0.5;
  }
  for (let k = TRAIT_COUNT; k < gLen; k++) {
    store.genome[slot * gLen + k] = 0.5;
  }
  applyPhenotype(world.cfg, store, slot);

  store.x[slot] = x;
  store.y[slot] = y;
  store.heading[slot] = 0;
  store.energy[slot] = energy === undefined ? store.energyMax[slot] : energy;
  store.age[slot] = 0;
  store.species[slot] = 0;
  store.generation[slot] = 1;
  store.parent[slot] = 0;
  store.sick[slot] = 0;
  store.flags[slot] = 0;
  store.offspring[slot] = 0;
  return slot;
}

/**
 * Step a world `n` times.
 * @param {World} world
 * @param {number} n
 * @returns {World}
 */
export function stepN(world, n) {
  for (let i = 0; i < n; i++) {
    world.step();
  }
  return world;
}

/**
 * Living slot indices, in slot order.
 * @param {World} world
 * @returns {number[]}
 */
export function alive(world) {
  const out = [];
  for (let i = 0; i < world.store.highWater; i++) {
    if (world.store.alive[i]) out.push(i);
  }
  return out;
}

/**
 * The flat tile index for a world position.
 * @param {World} world
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function tileIndex(world, x, y) {
  return Math.floor(y) * world.width + Math.floor(x);
}
