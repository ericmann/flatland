import { describe, it, expect } from 'vitest';
import { DEFAULTS, DOCS, makeConfig, flatten } from '../../src/core/config.js';

describe('makeConfig', () => {
  it('returns defaults when given nothing', () => {
    const cfg = makeConfig();
    expect(cfg.world.width).toBe(DEFAULTS.world.width);
    expect(cfg.world.height).toBe(DEFAULTS.world.height);
    expect(cfg.time.ticksPerDay).toBe(DEFAULTS.time.ticksPerDay);
  });

  it('overrides deep-merge and arrays replace wholesale', () => {
    const cfg = makeConfig({ world: { width: 64 } });
    expect(cfg.world.width).toBe(64);
    // Untouched sibling keys survive the merge.
    expect(cfg.world.height).toBe(DEFAULTS.world.height);
  });

  it('unknown keys throw', () => {
    expect(() => makeConfig({ world: { bogus: 1 } })).toThrow(/unknown config key/);
    expect(() => makeConfig({ nope: { x: 1 } })).toThrow(/unknown config key/);
  });

  it('non-finite override numbers throw', () => {
    expect(() => makeConfig({ world: { width: NaN } })).toThrow();
    expect(() => makeConfig({ world: { width: Infinity } })).toThrow();
  });

  it('result is frozen, deeply', () => {
    const cfg = makeConfig();
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen(cfg.world)).toBe(true);
    expect(() => {
      cfg.world.width = 999;
    }).toThrow(TypeError);
  });

  it('every assumption key is documented with units', () => {
    for (const [key] of flatten(DEFAULTS)) {
      expect(DOCS.has(key)).toBe(true);
      const doc = DOCS.get(key);
      expect(typeof doc.units).toBe('string');
      expect(typeof doc.assumption).toBe('boolean');
      expect(typeof doc.doc).toBe('string');
    }
  });

  it('marks the known P0-02 assumption keys as assumption: true', () => {
    for (const key of ['world.height', 'time.ticksPerDay', 'time.daysPerYear']) {
      expect(DOCS.get(key).assumption).toBe(true);
    }
  });

  it('marks non-assumption keys as assumption: false', () => {
    for (const key of ['world.maxOrganisms', 'world.cellSize']) {
      expect(DOCS.get(key).assumption).toBe(false);
    }
  });
});

describe('flatten', () => {
  it('produces a Map of dotted paths to leaf values', () => {
    const flat = flatten({ a: { b: 1, c: { d: 2 } } });
    expect(flat.get('a.b')).toBe(1);
    expect(flat.get('a.c.d')).toBe(2);
  });

  it('treats arrays as leaf values, not nested paths', () => {
    const flat = flatten({ a: [1, 2, 3] });
    expect(flat.get('a')).toEqual([1, 2, 3]);
  });
});
