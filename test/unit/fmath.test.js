import { describe, it, expect } from 'vitest';
import * as fmath from '../../src/core/fmath.js';

function sample(lo, hi, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(lo + ((hi - lo) * i) / (n - 1));
  }
  return out;
}

describe('fmath.sin / fmath.cos', () => {
  it('are within 1e-6 of Math.sin/cos on [-8π, 8π]', () => {
    for (const x of sample(-8 * Math.PI, 8 * Math.PI, 4001)) {
      expect(Math.abs(fmath.sin(x) - Math.sin(x))).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(fmath.cos(x) - Math.cos(x))).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('fmath.exp', () => {
  it('is within 1e-6 relative of Math.exp on [-20, 20]', () => {
    for (const x of sample(-20, 20, 4001)) {
      const expected = Math.exp(x);
      const actual = fmath.exp(x);
      const relError = Math.abs(actual - expected) / Math.max(1e-300, Math.abs(expected));
      expect(relError).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('fmath.tanh', () => {
  it('is within 1e-6 of Math.tanh on [-10, 10]', () => {
    for (const x of sample(-10, 10, 4001)) {
      expect(Math.abs(fmath.tanh(x) - Math.tanh(x))).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('fmath.atan2', () => {
  it('is within 1e-6 of Math.atan2 on the unit circle and axes', () => {
    for (let i = 0; i < 3600; i++) {
      const theta = (i / 3600) * 2 * Math.PI - Math.PI;
      const x = Math.cos(theta);
      const y = Math.sin(theta);
      expect(Math.abs(fmath.atan2(y, x) - Math.atan2(y, x))).toBeLessThanOrEqual(1e-6);
    }
    const axisCases = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 0],
    ];
    for (const [y, x] of axisCases) {
      expect(Math.abs(fmath.atan2(y, x) - Math.atan2(y, x))).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('fmath.log', () => {
  it('is within 1e-6 relative of Math.log on [1e-6, 1e6]', () => {
    const points = [];
    for (let i = 0; i <= 4000; i++) {
      const logLo = Math.log(1e-6);
      const logHi = Math.log(1e6);
      points.push(Math.exp(logLo + ((logHi - logLo) * i) / 4000));
    }
    for (const x of points) {
      const expected = Math.log(x);
      const actual = fmath.log(x);
      const relError = Math.abs(actual - expected) / Math.max(1e-300, Math.abs(expected));
      expect(relError).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('fmath.wrapAngle', () => {
  it('maps into (-π, π]', () => {
    const cases = [
      0,
      Math.PI,
      -Math.PI,
      2 * Math.PI,
      -2 * Math.PI,
      3.5 * Math.PI,
      -3.5 * Math.PI,
      10,
      -10,
    ];
    for (const a of cases) {
      const w = fmath.wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-9);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
      // sin/cos of the wrapped angle must match the original angle.
      expect(Math.abs(fmath.sin(w) - fmath.sin(a))).toBeLessThan(1e-5);
      expect(Math.abs(fmath.cos(w) - fmath.cos(a))).toBeLessThan(1e-5);
    }
  });
});

describe('fmath.clamp / fmath.lerp', () => {
  it('clamp bounds a value to [lo, hi]', () => {
    expect(fmath.clamp(5, 0, 1)).toBe(1);
    expect(fmath.clamp(-5, 0, 1)).toBe(0);
    expect(fmath.clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('lerp interpolates linearly', () => {
    expect(fmath.lerp(0, 10, 0)).toBe(0);
    expect(fmath.lerp(0, 10, 1)).toBe(10);
    expect(fmath.lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('fmath.TAU', () => {
  it('equals 2π', () => {
    expect(fmath.TAU).toBeCloseTo(2 * Math.PI, 12);
  });
});
