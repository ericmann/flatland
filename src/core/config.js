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
    fire: Object.freeze({
      radius: 6,
    }),
    meteor: Object.freeze({
      radius: 5,
    }),
    plague: Object.freeze({
      radius: 4,
    }),
    river: Object.freeze({
      radius: 2,
    }),
    meadow: Object.freeze({
      radius: 2.5,
      plants: 0.5,
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
    weightScale: 2.0,
    enabled: true,
  }),
  genome: Object.freeze({
    sigmaMut: 0.05,
    pMut: 0.15,
    pBig: 0.01,
    hueScale: 0.2,
  }),
  species: Object.freeze({
    // Tuned in P2-05 (docs/tuning.md): 0.6 gave a mean of 77 splits per
    // 30k ticks across 40 seeds, far above the [1, 40] target; 1.1+
    // collapses to near-zero splits (a steep cliff between 1.0 and 1.1).
    // 0.9 lands comfortably inside the target with full seed coverage.
    theta: 0.9,
    centroidRate: 0.02,
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
    brainPrior: 'seeded',
    brainNoise: 0.1,
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
  pheromone: Object.freeze({
    enabled: true,
    decay: Object.freeze([0.985, 0.96, 0.98, 0.97]),
    diffusion: Object.freeze([0.2, 0.2, 0.2, 0.2]),
    diffuseEvery: 4,
    emitRate: 0.1,
    senseGain: 4,
  }),
  disease: Object.freeze({
    enabled: true,
    contactRadius: 1.0,
    contactRate: 0.02,
    kinBias: 1.0,
    spontaneousRate: 1e-6,
    durationTicks: 1200,
    costPerTick: 0.03,
    lethality: 0.15,
    outbreakThreshold: 10,
    // One day at the default time.ticksPerDay (1800); not derived from it
    // so a config override to one doesn't silently retune the other.
    chronicleCooldown: 1800,
  }),
  regrowth: Object.freeze({
    enabled: true,
    zeroThreshold: 0.01,
    debtTicks: 10800,
    debtFactor: 0.1,
  }),
  famine: Object.freeze({
    plantFraction: 0.1,
  }),
  immigration: Object.freeze({
    enabled: true,
    checkEvery: 600,
    floorHerbivores: 20,
    floorCarnivores: 4,
    cooldownTicks: 1800,
    groupSize: 8,
  }),
  // Lagged ambient temperature and its metabolic cost (SPEC §4.3, Phase 5).
  temperature: Object.freeze({
    enabled: true,
    base: 0.35,
    dayGain: 0.4,
    seasonAmp: 0.2,
    lag: 0.002,
    costGain: 1.0,
  }),
  // Rare discrete weather events: rain (moisture pulse) and fog (vision
  // penalty), SPEC §4.3, Phase 5. Rates are per-tick probabilities, not
  // derived from `time.ticksPerDay` (1800 by default) so a config
  // override to one doesn't silently retune the other — see
  // `disease.chronicleCooldown`'s comment for the same reasoning.
  weather: Object.freeze({
    enabled: true,
    // 1 / (3 * ticksPerDay) at the default ticksPerDay (1800): rain about
    // once every 3 in-world days.
    rainRate: 1 / 5400,
    rainMoisture: 1.0,
    moistureDecay: 0.995,
    // Below this, moisture counts as "cleared" for the not-while-active
    // gate and for the growth-rate multiplier (SPEC §3.1 determinism —
    // a fixed, documented cutoff rather than an implicit `> 0`).
    moistureThreshold: 1e-3,
    // 1 / (6 * ticksPerDay) at the default ticksPerDay (1800): fog about
    // once every 6 in-world days.
    fogRate: 1 / 10800,
    fogTicks: 600,
    fogVision: 0.5,
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
  persist: Object.freeze({
    verifyOnResume: true,
    verifyReplayTicks: 2000,
    autosaveSeconds: 30,
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
    'interventions.fire.radius',
    {
      units: 'tiles',
      assumption: false,
      doc: 'Radius of the fire intervention: plants destroyed and organisms killed within it (SPEC §5.3).',
    },
  ],
  [
    'interventions.meteor.radius',
    {
      units: 'tiles',
      assumption: false,
      doc: 'Radius of the meteor intervention: terrain turned to rock, plants destroyed and organisms killed within it (SPEC §5.3).',
    },
  ],
  [
    'interventions.plague.radius',
    {
      units: 'tiles',
      assumption: false,
      doc: 'Radius of the plague intervention: living organisms within it are infected (SPEC §5.3).',
    },
  ],
  [
    'interventions.river.radius',
    {
      units: 'tiles',
      assumption: false,
      doc: 'Radius of the river intervention: terrain turned to water within it, standers displaced to the nearest land (SPEC §5.3).',
    },
  ],
  [
    'interventions.meadow.radius',
    {
      units: 'tiles',
      assumption: false,
      doc: 'Radius of the meadow intervention: non-water terrain turned to grass within it (SPEC §5.3).',
    },
  ],
  [
    'interventions.meadow.plants',
    {
      units: 'plant units [0,1]',
      assumption: false,
      doc: 'Minimum plant level set on each tile the meadow intervention touches; the created mass is counted as ledger.hand (SPEC §5.3).',
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
    'brain.weightScale',
    {
      units: 'multiplier',
      assumption: true,
      doc: 'Maps a weight gene in [0,1] to a weight in [-weightScale, weightScale] (SPEC §4.7).',
    },
  ],
  [
    'brain.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Selects the brain forward pass over the Phase 1 reflex policy (SPEC §9.1: mechanics are tested in isolation); wiring is P2-03.',
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
    'species.theta',
    {
      units: 'trait-block Euclidean distance',
      assumption: true,
      doc: 'A newborn founds a new species when its trait-block distance from its species centroid exceeds this (SPEC §4.9).',
    },
  ],
  [
    'species.centroidRate',
    {
      units: 'EMA weight',
      assumption: true,
      doc: "A species' centroid drifts toward a member that stays in it by this fraction per birth (SPEC §4.9): centroid += (traits - centroid) * centroidRate.",
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
    'pheromone.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for the 4 pheromone channels: decay, diffusion, emission and sensing (SPEC §9.1).',
    },
  ],
  [
    'pheromone.decay',
    {
      units: 'multiplier per tick, one per channel',
      assumption: true,
      doc: 'Per-tick decay multiplier for each of the 4 pheromone channels (SPEC §4.8).',
    },
  ],
  [
    'pheromone.diffusion',
    {
      units: 'rate toward the 4-neighbour mean, one per channel',
      assumption: true,
      doc: 'How much of the gap to the 4-neighbour mean each diffuse() step closes, per channel (SPEC §4.8).',
    },
  ],
  [
    'pheromone.diffuseEvery',
    {
      units: 'ticks',
      assumption: true,
      doc: 'How often diffuse() runs (SPEC §4.8, §6.3).',
    },
  ],
  [
    'pheromone.emitRate',
    {
      units: 'channel units per tick at output=1, gene=1',
      assumption: true,
      doc: 'Scales an organism emit output × its emit gene into channel deposit (SPEC §4.8).',
    },
  ],
  [
    'pheromone.senseGain',
    {
      units: 'multiplier',
      assumption: true,
      doc: 'Scales the ahead-minus-behind gradient × sense gene into the brain input, clamped to [-1, 1] (SPEC §4.8).',
    },
  ],
  [
    'disease.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for disease transmission, cost and lethality (SPEC §9.1).',
    },
  ],
  [
    'disease.contactRadius',
    {
      units: 'tiles',
      assumption: true,
      doc: 'Contact radius within which a sick organism can transmit disease to a healthy one (SPEC §4.9).',
    },
  ],
  [
    'disease.contactRate',
    {
      units: 'probability per tick at dist=0, resistance=0',
      assumption: true,
      doc: 'Base per-contact transmission chance (SPEC §4.9).',
    },
  ],
  [
    'disease.kinBias',
    {
      units: 'multiplier',
      assumption: true,
      doc: 'How much trait-block distance reduces transmission chance: p × max(0, 1 - kinBias × dist) (SPEC §4.9).',
    },
  ],
  [
    'disease.spontaneousRate',
    {
      units: 'probability per tick per healthy organism',
      assumption: true,
      doc: 'Chance a healthy organism falls sick with no contact, so outbreaks can start without the Hand of God (SPEC §4.9).',
    },
  ],
  [
    'disease.durationTicks',
    {
      units: 'ticks',
      assumption: true,
      doc: 'How long an infection lasts before recovery/death is decided (SPEC §4.9). Stored in a Uint16 field; clamp overrides to 65535.',
    },
  ],
  [
    'disease.costPerTick',
    {
      units: 'energy per tick at resistance=0',
      assumption: true,
      doc: 'Energy a sick organism pays each tick, scaled by (1 - resistance) (SPEC §4.9).',
    },
  ],
  [
    'disease.lethality',
    {
      units: 'probability at resistance=0',
      assumption: true,
      doc: "Chance of death when an infection's timer expires, scaled by (1 - resistance); otherwise recovery (SPEC §4.9).",
    },
  ],
  [
    'disease.outbreakThreshold',
    {
      units: 'count of sick members',
      assumption: true,
      doc: 'A species crossing this many simultaneously-sick members upward triggers a plague chronicle entry (SPEC §4.9, §4.11).',
    },
  ],
  [
    'disease.chronicleCooldown',
    {
      units: 'ticks',
      assumption: true,
      doc: 'Minimum ticks between plague chronicle entries for the same species (SPEC §4.11).',
    },
  ],
  [
    'regrowth.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for regrowth debt on overgrazed tiles (SPEC §9.1).',
    },
  ],
  [
    'regrowth.zeroThreshold',
    {
      units: 'plant fraction of cap',
      assumption: true,
      doc: 'Grazing a tile below this sets its regrowth debt (SPEC §4.9).',
    },
  ],
  [
    'regrowth.debtTicks',
    {
      units: 'ticks',
      assumption: true,
      doc: 'How long a tile regrows at the reduced rate after being grazed to zero (SPEC §4.9). Stored in a Uint16 field; clamp overrides to 65535.',
    },
  ],
  [
    'regrowth.debtFactor',
    {
      units: 'multiplier on the growth rate',
      assumption: true,
      doc: 'Growth rate multiplier while a tile is in regrowth debt (SPEC §4.9).',
    },
  ],
  [
    'famine.plantFraction',
    {
      units: 'fraction of total plant carrying capacity',
      assumption: true,
      doc: 'Global plants fraction below which a famine chronicle entry fires; re-arms above 2x this (SPEC §4.9).',
    },
  ],
  [
    'immigration.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for immigration when a diet class falls below its floor (SPEC §9.1).',
    },
  ],
  [
    'immigration.checkEvery',
    {
      units: 'ticks',
      assumption: true,
      doc: 'How often the herbivore/carnivore floor is checked (SPEC §4.9).',
    },
  ],
  [
    'immigration.floorHerbivores',
    {
      units: 'count',
      assumption: true,
      doc: 'Herbivore population floor; below this, a group immigrates (SPEC §4.9).',
    },
  ],
  [
    'immigration.floorCarnivores',
    {
      units: 'count',
      assumption: true,
      doc: 'Carnivore population floor; below this, a group immigrates (SPEC §4.9).',
    },
  ],
  [
    'immigration.cooldownTicks',
    {
      units: 'ticks',
      assumption: true,
      doc: 'Minimum ticks between immigration events for the same diet class (SPEC §4.9).',
    },
  ],
  [
    'immigration.groupSize',
    {
      units: 'count',
      assumption: true,
      doc: 'Number of organisms in one immigrating group (SPEC §4.9).',
    },
  ],
  [
    'temperature.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for ambient temperature and its metabolic cost (SPEC §9.1, §4.3).',
    },
  ],
  [
    'temperature.base',
    {
      units: 'unitless [0,1]',
      assumption: true,
      doc: 'Baseline ambient temperature target before the daylight and seasonal terms (SPEC §4.3); also `ambient`s initial value at genesis.',
    },
  ],
  [
    'temperature.dayGain',
    {
      units: 'multiplier on light L',
      assumption: true,
      doc: 'How much daylight L raises the ambient temperature target (SPEC §4.3).',
    },
  ],
  [
    'temperature.seasonAmp',
    {
      units: 'multiplier on seasonal offset [-1,1]',
      assumption: true,
      doc: "Amplitude of the seasonal swing in the ambient temperature target (SPEC §4.3), in phase with `dayFraction`'s `light.seasonOffset` (peak mid-summer, trough mid-winter).",
    },
  ],
  [
    'temperature.lag',
    {
      units: 'fraction of the target gap closed per tick',
      assumption: true,
      doc: 'Thermal-mass smoothing: how fast `ambient` chases its target each tick (SPEC §4.3) — small, so nights cool gradually rather than snapping to the target.',
    },
  ],
  [
    'temperature.costGain',
    {
      units: 'multiplier per unit of |prefTemp - ambient|',
      assumption: true,
      doc: "How much the gap between an organism's preferred temperature (the `prefTemp` gene) and `ambient` inflates its metabolic cost (SPEC §4.3).",
    },
  ],
  [
    'weather.enabled',
    {
      units: 'boolean',
      assumption: false,
      doc: 'Master switch for rain and fog weather events (SPEC §9.1, §4.3).',
    },
  ],
  [
    'weather.rainRate',
    {
      units: 'probability per tick',
      assumption: true,
      doc: 'Chance each tick of a new rain event starting, rolled once per tick (SPEC §4.3); only rolled while no rain is already active.',
    },
  ],
  [
    'weather.rainMoisture',
    {
      units: 'unitless (moisture pulse)',
      assumption: true,
      doc: '`world.moisture` set by a rain event (SPEC §4.3); plant growth `base` is multiplied by `(1 + moisture)` while it is elevated.',
    },
  ],
  [
    'weather.moistureDecay',
    {
      units: 'fraction retained per tick',
      assumption: true,
      doc: '`world.moisture *= moistureDecay` every tick (SPEC §4.3), so a rain pulse fades out gradually rather than ending abruptly.',
    },
  ],
  [
    'weather.moistureThreshold',
    {
      units: 'unitless (moisture)',
      assumption: true,
      doc: 'Below this, `world.moisture` counts as cleared: it snaps to 0 and a new rain event may roll again (SPEC §3.1 determinism — a fixed, documented cutoff for "no longer active").',
    },
  ],
  [
    'weather.fogRate',
    {
      units: 'probability per tick',
      assumption: true,
      doc: 'Chance each tick of a new fog event starting, rolled once per tick (SPEC §4.3); only rolled while no fog is already active.',
    },
  ],
  [
    'weather.fogTicks',
    {
      units: 'ticks',
      assumption: true,
      doc: '`world.fogTicks` set by a fog event (SPEC §4.3); counts down to 0, one per tick, while fog is active.',
    },
  ],
  [
    'weather.fogVision',
    {
      units: 'multiplier on vision range',
      assumption: true,
      doc: 'Every vision range is multiplied by this while `world.fogTicks > 0` (SPEC §4.3).',
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
  [
    'persist.verifyOnResume',
    {
      units: 'boolean',
      assumption: true,
      doc: 'Whether resuming from an auto-saved state runs a bounded background replay from the last checkpoint to verify the restored hash (SPEC §5.6, Decisions §12.4).',
    },
  ],
  [
    'persist.verifyReplayTicks',
    {
      units: 'ticks',
      assumption: true,
      doc: 'Interval at which the scheduler refreshes its in-memory verification checkpoint, and the maximum number of ticks a resume-verification replay ever spends (SPEC §5.6, Decisions §12.4).',
    },
  ],
  [
    'persist.autosaveSeconds',
    {
      units: 'seconds',
      assumption: true,
      doc: 'How often the auto-save writes seed + log + state to IndexedDB, in addition to on visibilitychange (SPEC §5.6).',
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
  brainPrior: [
    "'seeded' | 'random'",
    "'seeded' initialises founder brain weights from brain.writePrior plus noise; 'random' draws each weight gene uniformly (SPEC §4.7).",
  ],
  brainNoise: [
    'sd of gene value',
    "Standard deviation of each founder's per-weight-gene noise around the seeded prior (only used when brainPrior = 'seeded').",
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

/**
 * Two flattened leaf values are equal: arrays element-wise, everything
 * else by `===` (SPEC §5.6: a config diff/share link never carries more
 * than the keys a user actually changed).
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function leafEquals(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  return a === b;
}

/**
 * A flat, dotted-key object of every leaf in `cfg` whose value differs
 * from `DEFAULTS` (SPEC §5.6: save records and share links carry only
 * this diff, never the full config). Arrays are compared element-wise
 * and, when different, included whole (never merged element-wise, to
 * match `makeConfig`'s own array-is-a-leaf semantics).
 * @param {Object} cfg a `makeConfig()` result (or any config-shaped object)
 * @returns {Record<string, *>}
 */
export function diffConfig(cfg) {
  const defaults = flatten(DEFAULTS);
  const current = flatten(cfg);
  /** @type {Record<string, *>} */
  const diff = {};
  for (const [key, value] of current) {
    if (!leafEquals(defaults.get(key), value)) {
      diff[key] = value;
    }
  }
  return diff;
}

/**
 * Set a dotted path on a plain object, creating intermediate objects.
 * @param {Record<string, *>} obj
 * @param {string} path
 * @param {*} value
 * @returns {void}
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
 * The inverse of `diffConfig`: turn a flat, dotted-key diff back into a
 * full `makeConfig()` result by nesting it into an overrides tree first
 * (`makeConfig` merges nested overrides onto `DEFAULTS`, not dotted keys).
 * @param {Record<string, *>} diff
 * @returns {typeof DEFAULTS}
 */
export function applyDiff(diff) {
  /** @type {Record<string, *>} */
  const overrides = {};
  for (const key of Object.keys(diff)) {
    setPath(overrides, key, diff[key]);
  }
  return makeConfig(overrides);
}
