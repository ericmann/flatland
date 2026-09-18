/**
 * Genome layout and trait -> phenotype mapping (SPEC §4.6). No mutation
 * (P2-01), no distance (P2-01) and no brain evaluation (P2-02) here.
 *
 * Determinism (SPEC §3.1): every export is a pure function of its
 * arguments; nothing here touches randomness.
 */
import { TRAIT_COUNT } from './organisms.js';

export { TRAIT_COUNT };

/** Trait gene index, in the fixed order SPEC §4.6 lists them. */
export const TRAIT = Object.freeze({
  size: 0,
  speed: 1,
  diet: 2,
  visionPeak: 3,
  visionWidth: 4,
  visionRange: 5,
  metabolism: 6,
  lifespan: 7,
  maturity: 8,
  breedThreshold: 9,
  boldness: 10,
  sociality: 11,
  prefTemp: 12,
  swim: 13,
  resistance: 14,
  hue: 15,
  emit0: 16,
  emit1: 17,
  emit2: 18,
  emit3: 19,
  sense0: 20,
  sense1: 21,
  sense2: 22,
  sense3: 23,
});

/** Trait name by index; also the key into `cfg.phenotype`. */
export const TRAIT_NAMES = Object.freeze([
  'size',
  'speed',
  'diet',
  'visionPeak',
  'visionWidth',
  'visionRange',
  'metabolism',
  'lifespan',
  'maturity',
  'breedThreshold',
  'boldness',
  'sociality',
  'prefTemp',
  'swim',
  'resistance',
  'hue',
  'emit0',
  'emit1',
  'emit2',
  'emit3',
  'sense0',
  'sense1',
  'sense2',
  'sense3',
]);

/** Brain input count (SPEC §4.7: 16 signals + bias). Layout constant, not config. */
export const BRAIN_INPUTS = 17;
/** Brain output count (SPEC §4.7). Layout constant, not config. */
export const BRAIN_OUTPUTS = 8;

/**
 * Number of genes in the brain weight block: one weight per (input,
 * hidden) pair, plus one per (hidden-or-bias, output) pair.
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {number}
 */
export function weightCount(cfg) {
  const hidden = cfg.brain.hidden;
  return BRAIN_INPUTS * hidden + (hidden + 1) * BRAIN_OUTPUTS;
}

/**
 * Total genome length: the trait block plus the brain weight block.
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {number}
 */
export function genomeLength(cfg) {
  return TRAIT_COUNT + weightCount(cfg);
}

/**
 * Map a gene value in [0,1] to its phenotype range for a trait.
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @param {number} gene
 * @param {number} trait a TRAIT index
 * @returns {number}
 */
export function traitValue(cfg, gene, trait) {
  /** @type {Record<string, readonly number[]>} */
  const phenotype = cfg.phenotype;
  const [lo, hi] = phenotype[TRAIT_NAMES[trait]];
  return lo + gene * (hi - lo);
}

/**
 * Diet class from the diet axis (SPEC §5.2): herbivore below 0.35,
 * carnivore above 0.65, omnivore between (inclusive of both boundaries).
 * @param {number} d
 * @returns {'herbivore'|'omnivore'|'carnivore'}
 */
export function dietClass(d) {
  if (d < 0.35) return 'herbivore';
  if (d > 0.65) return 'carnivore';
  return 'omnivore';
}

/**
 * Vision class from the vision-peak trait (SPEC §5.2): nocturnal below
 * 0.35, crepuscular through 0.7 (inclusive), diurnal above.
 * @param {number} lambda
 * @returns {'nocturnal'|'crepuscular'|'diurnal'}
 */
export function visionClass(lambda) {
  if (lambda < 0.35) return 'nocturnal';
  if (lambda <= 0.7) return 'crepuscular';
  return 'diurnal';
}

/**
 * Fill `store.pheno` and the derived per-slot arrays for `slot` from its
 * current genome (SPEC §4.5, §4.6). Called at genesis and at birth, after
 * the genome itself has been written.
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @param {import('./organisms.js').OrganismStore} store
 * @param {number} slot
 * @returns {void}
 */
export function applyPhenotype(cfg, store, slot) {
  const gOff = slot * store.genomeLength;
  const pOff = slot * TRAIT_COUNT;

  for (let t = 0; t < TRAIT_COUNT; t++) {
    store.pheno[pOff + t] = traitValue(cfg, store.genome[gOff + t], t);
  }

  const size = store.pheno[pOff + TRAIT.size];
  const lifespanDays = store.pheno[pOff + TRAIT.lifespan];
  const maturityFrac = store.pheno[pOff + TRAIT.maturity];
  const breedFrac = store.pheno[pOff + TRAIT.breedThreshold];

  const energyMax = cfg.organisms.energyMaxBase * (0.5 + size);
  store.energyMax[slot] = energyMax;
  store.body[slot] = cfg.organisms.bodyMassPerSize * size;

  const lifespanTicks = lifespanDays * cfg.time.ticksPerDay;
  store.lifespanTicks[slot] = lifespanTicks;
  store.maturityTicks[slot] = maturityFrac * lifespanTicks;
  store.breedEnergy[slot] = breedFrac * energyMax;
}
