/**
 * Config is data (SPEC §3.7): every tunable lives here, with a unit and a
 * default, never as a literal elsewhere in `src/core`. Keys marked
 * `assumption: true` are the SPEC's `⚠️ ASSUMPTION` values and are the only
 * ones tuning tasks may change (see docs/PLAN.md → Conventions → Config).
 *
 * This file introduces only the P0-02 keys (world sizing, tick/day/year
 * length). Every later task that needs a new tunable adds its section here
 * and documents it in DOCS; nothing outside this file may hard-code a
 * tunable value.
 */

/**
 * @typedef {Object} ConfigDoc
 * @property {string} units
 * @property {boolean} assumption
 * @property {string} doc
 */

export const DEFAULTS = Object.freeze({
  world: Object.freeze({
    width: 256,
    height: 160,
    maxOrganisms: 2000,
    cellSize: 8,
  }),
  time: Object.freeze({
    ticksPerDay: 1800,
    daysPerYear: 24,
  }),
  terrain: Object.freeze({
    // Noise layers for fbm: each { scale, weight, lattice } samples a
    // makeNoise(rng, lattice) field at (x/scale, y/scale). Weights sum to 1
    // so the raw fbm value stays in [0,1] before the wetter-edges term.
    octaves: Object.freeze([
      Object.freeze({ scale: 22, weight: 0.6, lattice: 16 }),
      Object.freeze({ scale: 9, weight: 0.3, lattice: 32 }),
      Object.freeze({ scale: 4, weight: 0.1, lattice: 64 }),
    ]),
    thresholds: Object.freeze({
      water: 0.34,
      sand: 0.38,
      mud: 0.44,
      grass: 0.62,
      scrub: 0.74,
    }),
    minGrassFraction: 0.08,
    minWaterFraction: 0.02,
    maxRerolls: 16,
    // Indexed by TERRAIN (water, sand, mud, grass, scrub, rock).
    moveCost: Object.freeze([3, 1, 1.6, 1, 1.3, 1.5]),
    visibility: Object.freeze([1, 1.3, 1, 1, 0.45, 1]),
  }),
});

/** @type {Map<string, ConfigDoc>} */
export const DOCS = new Map([
  [
    'world.width',
    {
      units: 'tiles',
      assumption: true,
      doc: 'World width. Sized for ~300–600 organisms on a phone (SPEC §4.1). Tests use 64.',
    },
  ],
  [
    'world.height',
    {
      units: 'tiles',
      assumption: true,
      doc: 'World height. Sized for ~300–600 organisms on a phone (SPEC §4.1). Tests use 40.',
    },
  ],
  [
    'world.maxOrganisms',
    {
      units: 'slots',
      assumption: false,
      doc: 'Fixed capacity of the organism SoA store (memory ceiling, not an ecological cap; SPEC §10).',
    },
  ],
  [
    'world.cellSize',
    {
      units: 'tiles',
      assumption: false,
      doc: 'Spatial hash cell size for the neighbour grid (SPEC §6.3).',
    },
  ],
  [
    'time.ticksPerDay',
    {
      units: 'ticks',
      assumption: true,
      doc: 'Ticks per world day (SPEC §4.3, DAY).',
    },
  ],
  [
    'time.daysPerYear',
    {
      units: 'days',
      assumption: true,
      doc: 'World days per year (SPEC §4.3, YEAR).',
    },
  ],
  [
    'terrain.octaves',
    {
      units: 'tiles (scale), weight [0,1], lattice size — array of layers',
      assumption: true,
      doc: 'fbm noise layers for terrain generation (SPEC §4.2).',
    },
  ],
  [
    'terrain.thresholds.water',
    {
      units: 'noise value [0,1]',
      assumption: true,
      doc: 'Below this, a tile is water (SPEC §4.2).',
    },
  ],
  [
    'terrain.thresholds.sand',
    {
      units: 'noise value [0,1]',
      assumption: true,
      doc: 'Below this (and at/above water), a tile is sand (SPEC §4.2).',
    },
  ],
  [
    'terrain.thresholds.mud',
    {
      units: 'noise value [0,1]',
      assumption: true,
      doc: 'Below this (and at/above sand), a tile is mud (SPEC §4.2).',
    },
  ],
  [
    'terrain.thresholds.grass',
    {
      units: 'noise value [0,1]',
      assumption: true,
      doc: 'Below this (and at/above mud), a tile is grass (SPEC §4.2).',
    },
  ],
  [
    'terrain.thresholds.scrub',
    {
      units: 'noise value [0,1]',
      assumption: true,
      doc: 'Below this (and at/above grass), a tile is scrub; at/above this, rock (SPEC §4.2).',
    },
  ],
  [
    'terrain.minGrassFraction',
    {
      units: 'fraction of all tiles',
      assumption: false,
      doc: 'Minimum size of the largest 4-connected grass component, or re-roll (SPEC §4.2).',
    },
  ],
  [
    'terrain.minWaterFraction',
    {
      units: 'fraction of all tiles',
      assumption: false,
      doc: 'Minimum size of the largest 4-connected water component, or re-roll (SPEC §4.2).',
    },
  ],
  [
    'terrain.maxRerolls',
    {
      units: 'count',
      assumption: false,
      doc: 'Maximum terrain re-rolls (seed+1, seed+2, …) before generation throws (SPEC §4.2).',
    },
  ],
  [
    'terrain.moveCost',
    {
      units: 'multiplier, by TERRAIN enum order',
      assumption: false,
      doc: 'Movement cost divisor by terrain type (SPEC §4.2).',
    },
  ],
  [
    'terrain.visibility',
    {
      units: 'multiplier, by TERRAIN enum order',
      assumption: false,
      doc: 'Detection-range multiplier by terrain type (SPEC §4.2: sand exposed, scrub hides).',
    },
  ],
]);

