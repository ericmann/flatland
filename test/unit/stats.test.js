import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import { makeWorld, makeOrganism } from '../helpers.js';

function bareWorld(opts = {}) {
  return makeWorld({ width: 5, height: 5, terrain: TERRAIN.GRASS, organisms: [], ...opts });
}

describe('Stats.sample', () => {
  it('counts diet classes and species correctly', () => {
    const world = bareWorld();
    const h1 = makeOrganism(world, { x: 1, y: 1, traits: { diet: 0.1 } });
    const h2 = makeOrganism(world, { x: 1, y: 2, traits: { diet: 0.2 } });
    const o1 = makeOrganism(world, { x: 2, y: 1, traits: { diet: 0.5 } });
    const c1 = makeOrganism(world, { x: 2, y: 2, traits: { diet: 0.9 } });
    world.store.species[h1] = 0;
    world.store.species[h2] = 0;
    world.store.species[o1] = 1;
    world.store.species[c1] = 2;

    world.stats.sample(world);
    const idx = (world.stats.head - 1 + world.stats.capacity) % world.stats.capacity;
    expect(world.stats.pop[idx]).toBe(4);
    expect(world.stats.herb[idx]).toBe(2);
    expect(world.stats.omni[idx]).toBe(1);
    expect(world.stats.carn[idx]).toBe(1);
    expect(world.stats.speciesLiving[idx]).toBe(3);
  });

  it('Shannon diversity of two equal-sized species is ln(2)', () => {
    const world = bareWorld();
    const a1 = makeOrganism(world, { x: 1, y: 1 });
    const a2 = makeOrganism(world, { x: 1, y: 2 });
    const b1 = makeOrganism(world, { x: 2, y: 1 });
    const b2 = makeOrganism(world, { x: 2, y: 2 });
    world.store.species[a1] = 0;
    world.store.species[a2] = 0;
    world.store.species[b1] = 1;
    world.store.species[b2] = 1;

    world.stats.sample(world);
    const idx = (world.stats.head - 1 + world.stats.capacity) % world.stats.capacity;
    expect(world.stats.diversity[idx]).toBeCloseTo(Math.LN2, 4);
  });

  it('plantsFraction is sum(plants)/sum(cap)', () => {
    const world = bareWorld();
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    // 25 tiles (5x5), fill deterministically for an exact expected value.
    let plantSum = 0;
    for (let i = 0; i < world.plants.length; i++) {
      world.plants[i] = (i % 3) * 0.1;
      plantSum += world.plants[i];
    }
    const expected = plantSum / (cap * world.plants.length);

    world.stats.sample(world);
    const idx = (world.stats.head - 1 + world.stats.capacity) % world.stats.capacity;
    expect(world.stats.plantsFraction[idx]).toBeCloseTo(expected, 4);
  });

  it('the ring buffer wraps without losing the newest sample', () => {
    const world = makeWorld({
      width: 4,
      height: 4,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: { stats: { historyLength: 3 } },
    });
    for (let t = 0; t < 5; t++) {
      world.tick = t; // drive tick directly; sample() only reads world.tick
      world.stats.sample(world);
    }
    expect(world.stats.n).toBe(3); // capped at historyLength
    const idx = (world.stats.head - 1 + world.stats.capacity) % world.stats.capacity;
    expect(world.stats.tick[idx]).toBe(4); // the newest sample (tick 4) survived
  });

  it('an empty world has population 0 and diversity 0', () => {
    const world = bareWorld();
    world.stats.sample(world);
    const idx = (world.stats.head - 1 + world.stats.capacity) % world.stats.capacity;
    expect(world.stats.pop[idx]).toBe(0);
    expect(world.stats.diversity[idx]).toBe(0);
    expect(world.stats.speciesLiving[idx]).toBe(0);
  });

  it('stats.counters is the same object as world.counters', () => {
    const world = bareWorld();
    expect(world.stats.counters).toBe(world.counters);
  });

  it('flow deltas per sample sum to the ledger flow differences', () => {
    const world = bareWorld();
    world.ledger.flows.photosynthesis = 10;
    world.ledger.flows.grazing = 5;
    world.ledger.flows.predation = 0;
    world.ledger.flows.scavenging = 2;
    world.ledger.flows.decay = 1;
    world.ledger.flows.metabolism = 3;

    world.stats.sample(world);
    let idx = (world.stats.head - 1 + world.stats.capacity) % world.stats.capacity;
    expect(world.stats.flows.photosynthesis[idx]).toBeCloseTo(10, 6);
    expect(world.stats.flows.grazing[idx]).toBeCloseTo(5, 6);
    expect(world.stats.flows.predation[idx]).toBeCloseTo(0, 6);
    expect(world.stats.flows.scavenging[idx]).toBeCloseTo(2, 6);
    expect(world.stats.flows.decay[idx]).toBeCloseTo(1, 6);
    expect(world.stats.flows.metabolism[idx]).toBeCloseTo(3, 6);

    // Second sample: ledger totals are cumulative (never reset), so the
    // recorded ring value is this interval's delta, not the running total.
    world.ledger.flows.photosynthesis = 25; // +15
    world.ledger.flows.grazing = 5; // +0
    world.ledger.flows.predation = 4; // +4
    world.ledger.flows.scavenging = 2; // +0
    world.ledger.flows.decay = 6; // +5
    world.ledger.flows.metabolism = 3; // +0

    world.stats.sample(world);
    idx = (world.stats.head - 1 + world.stats.capacity) % world.stats.capacity;
    expect(world.stats.flows.photosynthesis[idx]).toBeCloseTo(15, 6);
    expect(world.stats.flows.grazing[idx]).toBeCloseTo(0, 6);
    expect(world.stats.flows.predation[idx]).toBeCloseTo(4, 6);
    expect(world.stats.flows.scavenging[idx]).toBeCloseTo(0, 6);
    expect(world.stats.flows.decay[idx]).toBeCloseTo(5, 6);
    expect(world.stats.flows.metabolism[idx]).toBeCloseTo(0, 6);
  });
});
