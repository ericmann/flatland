import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng.js';
import { makeNoise, fbm } from '../../src/core/noise.js';

describe('makeNoise', () => {
  it('same seed gives the same field', () => {
    const a = makeNoise(new Rng(5), 16);
    const b = makeNoise(new Rng(5), 16);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        expect(a.at(x / 3, y / 3)).toBe(b.at(x / 3, y / 3));
      }
    }
  });

  it('different seeds give different fields', () => {
    const a = makeNoise(new Rng(1), 16);
    const b = makeNoise(new Rng(2), 16);
    let differs = false;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (a.at(x / 3, y / 3) !== b.at(x / 3, y / 3)) differs = true;
      }
    }
    expect(differs).toBe(true);
  });

  it('values are within [0,1]', () => {
    const n = makeNoise(new Rng(9), 16);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const v = n.at(x / 7, y / 7);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('neighbouring samples differ by less than 0.2 at scale 22', () => {
    const n = makeNoise(new Rng(3), 16);
    const scale = 22;
    let maxDiff = 0;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const v0 = n.at(x / scale, y / scale);
        const v1 = n.at((x + 1) / scale, y / scale);
        maxDiff = Math.max(maxDiff, Math.abs(v1 - v0));
      }
    }
    expect(maxDiff).toBeLessThan(0.2);
  });

  it('wraps at the lattice edge instead of reading out of bounds', () => {
    const n = makeNoise(new Rng(4), 8);
    // Sampling just past the lattice size should be finite and consistent
    // with wrapping (no NaN, no exception).
    const v = n.at(7.999, 7.999);
    expect(Number.isFinite(v)).toBe(true);
    const wrapped = n.at(-0.001, -0.001);
    expect(Number.isFinite(wrapped)).toBe(true);
  });

  it('returns Float32-rounded values', () => {
    const n = makeNoise(new Rng(6), 16);
    const v = n.at(1.3, 2.7);
    expect(Math.fround(v)).toBe(v);
  });
});

describe('fbm', () => {
  it('with one layer equals that layer', () => {
    const noise = makeNoise(new Rng(11), 16);
    const layers = [{ noise, scale: 22, weight: 1 }];
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        expect(fbm(layers, x, y)).toBe(noise.at(x / 22, y / 22));
      }
    }
  });

  it('sums weighted layers', () => {
    const a = makeNoise(new Rng(1), 16);
    const b = makeNoise(new Rng(2), 32);
    const layers = [
      { noise: a, scale: 22, weight: 0.6 },
      { noise: b, scale: 9, weight: 0.4 },
    ];
    const x = 12.5;
    const y = 7.25;
    const expected = Math.fround(0.6 * a.at(x / 22, y / 22) + 0.4 * b.at(x / 9, y / 9));
    expect(fbm(layers, x, y)).toBeCloseTo(expected, 5);
  });
});
