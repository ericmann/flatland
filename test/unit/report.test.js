import { describe, it, expect } from 'vitest';
import { ecologyReport, sampleMinPopY2 } from '../../scripts/lib/report.mjs';
import {
  parseConfigOverrides,
  parseSeeds,
  parseSize,
  flag,
  flagAll,
} from '../../scripts/lib/args.mjs';
import { TERRAIN } from '../../src/core/terrain.js';
import { makeWorld, isolate } from '../helpers.js';

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

  it('bornPerImmig, deathAgeMeanPct, edgePct and plantsAvgPct are derived from the world (P6-01)', () => {
    // A 100x100 world with genesis skipped, two organisms placed directly:
    // one at a corner (within the default 20-tile edge margin of two
    // edges), one dead center (nowhere near any edge).
    const world = makeWorld({
      width: 100,
      height: 100,
      seed: 1,
      terrain: TERRAIN.GRASS,
      config: isolate(),
      organisms: [
        { x: 1, y: 1 },
        { x: 50, y: 50 },
      ],
    });
    world.counters.born = 40;
    world.counters.immigrations = 4;
    world.counters.deaths = 3;
    world.counters.deathAgePct = 270;
    // Directly populate the stats ring (SPEC: same pattern report.mjs
    // already uses for diversityAvg) rather than stepping thousands of
    // ticks to accumulate real samples.
    world.stats.n = 3;
    world.stats.plantsFraction[0] = 0.2;
    world.stats.plantsFraction[1] = 0.4;
    world.stats.plantsFraction[2] = 0.6;

    const report = ecologyReport(world);

    expect(report.bornPerImmig).toBe(10);
    expect(report.deathAgeMeanPct).toBe(90);
    expect(report.edgePct).toBeCloseTo(50, 6); // 1 of 2 organisms within 20 tiles of an edge
    // precision 4, not 6: stats.plantsFraction is a Float32Array, so the
    // stored 0.2/0.4/0.6 carry float32 rounding error beyond that.
    expect(report.plantsAvgPct).toBeCloseTo(40, 4); // mean(0.2, 0.4, 0.6) * 100
  });

  it('bornPerImmig is born when there have been no immigrations yet, not Infinity', () => {
    const world = makeWorld({ seed: 5 });
    world.counters.born = 7;
    world.counters.immigrations = 0;
    const report = ecologyReport(world);
    expect(report.bornPerImmig).toBe(7);
  });

  it('edgePct respects a custom edgeMargin option', () => {
    const world = makeWorld({
      width: 100,
      height: 100,
      seed: 1,
      terrain: TERRAIN.GRASS,
      config: isolate(),
      organisms: [{ x: 50, y: 50 }], // center: not within 20 tiles of an edge, but is within 60
    });
    expect(ecologyReport(world).edgePct).toBe(0);
    expect(ecologyReport(world, { edgeMargin: 60 }).edgePct).toBe(100);
  });
});

describe('sampleMinPopY2', () => {
  it('does not sample before startTick', () => {
    expect(sampleMinPopY2(null, 100, 5, { startTick: 1000, everyTicks: 600 })).toBeNull();
  });

  it('does not sample off the everyTicks cadence', () => {
    expect(sampleMinPopY2(null, 1601, 5, { startTick: 1000, everyTicks: 600 })).toBeNull();
  });

  it('takes the running minimum only on qualifying ticks', () => {
    let min = sampleMinPopY2(null, 1200, 10, { startTick: 1000, everyTicks: 600 });
    expect(min).toBe(10);
    min = sampleMinPopY2(min, 1800, 4, { startTick: 1000, everyTicks: 600 });
    expect(min).toBe(4);
    min = sampleMinPopY2(min, 2400, 9, { startTick: 1000, everyTicks: 600 });
    expect(min).toBe(4); // 9 > 4, minimum unchanged
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
