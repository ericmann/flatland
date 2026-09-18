import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { tag, clockParts } from '../../src/ui/format.js';

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
