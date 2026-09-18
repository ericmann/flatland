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

/** `reflex.js`'s `OUTPUT.turn` index, duplicated locally (same reason `ecology.js` duplicates `OUTPUT.eat`: avoids an import cycle through reflex.js). */
const OUTPUT_TURN = 0;

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