/**
 * Is `v` a plain object (not an array, not null, not a class instance)?
 * @param {unknown} v
 * @returns {boolean}
 */
function isPlainObject(v) {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Assert every number reachable inside `v` is finite. Throws on NaN/Infinity.
 * @param {*} v
 * @param {string} path
 */
function assertFiniteNumbers(v, path) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new Error(`config: non-finite value at ${path}: ${v}`);
    }
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((item, i) => assertFiniteNumbers(item, `${path}[${i}]`));
    return;
  }
  if (isPlainObject(v)) {
    /** @type {Record<string, *>} */
    const obj = v;
    for (const key of Object.keys(obj)) {
      assertFiniteNumbers(obj[key], path ? `${path}.${key}` : key);
    }
  }
}

/**
 * Deep-merge `overrides` onto `base`. Plain objects are merged key by key;
 * arrays and every other value type are replaced wholesale (SPEC: "arrays
 * replaced, not merged"). Every key path in `overrides` must already exist
 * in `base`, or this throws.
 * @param {*} base
 * @param {*} overrides
 * @param {string} path
 * @returns {*}
 */
function deepMergeChecked(base, overrides, path) {
  if (!isPlainObject(overrides)) {
    // Leaf replacement (numbers, strings, booleans, arrays).
    return overrides;
  }
  if (!isPlainObject(base)) {
    throw new Error(`unknown config key: ${path} (not an object in defaults)`);
  }
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in base)) {
      throw new Error(`unknown config key: ${childPath}`);
    }
    result[key] = deepMergeChecked(base[key], overrides[key], childPath);
  }
  return result;
}

/**
 * Deep-freeze an object in place and return it.
 * @param {*} obj
 * @returns {*}
 */
function deepFreeze(obj) {
  if (isPlainObject(obj) || Array.isArray(obj)) {
    /** @type {Record<string, *>} */
    const rec = obj;
    for (const key of Object.keys(rec)) {
      deepFreeze(rec[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}

/**
 * Build a validated, deep-frozen config from DEFAULTS plus overrides.
 * @param {Object} [overrides]
 * @returns {typeof DEFAULTS}
 */
export function makeConfig(overrides = {}) {
  assertFiniteNumbers(overrides, '');
  const merged = deepMergeChecked(DEFAULTS, overrides, '');
  return deepFreeze(merged);
}

/**
 * Flatten a nested plain-object config into a Map of dotted path -> leaf
 * value. Arrays are treated as leaves, not traversed.
 * @param {Object} cfg
 * @returns {Map<string, *>}
 */
export function flatten(cfg) {
  /** @type {Map<string, *>} */
  const out = new Map();
  /**
   * @param {*} node
   * @param {string} path
   */
  const walk = (node, path) => {
    if (isPlainObject(node)) {
      /** @type {Record<string, *>} */
      const rec = node;
      for (const key of Object.keys(rec)) {
        walk(rec[key], path ? `${path}.${key}` : key);
      }
    } else {
      out.set(path, node);
    }
  };
  walk(cfg, '');
  return out;
}
