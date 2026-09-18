import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng.js';

describe('Rng', () => {
  it('same seed gives the same sequence', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds differ', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('float is in [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) covers 0..n-1 and nothing else', () => {
    const r = new Rng(9);
    const seen = new Set();
    for (let i = 0; i < 5000; i++) {
      const v = r.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('gaussian has mean ≈ 0 and sd ≈ 1 over 100k samples', () => {
    const r = new Rng(42);
    const n = 100000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = r.gaussian();
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(mean).toBeGreaterThan(-0.05);
    expect(mean).toBeLessThan(0.05);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.9);
    expect(Math.sqrt(variance)).toBeLessThan(1.1);
  });

  it('state can be saved and restored mid-sequence', () => {
    const r = new Rng(555);
    r.next();
    r.next();
    r.next();
    const savedState = r.state;
    const continued = Array.from({ length: 10 }, () => r.next());

    const restored = new Rng(0);
    restored.state = savedState;
    const replayed = Array.from({ length: 10 }, () => restored.next());

    expect(replayed).toEqual(continued);
  });

  it('chance(0) is always false and chance(1) is always true', () => {
    const r = new Rng(3);
    for (let i = 0; i < 1000; i++) {
      expect(r.chance(0)).toBe(false);
    }
    for (let i = 0; i < 1000; i++) {
      expect(r.chance(1)).toBe(true);
    }
  });

  it('range(lo, hi) stays within bounds', () => {
    const r = new Rng(11);
    for (let i = 0; i < 5000; i++) {
      const v = r.range(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
    }
  });

  it('fork(salt) produces a deterministic but independent stream', () => {
    const parent1 = new Rng(100);
    const child1 = parent1.fork('terrain');
    const parent2 = new Rng(100);
    const child2 = parent2.fork('terrain');
    expect(child1.next()).toBe(child2.next());

    const childOther = new Rng(100).fork('other-salt');
    const check = new Rng(100).fork('terrain');
    expect(childOther.next()).not.toBe(check.next());
  });
});
