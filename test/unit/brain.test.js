import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { genomeLength, BRAIN_INPUTS, BRAIN_OUTPUTS } from '../../src/core/genome.js';
import { forward, getW1, setW1, getW2, setW2, writePrior } from '../../src/core/brain.js';
import { INPUT } from '../../src/core/senses.js';
import { OUTPUT } from '../../src/core/reflex.js';

const cfg = makeConfig({ brain: { hidden: 4 } });

/**
 * A zeroed genome of the right length, weight genes all at 0.5 (i.e.
 * every weight is 0 before any explicit setW1/setW2 calls).
 * @param {typeof import('../../src/core/config.js').DEFAULTS} c
 * @returns {Float32Array}
 */
function neutralGenome(c) {
  return new Float32Array(genomeLength(c)).fill(0.5);
}

describe('brain.forward', () => {
  it('a hand-computed toy network (two non-zero inputs, one hidden unit, one output) matches within 1e-6', () => {
    const c = makeConfig({ brain: { hidden: 1, weightScale: 2.0 } });
    const genome = neutralGenome(c);
    setW1(genome, 0, c, 2, 0, 0.5); // input 2 -> hidden 0
    setW1(genome, 0, c, 5, 0, -0.3); // input 5 -> hidden 0
    setW2(genome, 0, c, 0, 3, 0.8); // hidden 0 -> output 3
    setW2(genome, 0, c, 1, 3, 0.2); // bias row (k = hidden = 1) -> output 3

    const inputs = new Float32Array(BRAIN_INPUTS);
    inputs[2] = 0.6;
    inputs[5] = -0.4;
    const outputs = new Float32Array(BRAIN_OUTPUTS);
    const hidden = new Float32Array(c.brain.hidden);

    forward(c, genome, 0, inputs, 0, outputs, 0, hidden);

    const h0 = Math.tanh(0.5 * 0.6 + -0.3 * -0.4);
    const z3 = 0.8 * h0 + 0.2;
    const expected3 = 1 / (1 + Math.exp(-z3));
    expect(outputs[3]).toBeCloseTo(expected3, 6);
  });

  it('all-0.5 genes give zero weights: turn 0, others 0.5', () => {
    const genome = neutralGenome(cfg);
    const inputs = new Float32Array(BRAIN_INPUTS).fill(1); // non-zero inputs, but weights are all 0
    const outputs = new Float32Array(BRAIN_OUTPUTS);
    const hidden = new Float32Array(cfg.brain.hidden);

    forward(cfg, genome, 0, inputs, 0, outputs, 0, hidden);

    expect(outputs[0]).toBeCloseTo(0, 6); // turn
    for (let j = 1; j < BRAIN_OUTPUTS; j++) {
      expect(outputs[j]).toBeCloseTo(0.5, 6);
    }
  });

  it('the output bias row shifts outputs without inputs', () => {
    const genome = neutralGenome(cfg);
    setW2(genome, 0, cfg, cfg.brain.hidden, 4, 1.5); // bias for output 4
    const inputs = new Float32Array(BRAIN_INPUTS); // all zero
    const outputs = new Float32Array(BRAIN_OUTPUTS);
    const hidden = new Float32Array(cfg.brain.hidden);

    forward(cfg, genome, 0, inputs, 0, outputs, 0, hidden);

    expect(outputs[4]).toBeCloseTo(1 / (1 + Math.exp(-1.5)), 6);
    expect(outputs[4]).not.toBeCloseTo(0.5, 3);
  });

  it('weight accessors round-trip through the SoA layout', () => {
    const genome = neutralGenome(cfg);
    setW1(genome, 0, cfg, 0, 0, 1.234);
    setW1(genome, 0, cfg, 16, 3, -1.9);
    setW2(genome, 0, cfg, 2, 7, 0.5);
    setW2(genome, 0, cfg, cfg.brain.hidden, 0, -2.0);

    expect(getW1(genome, 0, cfg, 0, 0)).toBeCloseTo(1.234, 3);
    expect(getW1(genome, 0, cfg, 16, 3)).toBeCloseTo(-1.9, 3);
    expect(getW2(genome, 0, cfg, 2, 7)).toBeCloseTo(0.5, 3);
    expect(getW2(genome, 0, cfg, cfg.brain.hidden, 0)).toBeCloseTo(-2.0, 3);

    // Untouched weights stay at 0 (gene 0.5).
    expect(getW1(genome, 0, cfg, 1, 1)).toBeCloseTo(0, 6);
  });

  it('forward allocates nothing (same scratch buffers, heap check over 100k calls < 1 MB)', () => {
    if (!global.gc) throw new Error('run with --expose-gc');
    const genome = neutralGenome(cfg);
    const inputs = new Float32Array(BRAIN_INPUTS).fill(0.3);
    const outputs = new Float32Array(BRAIN_OUTPUTS);
    const hidden = new Float32Array(cfg.brain.hidden);

    for (let i = 0; i < 1000; i++) forward(cfg, genome, 0, inputs, 0, outputs, 0, hidden);
    global.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 100000; i++) forward(cfg, genome, 0, inputs, 0, outputs, 0, hidden);
    global.gc();
    const after = process.memoryUsage().heapUsed;
    expect(after - before).toBeLessThan(1024 * 1024);
  });
});

describe('writePrior', () => {
  it('a prior brain turns toward food, away from a threat ahead, and eats when hungry on food', () => {
    const c = makeConfig({ brain: { hidden: 6 } });
    const genome = new Float32Array(genomeLength(c));
    writePrior(genome, 0, c);
    const hidden = new Float32Array(c.brain.hidden);
    const outputs = new Float32Array(BRAIN_OUTPUTS);

    // Food sensed, no threat, not hungry: turns toward it (turn > 0).
    let inputs = new Float32Array(BRAIN_INPUTS);
    inputs[INPUT.foodSin] = 1;
    forward(c, genome, 0, inputs, 0, outputs, 0, hidden);
    expect(outputs[OUTPUT.turn]).toBeGreaterThan(0);

    // A threat sensed close and ahead: turns away (turn < 0), opposite
    // sign from the food-only case above.
    inputs = new Float32Array(BRAIN_INPUTS);
    inputs[INPUT.threatSin] = 1;
    inputs[INPUT.threatProx] = 1;
    forward(c, genome, 0, inputs, 0, outputs, 0, hidden);
    expect(outputs[OUTPUT.turn]).toBeLessThan(0);

    // Hungry, on food: eats (eat > 0.5).
    inputs = new Float32Array(BRAIN_INPUTS);
    inputs[INPUT.hunger] = 1;
    inputs[INPUT.foodMag] = 1;
    forward(c, genome, 0, inputs, 0, outputs, 0, hidden);
    expect(outputs[OUTPUT.eat]).toBeGreaterThan(0.5);
  });
});
