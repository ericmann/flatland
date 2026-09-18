/**
 * The feed-forward brain (SPEC §4.7): one hidden layer, evaluated from an
 * organism's genome weight block into its output vector. Allocation-free
 * (SPEC §3.5): callers pass every buffer, including the hidden-layer
 * scratch (`world.hidden`).
 *
 * Determinism (SPEC §3.1): `fmath.tanh/exp` only; fixed loop order; no
 * allocation, no randomness.
 */
import { tanh, exp } from './fmath.js';
import { TRAIT_COUNT, BRAIN_INPUTS, BRAIN_OUTPUTS } from './genome.js';
import { INPUT } from './senses.js';

/**
 * `reflex.js`'s `OUTPUT` indices, duplicated locally (same reason
 * `ecology.js` duplicates `OUTPUT.eat`: avoids an import cycle through
 * reflex.js, which will import `brain.js` once P2-03 wires the forward
 * pass into the policy switch).
 */
const OUTPUT_TURN = 0;
const OUTPUT_THROTTLE = 1;
const OUTPUT_EAT = 2;
const OUTPUT_EMIT0 = 3;
const OUTPUT_EMIT1 = 4;
const OUTPUT_EMIT2 = 5;
const OUTPUT_EMIT3 = 6;
const OUTPUT_BREED = 7;

/**
 * @param {number} z
 * @returns {number}
 */
function sigmoid(z) {
  return 1 / (1 + exp(-z));
}

/**
 * Weight-block layout (SPEC §4.7, from `genome.js`): the trait block
 * (`TRAIT_COUNT` genes) is followed by `W1[i][k]` for input `i`, hidden
 * `k`, then `W2[k][j]` for `k` in `[0, hidden]` (`k = hidden` is the
 * output bias row), output `j`.
 * @param {number} hidden
 * @param {number} i
 * @param {number} k
 * @returns {number}
 */
function w1Index(hidden, i, k) {
  return TRAIT_COUNT + i * hidden + k;
}

/**
 * @param {number} hidden
 * @param {number} k
 * @param {number} j
 * @returns {number}
 */
function w2Index(hidden, k, j) {
  return TRAIT_COUNT + BRAIN_INPUTS * hidden + k * BRAIN_OUTPUTS + j;
}

/**
 * Map a weight gene in [0,1] to a weight in [-weightScale, weightScale].
 * @param {number} g
 * @param {number} weightScale
 * @returns {number}
 */
function geneToWeight(g, weightScale) {
  return (g - 0.5) * 2 * weightScale;
}

/**
 * @param {number} w
 * @param {number} weightScale
 * @returns {number} a gene in [0,1]
 */
function weightToGene(w, weightScale) {
  return w / (2 * weightScale) + 0.5;
}

/**
 * @param {Float32Array} genome
 * @param {number} off genome start index (`slot * genomeLength`)
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @param {number} i input index `[0, BRAIN_INPUTS)`
 * @param {number} k hidden index `[0, cfg.brain.hidden)`
 * @returns {number}
 */
export function getW1(genome, off, cfg, i, k) {
  return geneToWeight(genome[off + w1Index(cfg.brain.hidden, i, k)], cfg.brain.weightScale);
}

/**
 * @param {Float32Array} genome
 * @param {number} off
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @param {number} i
 * @param {number} k
 * @param {number} w
 * @returns {void}
 */
export function setW1(genome, off, cfg, i, k, w) {
  genome[off + w1Index(cfg.brain.hidden, i, k)] = weightToGene(w, cfg.brain.weightScale);
}

/**
 * @param {Float32Array} genome
 * @param {number} off
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @param {number} k hidden index `[0, cfg.brain.hidden]` (`hidden` = the output bias row)
 * @param {number} j output index `[0, BRAIN_OUTPUTS)`
 * @returns {number}
 */
export function getW2(genome, off, cfg, k, j) {
  return geneToWeight(genome[off + w2Index(cfg.brain.hidden, k, j)], cfg.brain.weightScale);
}

/**
 * @param {Float32Array} genome
 * @param {number} off
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @param {number} k
 * @param {number} j
 * @param {number} w
 * @returns {void}
 */
export function setW2(genome, off, cfg, k, j, w) {
  genome[off + w2Index(cfg.brain.hidden, k, j)] = weightToGene(w, cfg.brain.weightScale);
}

