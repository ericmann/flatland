import { describe, it, expect } from 'vitest';
import { makeWorld } from '../helpers.js';

describe('ambient temperature', () => {
  it('lags the target: after dusk it cools over many ticks, not at once', () => {
    const world = makeWorld({ seed: 1, organisms: [] });
    const lag = world.cfg.temperature.lag;

    // Run past the first dusk (light falling from > 0 back to 0) so the
    // lag has had a full day to settle away from its tick-0 initial value.
    while (!(world.light > 0)) world.step();
    while (world.light > 0) world.step();

    const atDusk = world.ambient;
    world.step();
    const oneTickLater = world.ambient;
    const firstStepDelta = Math.abs(oneTickLater - atDusk);

    // One tick can only close `lag` of the gap to the target -- it moved,
    // but nowhere near all at once (the theoretical maximum single-tick
    // move, since target and ambient are both in [0,1], is `lag`).
    expect(firstStepDelta).toBeGreaterThan(0);
    expect(firstStepDelta).toBeLessThanOrEqual(lag + 1e-9);

    // Stepping through the rest of the night keeps moving ambient the
    // same direction, well past what a single tick achieved.
    for (let t = 0; t < world.cfg.time.ticksPerDay / 2; t++) world.step();
    const laterInNight = world.ambient;
    const totalDelta = Math.abs(laterInNight - atDusk);
    expect(totalDelta).toBeGreaterThan(firstStepDelta * 10);
  });

  it('mid-winter nights are colder than mid-summer nights', () => {
    const world = makeWorld({ seed: 1, organisms: [] });
    const DAY = world.cfg.time.ticksPerDay;
    const YEAR = world.cfg.time.daysPerYear;

    // A tick 90% through a day is always night (dayFraction never exceeds
    // 0.72, SPEC §4.3), so comparing the same time-of-night in the two
    // solstice days isolates the seasonal term.
    const nightOffset = Math.round(0.9 * DAY);
    const summerNightTick = Math.round(0.375 * YEAR) * DAY + nightOffset;
    const winterNightTick = Math.round(0.875 * YEAR) * DAY + nightOffset;
    const lastTick = Math.max(summerNightTick, winterNightTick);

    let summerAmbient = null;
    let winterAmbient = null;
    for (let t = 0; t < lastTick; t++) {
      world.step();
      if (world.tick === summerNightTick) summerAmbient = world.ambient;
      if (world.tick === winterNightTick) winterAmbient = world.ambient;
    }

    expect(summerAmbient).not.toBeNull();
    expect(winterAmbient).not.toBeNull();
    expect(summerAmbient).toBeGreaterThan(winterAmbient);
  });

  it('temperature.enabled = false keeps ambient at base', () => {
    const world = makeWorld({
      seed: 1,
      organisms: [],
      config: { temperature: { enabled: false } },
    });
    const base = Math.fround(world.cfg.temperature.base);
    expect(world.ambient).toBe(base);

    for (let t = 0; t < 5000; t++) world.step();
    expect(world.ambient).toBe(base);
  });
});
