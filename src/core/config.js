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
    maxSpecies: 2048,
  }),
  time: Object.freeze({
    ticksPerDay: 1800,
    daysPerYear: 24,
  }),
  terrain: Object.freeze({
    // Noise layers for fbm: each { scale, weight, lattice } samples a
    // makeNoise(rng, lattice) field at (x/scale, y/scale). Weights sum to 1
    // so the raw fbm value stays in [0,1] before the wetter-edges term.
    // Tuned in P0-06 (docs/tuning.md): the original 22/9/4-scale mix left
    // water badly fragmented (many small ponds instead of one connected
    // body), so the high-frequency layers were weighted down and widened.
    octaves: Object.freeze([
      Object.freeze({ scale: 30, weight: 0.75, lattice: 16 }),
      Object.freeze({ scale: 12, weight: 0.2, lattice: 32 }),
      Object.freeze({ scale: 5, weight: 0.05, lattice: 64 }),
    ]),
    // Tuned in P0-06 alongside octaves; mud/grass/scrub widened slightly to
    // keep the grass and scrub bands proportioned after smoothing.
    thresholds: Object.freeze({
      water: 0.34,
      sand: 0.37,
      mud: 0.42,
      grass: 0.64,
      scrub: 0.76,
    }),
    minGrassFraction: 0.08,
    minWaterFraction: 0.02,
    maxRerolls: 16,
    // Indexed by TERRAIN (water, sand, mud, grass, scrub, rock).
    moveCost: Object.freeze([3, 1, 1.6, 1, 1.3, 1.5]),
    visibility: Object.freeze([1, 1.3, 1, 1, 0.45, 1]),
    // Plant carrying capacity by TERRAIN enum order (SPEC §4.2).
    plantCap: Object.freeze([0, 0, 0.35, 1, 0.6, 0]),
  }),
  plants: Object.freeze({
    enabled: true,
    growth: 0.004,
    soilBoost: 2.0,
    initialFill: 0.6,
  }),
  carcass: Object.freeze({
    enabled: true,
    decay: 0.002,
    decayMud: 0.0007,
  }),
  soil: Object.freeze({
    uptake: 0.001,
  }),
  interventions: Object.freeze({
    rain: Object.freeze({
      amount: 0.3,
    }),
  }),
  organisms: Object.freeze({
    energyMaxBase: 150,
    bodyMassPerSize: 40,
  }),
  brain: Object.freeze({
    hidden: 8,
  }),
  // Phenotype ranges (SPEC §4.6): traitValue(cfg, gene, trait) = lo + gene*(hi-lo).
  // One [lo, hi] pair per trait in genome.js's TRAIT_NAMES order.
  phenotype: Object.freeze({
    size: Object.freeze([0.6, 2.0]),
    speed: Object.freeze([0.05, 0.25]),
    diet: Object.freeze([0, 1]),
    visionPeak: Object.freeze([0, 1]),
    visionWidth: Object.freeze([0.15, 0.6]),
    visionRange: Object.freeze([4, 16]),
    metabolism: Object.freeze([0.6, 1.4]),
    lifespan: Object.freeze([1.0, 3.0]),
    maturity: Object.freeze([0.15, 0.45]),
    breedThreshold: Object.freeze([0.5, 0.9]),
    boldness: Object.freeze([0, 1]),
    sociality: Object.freeze([0, 1]),
    prefTemp: Object.freeze([0, 1]),
    swim: Object.freeze([0, 1]),
    resistance: Object.freeze([0, 1]),
    hue: Object.freeze([0, 360]),
    emit0: Object.freeze([0, 1]),
    emit1: Object.freeze([0, 1]),
    emit2: Object.freeze([0, 1]),
    emit3: Object.freeze([0, 1]),
    sense0: Object.freeze([0, 1]),
    sense1: Object.freeze([0, 1]),
    sense2: Object.freeze([0, 1]),
    sense3: Object.freeze([0, 1]),
  }),
  genesis: Object.freeze({
    herbivoreLineages: 3,
    herbivoresPerLineage: 50,
    carnivoreLineages: 1,
    carnivoresPerLineage: 24,
    lineageNoise: 0.05,
    clusterRadius: 12,
    energyFraction: 0.6,
    dietHerbivore: Object.freeze([0.02, 0.2]),
    dietCarnivore: Object.freeze([0.8, 0.98]),
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
    'world.maxSpecies',
    {
      units: 'count',
      assumption: false,
      doc: 'Fixed capacity of the species table (memory ceiling, not an ecological cap; SPEC §10), added in P1-03 for later use by P2-04.',
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
  [
    'terrain.plantCap',
    {
      units: 'plant units [0,1], by TERRAIN enum order',
      assumption: true,
      doc: 'Plant carrying capacity by terrain type (SPEC §4.2).',
    },
  ],
  [
    'plants.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for plant growth (SPEC §9.1: mechanics are tested in isolation).',
    },
  ],
  [
    'plants.growth',
    {
      units: 'plant units/tick at L=1, soil=0',
      assumption: true,
      doc: 'Base plant growth rate g in g*L*(1 - p/cap) (SPEC §4.4).',
    },
  ],
  [
    'plants.soilBoost',
    {
      units: 'multiplier per soil unit',
      assumption: true,
      doc: 'k_soil in the growth formula g*L*(1 + k_soil*soil)*(1 - p/cap) (SPEC §4.4).',
    },
  ],
  [
    'plants.initialFill',
    {
      units: 'fraction of cap',
      assumption: false,
      doc: 'Initial plant level at genesis, as a fraction of each tile’s cap.',
    },
  ],
  [
    'carcass.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for carcass decay (SPEC §9.1).',
    },
  ],
  [
    'carcass.decay',
    {
      units: 'fraction/tick',
      assumption: true,
      doc: 'Carcass decay rate on non-mud terrain (SPEC §4.4).',
    },
  ],
  [
    'carcass.decayMud',
    {
      units: 'fraction/tick',
      assumption: true,
      doc: 'Carcass decay rate on mud, slower than open ground (SPEC §4.4: "carcasses persist longer" on mud).',
    },
  ],
  [
    'soil.uptake',
    {
      units: 'fraction/tick',
      assumption: true,
      doc: 'Fraction of soil nutrient tapped per tick as an input to plant growth (SPEC §4.4).',
    },
  ],
  [
    'interventions.rain.amount',
    {
      units: 'plant units',
      assumption: false,
      doc: 'Plant boost per tile from the rain intervention (SPEC §5.3).',
    },
  ],
  [
    'organisms.energyMaxBase',
    {
      units: 'energy',
      assumption: true,
      doc: 'Base of energyMax = energyMaxBase * (0.5 + size) (SPEC §4.5).',
    },
  ],
  [
    'organisms.bodyMassPerSize',
    {
      units: 'energy per size unit',
      assumption: true,
      doc: 'body = bodyMassPerSize * size: energy paid by the parent at birth, returned to the carcass at death (SPEC §4.4, §4.5).',
    },
  ],
  [
    'brain.hidden',
    {
      units: 'units',
      assumption: true,
      doc: 'Hidden-layer width of the brain (SPEC §4.7); sizes the genome weight block.',
    },
  ],
]);

