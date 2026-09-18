import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import { makeWorld, isolate } from '../helpers.js';

describe('plant growth', () => {
  it('is zero at L = 0', () => {
    const world = makeWorld({
      width: 4,
      height: 4,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    world.plants.fill(0.3);
    // Advance well into the night portion of the day (u >= f), where L is
    // exactly 0 (not just near dawn, where L is a tiny positive number).
    const nightTick = Math.floor(world.cfg.time.ticksPerDay * 0.9);
    for (let i = 0; i < nightTick; i++) world.step();
    expect(world.light).toBe(0);
    const before = world.plants.slice();
    world.step();
    expect(world.light).toBe(0);
    expect(world.plants).toEqual(before);
  });

  it('follows base = growth * L * (1 - p/cap) at soil = 0', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    world.plants.fill(0.3 * cap);
    // Advance to a tick with light > 0.
    while (world.light === 0) world.step();
    const p = world.plants[0];
    const L = world.light;
    const expectedBase = world.cfg.plants.growth * L * (1 - p / cap);
    const before = world.plants[0];
    world.step();
    const applied = world.plants[0] - before;
    // soil is 0 everywhere, so fromSoil = 0 and want = base; no capping
    // expected here since p is well below cap.
    expect(applied).toBeCloseTo(expectedBase, 5);
  });

  it('soil raises growth and is consumed', () => {
    const noSoil = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    const withSoil = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    const cap = noSoil.cfg.terrain.plantCap[TERRAIN.GRASS];
    noSoil.plants.fill(0.3 * cap);
    withSoil.plants.fill(0.3 * cap);
    withSoil.soil.fill(1.0);
    // Advance well into daylight (not just past L = 0): near dawn, L is so
    // small that the soil-uptake amount rounds away at float32 precision
    // against a soil value of 1.0, making a comparison at the boundary
    // flaky. Stop just short of a full step at L >= 0.3, then compare the
    // next single step across both worlds.
    while (noSoil.light < 0.3) {
      noSoil.step();
      withSoil.step();
    }
    const plantsNoSoilBefore = noSoil.plants[0];
    const plantsWithSoilBefore = withSoil.plants[0];
    const soilBefore = withSoil.soil[0];

    noSoil.step();
    withSoil.step();

    const growthNoSoil = noSoil.plants[0] - plantsNoSoilBefore;
    const growthWithSoil = withSoil.plants[0] - plantsWithSoilBefore;
    expect(growthWithSoil).toBeGreaterThan(growthNoSoil);
    expect(withSoil.soil[0]).toBeLessThan(soilBefore);
  });

  it('never exceeds cap', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    world.plants.fill(cap - 0.0001);
    world.soil.fill(1);
    for (let i = 0; i < 500; i++) {
      world.step();
      for (const p of world.plants) {
        expect(p).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('plants.enabled = false disables growth entirely', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: { plants: { enabled: false } },
    });
    const before = world.plants.slice();
    for (let i = 0; i < 2000; i++) world.step();
    expect(world.plants).toEqual(before);
  });
});

describe('carcass decay', () => {
  it('decays to soil, slower on mud than on grass', () => {
    const grass = makeWorld({
      width: 2,
      height: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('carcass'),
    });
    const mud = makeWorld({
      width: 2,
      height: 1,
      terrain: TERRAIN.MUD,
      organisms: [],
      config: isolate('carcass'),
    });
    grass.carcass.fill(1);
    mud.carcass.fill(1);
    grass.step();
    mud.step();
    const grassDecayed = 1 - grass.carcass[0];
    const mudDecayed = 1 - mud.carcass[0];
    expect(mudDecayed).toBeLessThan(grassDecayed);
    expect(grass.soil[0]).toBeGreaterThan(0);
    expect(mud.soil[0]).toBeGreaterThan(0);
  });

  it('carcass.enabled = false disables decay entirely', () => {
    const world = makeWorld({
      width: 2,
      height: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: { carcass: { enabled: false } },
    });
    world.carcass.fill(1);
    for (let i = 0; i < 100; i++) world.step();
    expect(world.carcass[0]).toBe(1);
  });
});

describe('rain intervention', () => {
  it('adds up to amount per tile, capped at cap, counted as hand', () => {
    const world = makeWorld({
      width: 2,
      height: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate(),
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    world.plants.fill(0);
    world.pending.push({ tick: 1, kind: 'rain' });
    world.step();
    const amount = world.cfg.interventions.rain.amount;
    expect(world.plants[0]).toBeCloseTo(Math.min(cap, amount), 5);
    expect(world.ledger.hand).toBeCloseTo(2 * Math.min(cap, amount), 4);
    expect(world.interventions.length).toBe(1);
    expect(world.interventions[0].kind).toBe('rain');
  });

  it('caps at the tile cap even from a high starting level', () => {
    const world = makeWorld({
      width: 1,
      height: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate(),
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    world.plants[0] = cap - 0.05;
    world.pending.push({ tick: 1, kind: 'rain' });
    world.step();
    expect(world.plants[0]).toBeLessThanOrEqual(cap);
  });
});
