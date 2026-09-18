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
    // Tuned in P1-11 (docs/tuning.md): 0.004 could not keep up with even a
    // lightly grazed population (regrowth was ~8x under total metabolic
    // demand at the default genesis population), so every seed starved out
    // by ~5,000 ticks regardless of any other knob.
    growth: 0.6,
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
    turnRate: 0.5,
    biteSize: 0.1,
  }),
  energy: Object.freeze({
    etaHerb: 0.7,
    etaCarn: 0.8,
  }),
  brain: Object.freeze({
    hidden: 8,
  }),
  genome: Object.freeze({
    sigmaMut: 0.05,
    pMut: 0.15,
    pBig: 0.01,
    hueScale: 0.2,
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
    // Tuned in P1-11 (docs/tuning.md): [1.0, 3.0] days put maturity
    // (maturityFrac * lifespan) and death within a few thousand ticks of
    // each other for most of the genesis cohort, so nearly nobody lived
    // long enough past maturity to breed before the whole cohort died of
    // old age in one synchronized wave.
    lifespan: Object.freeze([3.0, 9.0]),
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
    // Tuned in P1-11 (docs/tuning.md): 0.05 packed each lineage's founders
    // into a near-uniform cluster (local density well above
    // breeding.localK), which suppressed density-dependent breeding almost
    // everywhere from tick 0.
    lineageNoise: 0.15,
    // Tuned in P1-11 alongside lineageNoise, for the same reason: 12 tiles
    // held ~50 organisms at a density far above breeding.localK.
    clusterRadius: 25,
    energyFraction: 0.6,
    dietHerbivore: Object.freeze([0.02, 0.2]),
    dietCarnivore: Object.freeze([0.8, 0.98]),
  }),
  senses: Object.freeze({
    sampleDistance: 3,
    kinRadius: 5,
    kinNorm: 8,
  }),
  // Only the two keys senses.js needs now; enabled/reach/killChance arrive
  // with predation itself in P1-07.
  predation: Object.freeze({
    enabled: true,
    reach: 1.0,
    minDiet: 0.5,
    killChance: 0.5,
    maxPreySizeRatio: 1.5,
  }),
  movement: Object.freeze({
    enabled: true,
  }),
  metabolism: Object.freeze({
    enabled: true,
    // Tuned in P1-11 (docs/tuning.md), down from 0.02: eased the resting
    // metabolic floor a little to widen the margin between grazing income
    // and upkeep, alongside the plants.growth increase.
    base: 0.015,
    moveCost: 3.0,
  }),
  aging: Object.freeze({
    enabled: true,
  }),
  reflex: Object.freeze({
    hungerGate: 0.15,
  }),
  breeding: Object.freeze({
    enabled: true,
    radius: 6,
    // Tuned in P1-11 (docs/tuning.md), up from 10: genesis clusters (even
    // widened by clusterRadius/lineageNoise) still start well above 10
    // neighbours within this radius, which zeroed the density term
    // (1 - count/localK) almost everywhere.
    localK: 50,
    // Tuned in P1-11 alongside localK, up from 0.01: with the density term
    // now less punishing, this still needed raising to produce enough
    // births to outpace the (widened, but still finite) old-age death rate.
    baseRate: 0.04,
    childEnergyFraction: 0.35,
  }),
  stats: Object.freeze({
    sampleEvery: 30,
    historyLength: 1024,
  }),
  sim: Object.freeze({
    tps: 30,
    batchBudgetMs: 12,
    fallbackBudgetMs: 6,
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
  [
    'genome.sigmaMut',
    {
      units: 'gene units',
      assumption: true,
      doc: 'Standard deviation of a small mutation step, before the hue-specific scale (SPEC §4.6).',
    },
  ],
  [
    'genome.pMut',
    {
      units: 'probability/gene',
      assumption: true,
      doc: 'Chance each gene gets a small mutation at birth (SPEC §4.6).',
    },
  ],
  [
    'genome.pBig',
    {
      units: 'probability/gene',
      assumption: true,
      doc: 'Chance each gene also gets a large (4x sigma) mutation at birth, independent of the small one (SPEC §4.6).',
    },
  ],
  [
    'genome.hueScale',
    {
      units: 'multiplier',
      assumption: true,
      doc: "Multiplies sigmaMut for the hue gene only, so hue drifts slower than other traits (SPEC §4.6: 'slow hue').",
    },
  ],
  [
    'senses.sampleDistance',
    {
      units: 'tiles',
      assumption: false,
      doc: 'Radius of the 8-compass-direction plant/carcass gradient sample (SPEC §4.7).',
    },
  ],
  [
    'senses.kinRadius',
    {
      units: 'tiles',
      assumption: false,
      doc: 'Radius within which same-species neighbours count toward the kin-density input (SPEC §4.7).',
    },
  ],
  [
    'senses.kinNorm',
    {
      units: 'count',
      assumption: false,
      doc: 'Kin count that saturates the kin-density input at 1 (SPEC §4.7).',
    },
  ],
  [
    'predation.minDiet',
    {
      units: 'diet axis [0,1]',
      assumption: true,
      doc: 'Minimum diet-axis value for an organism to be capable of predation (used by senses and predation, SPEC §4.5).',
    },
  ],
  [
    'predation.maxPreySizeRatio',
    {
      units: 'ratio',
      assumption: true,
      doc: "Prey must be no larger than the predator's size times this ratio (SPEC §4.5).",
    },
  ],
  [
    'organisms.turnRate',
    {
      units: 'rad/tick at turn=1',
      assumption: false,
      doc: 'Heading change per tick at full turn output (SPEC §4.7).',
    },
  ],
  [
    'movement.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for movement (SPEC §9.1).',
    },
  ],
  [
    'metabolism.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for metabolic energy cost (SPEC §9.1).',
    },
  ],
  [
    'metabolism.base',
    {
      units: 'energy/tick at throttle=0',
      assumption: true,
      doc: 'Base metabolic rate (SPEC §4.5).',
    },
  ],
  [
    'metabolism.moveCost',
    {
      units: 'multiplier at full throttle and max speed',
      assumption: true,
      doc: 'Extra metabolic cost from movement, scaled by throttle and speed (SPEC §4.5).',
    },
  ],
  [
    'aging.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for aging and death by old age (SPEC §9.1).',
    },
  ],
  [
    'reflex.hungerGate',
    {
      units: 'hunger fraction [0,1]',
      assumption: false,
      doc: "Hunger threshold above which the permanent reflex layer forces eat=1 on a food tile (SPEC §4.7's bootstrap reflex).",
    },
  ],
  [
    'organisms.biteSize',
    {
      units: 'plant/carcass units per tick',
      assumption: true,
      doc: 'Maximum amount an organism can eat from a tile in one tick (SPEC §4.4).',
    },
  ],
  [
    'energy.etaHerb',
    {
      units: 'efficiency [0,1]',
      assumption: true,
      doc: 'Assimilation efficiency for plant matter, scaled by (1 - diet) (SPEC §4.4).',
    },
  ],
  [
    'energy.etaCarn',
    {
      units: 'efficiency [0,1]',
      assumption: true,
      doc: 'Assimilation efficiency for flesh (carcass and predation), scaled by diet (SPEC §4.4).',
    },
  ],
  [
    'predation.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for predation kills (SPEC §9.1).',
    },
  ],
  [
    'predation.reach',
    {
      units: 'tiles',
      assumption: true,
      doc: 'Contact radius within which an attacker can kill a target (SPEC §4.5).',
    },
  ],
  [
    'predation.killChance',
    {
      units: 'probability per tick',
      assumption: true,
      doc: 'Probability an attack within reach succeeds (SPEC §4.5).',
    },
  ],
  [
    'breeding.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for breeding (SPEC §9.1).',
    },
  ],
  [
    'breeding.radius',
    {
      units: 'tiles',
      assumption: true,
      doc: 'Radius counted for the local density N in the density-dependent breeding rule (SPEC §4.5).',
    },
  ],
  [
    'breeding.localK',
    {
      units: 'count',
      assumption: true,
      doc: 'Local carrying capacity K_local: breeding probability scales by max(0, 1 - N/K) (SPEC §4.5).',
    },
  ],
  [
    'breeding.baseRate',
    {
      units: 'probability per tick at N=0',
      assumption: true,
      doc: 'Breeding probability with no crowding (SPEC §4.5).',
    },
  ],
  [
    'breeding.childEnergyFraction',
    {
      units: 'fraction of parent energy',
      assumption: true,
      doc: "Energy given to a newborn, as a fraction of the parent's energy at the moment of birth (SPEC §4.5).",
    },
  ],
  [
    'stats.sampleEvery',
    {
      units: 'ticks',
      assumption: false,
      doc: 'How often stats.sample() runs (SPEC §6.3).',
    },
  ],
  [
    'stats.historyLength',
    {
      units: 'samples',
      assumption: false,
      doc: "Capacity of the stats ring buffer (SPEC §5.2's charts window).",
    },
  ],
  [
    'sim.tps',
    {
      units: 'ticks/s',
      assumption: false,
      doc: 'Fixed simulation rate at speed = 1 (SPEC §6.4).',
    },
  ],
  [
    'sim.batchBudgetMs',
    {
      units: 'ms',
      assumption: false,
      doc: 'Wall-clock budget per pump() batch in a Worker before ticks are dropped from the wall-clock target, not the simulation (SPEC §6.4).',
    },
  ],
  [
    'sim.fallbackBudgetMs',
    {
      units: 'ms',
      assumption: false,
      doc: 'Wall-clock budget per pump() batch on the main-thread fallback (SPEC §6.4), smaller than sim.batchBudgetMs since it shares the thread with rendering.',
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
