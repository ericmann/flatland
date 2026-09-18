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