// One DOCS entry per phenotype.<trait> range (SPEC §4.6), generated instead
// of duplicated by hand for all 24 traits.
const PHENOTYPE_UNITS = Object.freeze({
  size: 'multiplier (sprite size and body mass)',
  speed: 'tiles/tick',
  diet: 'axis [0,1] (0 = obligate herbivore, 1 = obligate carnivore)',
  visionPeak: 'light level [0,1]',
  visionWidth: 'light level width',
  visionRange: 'tiles',
  metabolism: 'multiplier',
  lifespan: 'days',
  maturity: 'fraction of lifespan',
  breedThreshold: 'fraction of energyMax',
  boldness: 'unitless [0,1]',
  sociality: 'unitless [0,1]',
  prefTemp: 'unitless [0,1]',
  swim: 'unitless [0,1]',
  resistance: 'unitless [0,1]',
  hue: 'degrees',
  emit0: 'unitless [0,1]',
  emit1: 'unitless [0,1]',
  emit2: 'unitless [0,1]',
  emit3: 'unitless [0,1]',
  sense0: 'unitless [0,1]',
  sense1: 'unitless [0,1]',
  sense2: 'unitless [0,1]',
  sense3: 'unitless [0,1]',
});
for (const [trait, units] of Object.entries(PHENOTYPE_UNITS)) {
  DOCS.set(`phenotype.${trait}`, {
    units,
    assumption: true,
    doc: `Phenotype range [lo, hi] for the ${trait} trait gene (SPEC §4.6).`,
  });
}

// One DOCS entry per genesis.* key (SPEC §4.5, §4.9), all assumptions.
const GENESIS_DOCS = Object.freeze({
  herbivoreLineages: ['count', 'Number of founder herbivore lineages at genesis.'],
  herbivoresPerLineage: ['count', 'Members per herbivore founder lineage at genesis.'],
  carnivoreLineages: ['count', 'Number of founder carnivore lineages at genesis.'],
  carnivoresPerLineage: ['count', 'Members per carnivore founder lineage at genesis.'],
  lineageNoise: [
    'sd of gene value',
    "Standard deviation of each member's per-trait-gene noise around its lineage founder.",
  ],
  clusterRadius: [
    'tiles',
    "Radius of the uniform disc genesis members are scattered in around their lineage's centre.",
  ],
  energyFraction: [
    'fraction of energyMax',
    'Starting energy for a genesis organism, as a fraction of its own energyMax.',
  ],
  dietHerbivore: [
    'diet axis [0,1] range',
    'Range the herbivore founder diet gene is drawn from (SPEC §4.6 diet axis).',
  ],
  dietCarnivore: [
    'diet axis [0,1] range',
    'Range the carnivore founder diet gene is drawn from (SPEC §4.6 diet axis).',
  ],
});
for (const [key, [units, doc]] of Object.entries(GENESIS_DOCS)) {
  DOCS.set(`genesis.${key}`, { units, assumption: true, doc });
}

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
