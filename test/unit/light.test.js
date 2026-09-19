import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { lightAt, dayFraction, season, clock, sunArc } from '../../src/core/light.js';

const cfg = makeConfig();
const DAY = cfg.time.ticksPerDay;
const YEAR = cfg.time.daysPerYear;

describe('lightAt', () => {
  it('is 0 at dawn (u = 0)', () => {
    expect(lightAt(0, cfg)).toBeCloseTo(0, 9);
    expect(lightAt(DAY, cfg)).toBeCloseTo(0, 9);
  });

  it('peaks at 1 when u = f/2', () => {
    // Pick a tick where yearFrac = 0 (f = 0.5 + 0.22*sin(-0.25*2π)), then
    // find the tick within that day at u = f/2 by scanning: L should reach
    // its maximum of 1 there and nowhere higher across the whole day.
    const tick0 = 0; // start of year, start of day
    const f = dayFraction(tick0, cfg);
    const uPeakTick = Math.round((f / 2) * DAY);
    const peak = lightAt(uPeakTick, cfg);
    expect(peak).toBeCloseTo(1, 3);
    for (let t = 0; t < DAY; t += 17) {
      expect(lightAt(t, cfg)).toBeLessThanOrEqual(peak + 1e-6);
    }
  });

  it('is 0 through the night (u >= f)', () => {
    const f = dayFraction(0, cfg);
    const nightTick = Math.round((f + (1 - f) / 2) * DAY);
    expect(lightAt(nightTick, cfg)).toBe(0);
  });

  it('is unchanged by config overrides that do not touch time', () => {
    const otherCfg = makeConfig({ world: { width: 64, height: 40 } });
    for (const t of [0, 500, 1234, DAY * 3 + 77]) {
      expect(lightAt(t, otherCfg)).toBe(lightAt(t, cfg));
    }
  });
});

describe('dayFraction', () => {
  it('ranges over [0.28, 0.72] across a year and peaks mid-summer', () => {
    let min = Infinity;
    let max = -Infinity;
    let peakTick = 0;
    let peakVal = -Infinity;
    const totalTicks = DAY * YEAR;
    for (let t = 0; t <= totalTicks; t += DAY) {
      const f = dayFraction(t, cfg);
      min = Math.min(min, f);
      max = Math.max(max, f);
      if (f > peakVal) {
        peakVal = f;
        peakTick = t;
      }
    }
    expect(min).toBeGreaterThanOrEqual(0.28 - 1e-6);
    expect(max).toBeLessThanOrEqual(0.72 + 1e-6);
    expect(min).toBeLessThan(0.29);
    expect(max).toBeGreaterThan(0.71);
    // Mid-summer is yearFrac = 0.375.
    const peakYearFrac = (Math.floor(peakTick / DAY) % YEAR) / YEAR;
    expect(peakYearFrac).toBeCloseTo(0.375, 1);
  });
});

describe('season', () => {
  it('is a quarter of the year, in order Spring, Summer, Autumn, Winter', () => {
    expect(season(0, cfg)).toBe('Spring');
    expect(season(Math.floor(DAY * YEAR * 0.1), cfg)).toBe('Spring');
    expect(season(Math.floor(DAY * YEAR * 0.3), cfg)).toBe('Summer');
    expect(season(Math.floor(DAY * YEAR * 0.6), cfg)).toBe('Autumn');
    expect(season(Math.floor(DAY * YEAR * 0.9), cfg)).toBe('Winter');
  });

  it('cycles for year 2', () => {
    expect(season(DAY * YEAR, cfg)).toBe('Spring');
  });
});

describe('clock', () => {
  it('tick 0 is Year 1 · Day 1 · 06:00', () => {
    const c = clock(0, cfg);
    expect(c.year).toBe(1);
    expect(c.day).toBe(1);
    expect(c.text).toBe('Year 1 · Day 1 · 06:00');
  });

  it('the last tick of day 1 is 05:59', () => {
    const c = clock(DAY - 1, cfg);
    expect(c.day).toBe(1);
    expect(c.text).toBe('Year 1 · Day 1 · 05:59');
  });

  it('the first tick of year 2 is Year 2 · Day 1', () => {
    const c = clock(DAY * YEAR, cfg);
    expect(c.year).toBe(2);
    expect(c.day).toBe(1);
    expect(c.text).toBe('Year 2 · Day 1 · 06:00');
  });

  it('day increments at the day boundary within year 1', () => {
    expect(clock(DAY, cfg).day).toBe(2);
    expect(clock(DAY * 2 - 1, cfg).day).toBe(2);
  });
});

describe('sunArc', () => {
  it('angle is π at dawn, π/2 at midday, sweeps to 0 at dusk, and holds at π through the night', () => {
    // angle = π(1 - u/f): π at dawn (u=0), falling to 0 as u approaches f
    // (dusk) — this is what drives the mockup's left-to-right sun glyph.
    const f = dayFraction(0, cfg);
    expect(sunArc(0, cfg).angle).toBeCloseTo(Math.PI, 6);
    expect(sunArc(0, cfg).up).toBe(true);
    const midDayTick = Math.round((f / 2) * DAY);
    expect(sunArc(midDayTick, cfg).angle).toBeCloseTo(Math.PI / 2, 2);
    const duskTick = Math.round((f - 1 / DAY) * DAY);
    expect(sunArc(duskTick, cfg).angle).toBeLessThan(0.1);
    const nightTick = Math.round((f + (1 - f) / 2) * DAY);
    expect(sunArc(nightTick, cfg).angle).toBe(Math.PI);
    expect(sunArc(nightTick, cfg).up).toBe(false);
  });
});
