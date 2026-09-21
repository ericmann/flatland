import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { tag, clockParts, plantsFractionOfCap } from '../../src/ui/format.js';

const cfg = makeConfig();

describe('format', () => {
  it('tag renders Y1 D1 06:00 at tick 0', () => {
    expect(tag(0, cfg)).toBe('Y1 D1 06:00');
  });

  it('clockParts splits year/day/time/season', () => {
    const parts = clockParts(0, cfg);
    expect(parts).toEqual({ year: 1, day: 1, time: '06:00', season: 'Spring' });
  });
});

describe('plantsFractionOfCap (P6-02)', () => {
  const plantCap = [0, 0, 14, 40, 24, 0];

  it("divides a raw plant value by its terrain type's cap", () => {
    expect(plantsFractionOfCap(10, TERRAIN.GRASS, plantCap)).toBeCloseTo(0.25, 6); // 10/40
    expect(plantsFractionOfCap(12, TERRAIN.SCRUB, plantCap)).toBe(0.5); // 12/24
  });

  it('is 0 for a cap-0 terrain regardless of the raw value', () => {
    expect(plantsFractionOfCap(5, TERRAIN.WATER, plantCap)).toBe(0);
    expect(plantsFractionOfCap(0, TERRAIN.SAND, plantCap)).toBe(0);
  });
});