/**
 * Evaluate the brain: `h_k = tanh(sum_i W1[i][k] * in_i)`,
 * `z_j = sum_k W2[k][j] * h_k + W2[hidden][j]`, `turn = tanh(z)`, every
 * other output `= sigmoid(z)` (SPEC §4.7).
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @param {Float32Array} genome
 * @param {number} gOff genome start index for this organism
 * @param {Float32Array} inputs
 * @param {number} inOff
 * @param {Float32Array} outputs
 * @param {number} outOff
 * @param {Float32Array} hidden scratch, length `cfg.brain.hidden` (e.g. `world.hidden`)
 * @returns {void}
 */
export function forward(cfg, genome, gOff, inputs, inOff, outputs, outOff, hidden) {
  const nHidden = cfg.brain.hidden;

  for (let k = 0; k < nHidden; k++) {
    let sum = 0;
    for (let i = 0; i < BRAIN_INPUTS; i++) {
      sum += getW1(genome, gOff, cfg, i, k) * inputs[inOff + i];
    }
    hidden[k] = tanh(sum);
  }

  for (let j = 0; j < BRAIN_OUTPUTS; j++) {
    let sum = getW2(genome, gOff, cfg, nHidden, j); // bias row
    for (let k = 0; k < nHidden; k++) {
      sum += getW2(genome, gOff, cfg, k, j) * hidden[k];
    }
    outputs[outOff + j] = j === OUTPUT_TURN ? tanh(sum) : sigmoid(sum);
  }
}

/** Hidden units 0-5's input mapping and weight for the seeded prior (SPEC §4.7). */
const PRIOR_INPUT_FOR_HIDDEN = [
  INPUT.foodSin,
  INPUT.threatSin,
  INPUT.threatProx,
  INPUT.hunger,
  INPUT.threatCos,
  INPUT.foodMag,
];
const PRIOR_WEIGHT_FOR_HIDDEN = [2, 3, 3, 2, 2, 2];

/**
 * Write the seeded reflex prior into a genome's weight block (SPEC §4.7,
 * §1.1: "no hand-authored behaviour beyond bootstrap reflexes" — this is
 * that bootstrap, expressed as weights). Every weight gene is written
 * (zeroed first, so the result is fully determined regardless of the
 * genome's prior contents). If `cfg.brain.hidden < 6`, only the hidden
 * units that exist get an input mapping / contribute to the outputs
 * below.
 * @param {Float32Array} genome
 * @param {number} off
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {void}
 */
export function writePrior(genome, off, cfg) {
  const hidden = cfg.brain.hidden;

  for (let i = 0; i < BRAIN_INPUTS; i++) {
    for (let k = 0; k < hidden; k++) setW1(genome, off, cfg, i, k, 0);
  }
  for (let k = 0; k <= hidden; k++) {
    for (let j = 0; j < BRAIN_OUTPUTS; j++) setW2(genome, off, cfg, k, j, 0);
  }

  const nMapped = Math.min(hidden, PRIOR_INPUT_FOR_HIDDEN.length);
  for (let h = 0; h < nMapped; h++) {
    setW1(genome, off, cfg, PRIOR_INPUT_FOR_HIDDEN[h], h, PRIOR_WEIGHT_FOR_HIDDEN[h]);
  }

  /**
   * @param {number} h
   * @param {number} j
   * @param {number} w
   */
  const w2 = (h, j, w) => {
    if (h < nMapped) setW2(genome, off, cfg, h, j, w);
  };

  w2(0, OUTPUT_TURN, 1.5);
  w2(1, OUTPUT_TURN, -2.0);
  w2(4, OUTPUT_TURN, -1.0);

  w2(2, OUTPUT_THROTTLE, 2.0);
  w2(3, OUTPUT_THROTTLE, 1.0);
  w2(5, OUTPUT_THROTTLE, -0.5);
  setW2(genome, off, cfg, hidden, OUTPUT_THROTTLE, -0.5);

  w2(3, OUTPUT_EAT, 2.0);
  w2(5, OUTPUT_EAT, 1.5);
  setW2(genome, off, cfg, hidden, OUTPUT_EAT, -0.5);

  setW2(genome, off, cfg, hidden, OUTPUT_BREED, 2.0);
  setW2(genome, off, cfg, hidden, OUTPUT_EMIT0, -2.0);
  setW2(genome, off, cfg, hidden, OUTPUT_EMIT1, -2.0);
  setW2(genome, off, cfg, hidden, OUTPUT_EMIT2, -2.0);
  setW2(genome, off, cfg, hidden, OUTPUT_EMIT3, -2.0);
}
