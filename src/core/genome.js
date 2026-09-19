/**
 * Genome layout, trait -> phenotype mapping, mutation and trait-block
 * distance (SPEC §4.6). No brain evaluation (P2-02) here.
 *
 * Determinism (SPEC §3.1): every export except `mutate` is a pure
 * function of its arguments; `mutate` consumes `world.rng` (passed in,
 * never touched globally) in gene-index order.
 */
import { TRAIT_COUNT } from './organisms.js';
import { clamp } from './fmath.js';

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
 * Mutate one organism's whole genome (trait block plus brain weights) in
 * place, in gene-index order (SPEC §4.6): for each gene, independently, a
 * small step (`chance(pMut)` -> `+= gaussian() x sigma`) and a large step
 * (`chance(pBig)` -> `+= gaussian() x 4*sigma`), clamped to [0,1]. The hue
 * gene's sigma is scaled by `genome.hueScale` so hue drifts slower than
 * other traits.
 * @param {import('./rng.js').Rng} rng
 * @param {Float32Array} genome
 * @param {number} offset the genome's start index (`slot * genomeLength`)
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @param {{ forceBig?: boolean }} [opts] `forceBig` (immigration, P3-06)
 *   applies the large step unconditionally, skipping the `chance(pBig)`
 *   draw entirely.
 * @returns {void}
 */
export function mutate(rng, genome, offset, cfg, opts = {}) {
  const len = genomeLength(cfg);
  const sigma = cfg.genome.sigmaMut;
  const pMut = cfg.genome.pMut;
  const pBig = cfg.genome.pBig;
  const hueScale = cfg.genome.hueScale;

  for (let k = 0; k < len; k++) {
    const sd = k === TRAIT.hue ? sigma * hueScale : sigma;
    let g = genome[offset + k];
    if (rng.chance(pMut)) {
      g += rng.gaussian() * sd;
    }
    if (opts.forceBig || rng.chance(pBig)) {
      g += rng.gaussian() * sd * 4;
    }
    genome[offset + k] = clamp(g, 0, 1);
  }
}

/**
 * Per-gene uniform crossover of two parent genomes into a third (output)
 * offset (SPEC §4.6, Decisions §12.1, P5-04): for each gene, in gene-index
 * order, `rng.chance(0.5)` picks parent A's gene or parent B's gene. The
 * output offset may safely equal `aOff` or `bOff` since each gene is read
 * from both sources before being written (a single assignment per index,
 * no in-place aliasing hazard). Callers `mutate` the result exactly as
 * asexual reproduction already does.
 * @param {import('./rng.js').Rng} rng
 * @param {Float32Array} genome
 * @param {number} aOff parent A's genome start index
 * @param {number} bOff parent B's genome start index
 * @param {number} outOff output genome start index
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {void}
 */
export function crossover(rng, genome, aOff, bOff, outOff, cfg) {
  const len = genomeLength(cfg);
  for (let k = 0; k < len; k++) {
    const g = rng.chance(0.5) ? genome[aOff + k] : genome[bOff + k];
    genome[outOff + k] = g;
  }
}

/** Euclidean trait-block distance if every trait gene differed maximally. */
export const MAX_TRAIT_DISTANCE = Math.sqrt(TRAIT_COUNT);

/**
 * Euclidean distance between two genomes' trait blocks only (SPEC §4.6:
 * the brain weight block is excluded).
 * @param {Float32Array} genome
 * @param {number} aOff
 * @param {number} bOff
 * @returns {number}
 */
export function distance(genome, aOff, bOff) {
  let sum = 0;
  for (let t = 0; t < TRAIT_COUNT; t++) {
    const d = genome[aOff + t] - genome[bOff + t];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Like `distance`, but against a trait block stored in a separate array
 * (e.g. a species' running centroid, P2-04) rather than another slot in
 * the same genome array.
 * @param {Float32Array} genome
 * @param {number} off
 * @param {Float32Array} centroid
 * @param {number} cOff
 * @returns {number}
 */
export function distanceTo(genome, off, centroid, cOff) {
  let sum = 0;
  for (let t = 0; t < TRAIT_COUNT; t++) {
    const d = genome[off + t] - centroid[cOff + t];
    sum += d * d;
  }
  return Math.sqrt(sum);
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
