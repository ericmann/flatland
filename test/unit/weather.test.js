import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import { KIND } from '../../src/core/chronicle.js';
import { INPUT, gather } from '../../src/core/senses.js';
import { initGenesisLedger, relativeError } from '../../src/core/ledger.js';
import { makeWorld, makeOrganism, isolate } from '../helpers.js';

/**
 * A small all-grass world with only `plants` and `weather` enabled, for
 * isolating the moisture -> growth-rate effect (SPEC §9.1).
 * @param {*} [weatherOverrides]
 */
function rainWorld(weatherOverrides = {}) {
  const overrides = isolate('plants', 'weather');
  overrides.weather = { ...overrides.weather, fogRate: 0, ...weatherOverrides };
  return makeWorld({
    width: 6,
    height: 6,
    terrain: TERRAIN.GRASS,
    organisms: [],
    config: overrides,
  });
}

describe('weather: rain', () => {
  it('sets moisture, which decays and boosts growth while the ledger stays exact', () => {
    // Part 1 -- the growth-rate multiplier itself, isolated from rng
    // timing by setting `moisture` directly on two otherwise-identical,
    // weather-disabled worlds (world.moisture is instance state, not
    // frozen config, so this is a legitimate test-only shortcut).
    const worldOpts = {
      width: 6,
      height: 6,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    };
    const rainy = makeWorld(worldOpts);
    const dry = makeWorld(worldOpts);
    while (rainy.light === 0) {
      rainy.step();
      dry.step();
    }
    const cap = rainy.cfg.terrain.plantCap[TERRAIN.GRASS];
    rainy.plants.fill(0.3 * cap);
    dry.plants.fill(0.3 * cap);
    rainy.moisture = 1.0;
    const beforeRainy = rainy.plants[0];
    const beforeDry = dry.plants[0];
    rainy.step();
    dry.step();
    const appliedRainy = rainy.plants[0] - beforeRainy;
    const appliedDry = dry.plants[0] - beforeDry;
    expect(appliedDry).toBeGreaterThan(0);
    // Growth-RATE multiplier (1 + moisture), not an energy injection: the
    // rained-on tile grows exactly (1 + moisture) times as much as the
    // dry one this tick.
    expect(appliedRainy).toBeCloseTo(appliedDry * 2, 4);

    // Part 2 -- an actual rain event (rng-triggered, rainRate = 1 forces
    // it on the very first tick) sets moisture to rainMoisture, which
    // then decays every subsequent tick while the not-while-active gate
    // blocks a re-roll, and the conservation identity holds throughout
    // (the multiplier never touches the ledger).
    const rolled = rainWorld({ rainRate: 1 });
    initGenesisLedger(rolled);
    rolled.step();
    expect(rolled.moisture).toBeCloseTo(rolled.cfg.weather.rainMoisture, 5);
    let previous = rolled.moisture;
    for (let t = 0; t < 50; t++) {
      rolled.step();
      expect(rolled.moisture).toBeLessThan(previous);
      previous = rolled.moisture;
      expect(relativeError(rolled)).toBeLessThan(1e-3);
    }
  });
});

describe('weather: fog', () => {
  it('halves vision range while active', () => {
    const world = makeWorld({
      width: 40,
      height: 40,
      terrain: TERRAIN.GRASS,
      organisms: [],
    });
    const prey = makeOrganism(world, {
      x: 20,
      y: 20,
      traits: { diet: 0, size: 0.3, visionPeak: 0.5, visionWidth: 0.5, visionRange: 1 },
    });
    world.store.heading[prey] = 0;
    const predator = makeOrganism(world, {
      x: 30,
      y: 20, // distance 10: inside the unfogged range (visionRange gene 1 -> 16
      // tiles, SPEC §5.2), outside the fogged range (16 * 0.5 = 8).
      traits: { diet: 1, size: 1 },
    });
    world.store.species[predator] = world.store.species[prey] + 1;
    world.light = 0.5; // L = lambda: acuity = 1, so range = R exactly.

    world.grid.rebuild(world.store);
    gather(world, prey);
    const clear = world.inputs.subarray(prey * 17, prey * 17 + 17);
    expect(clear[INPUT.threatProx]).toBeGreaterThan(0);

    world.fogTicks = world.cfg.weather.fogTicks;
    world.grid.rebuild(world.store);
    gather(world, prey);
    const fogged = world.inputs.subarray(prey * 17, prey * 17 + 17);
    expect(fogged[INPUT.threatProx]).toBe(0);
  });
});

describe('weather: chronicle', () => {
  it('each event writes a weather entry', () => {
    const overrides = isolate('weather');
    overrides.weather = { ...overrides.weather, rainRate: 1, fogRate: 1 };
    const world = makeWorld({
      width: 8,
      height: 8,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: overrides,
    });

    world.step();
    const entries = world.chronicle.flush() ?? [];
    const weatherEntries = entries.filter((e) => e.kind === KIND.WEATHER);
    expect(weatherEntries.length).toBe(2);
    expect(weatherEntries[0].text).toBe('Rain over the valley.');
    expect(weatherEntries[1].text).toMatch(/^Fog settles on /);
  });

  it('weather.enabled = false never rolls', () => {
    const overrides = isolate('weather');
    overrides.weather = {
      ...overrides.weather,
      enabled: false,
      rainRate: 1,
      fogRate: 1,
    };
    const world = makeWorld({
      width: 8,
      height: 8,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: overrides,
    });

    for (let t = 0; t < 5000; t++) world.step();

    expect(world.moisture).toBe(0);
    expect(world.fogTicks).toBe(0);
    const entries = world.chronicle.flush() ?? [];
    expect(entries.some((e) => e.kind === KIND.WEATHER)).toBe(false);
  });
});
