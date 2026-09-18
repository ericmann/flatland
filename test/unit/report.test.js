import { describe, it, expect } from 'vitest';
import { ecologyReport } from '../../scripts/lib/report.mjs';
import {
  parseConfigOverrides,
  parseSeeds,
  parseSize,
  flag,
  flagAll,
} from '../../scripts/lib/args.mjs';
import { makeWorld } from '../helpers.js';

/**
 * Recursively assert every number found in `value` is finite.
 * @param {*} value
 * @param {string} path
 */
function assertAllNumbersFinite(value, path) {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} should be finite, got ${value}`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertAllNumbersFinite(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      assertAllNumbersFinite(value[key], `${path}.${key}`);
    }
  }
}

describe('ecologyReport', () => {
  it('returns every field with finite numbers', () => {
    const world = makeWorld({ seed: 3 });
    world.stats.sample(world); // ensure at least one sample exists
    const report = ecologyReport(world, { ticksPerSecond: 1234.5 });

    expect(typeof report.hash).toBe('string');
    // Every numeric field/sub-field (excluding the hash string) must be finite.
    const { hash, ...rest } = report;
    void hash;
    assertAllNumbersFinite(rest, 'report');

    expect(report.tick).toBe(0);
    expect(report.population.total).toBeGreaterThan(0);
    expect(report.species.length).toBeGreaterThan(0);
    expect(report.ticksPerSecond).toBe(1234.5);
  });

  it('defaults ticksPerSecond to a finite number (0) when not provided', () => {
    const world = makeWorld({ seed: 4 });
    const report = ecologyReport(world);
    expect(report.ticksPerSecond).toBe(0);
  });
});

describe('args: parseConfigOverrides', () => {
  it('handles --config a.b=1 --config c=true', () => {
    const overrides = parseConfigOverrides(['a.b=1', 'c=true']);
    expect(overrides).toEqual({ a: { b: 1 }, c: true });
  });

  it('parses false and leaves non-numeric strings as strings', () => {
    const overrides = parseConfigOverrides(['x=false', 'y=hello']);
    expect(overrides).toEqual({ x: false, y: 'hello' });
  });

  it('ignores entries without an "="', () => {
    expect(parseConfigOverrides(['bogus'])).toEqual({});
  });
});

describe('args: other helpers', () => {
  it('flag finds the value after --name, or the fallback', () => {
    expect(flag(['--seed', '5'], 'seed', '1')).toBe('5');
    expect(flag(['--other', '5'], 'seed', '1')).toBe('1');
  });

  it('flagAll collects every occurrence in order', () => {
    expect(flagAll(['--config', 'a=1', '--config', 'b=2'], 'config')).toEqual(['a=1', 'b=2']);
  });

  it('parseSeeds handles a range and a list', () => {
    expect(parseSeeds('1..4')).toEqual([1, 2, 3, 4]);
    expect(parseSeeds('2,5,9')).toEqual([2, 5, 9]);
  });

  it('parseSize handles a WxH spec and null', () => {
    expect(parseSize('64x40')).toEqual({ width: 64, height: 40 });
    expect(parseSize(null)).toBeNull();
  });
});
