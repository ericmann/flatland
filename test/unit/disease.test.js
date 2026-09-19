import { describe, it, expect } from 'vitest';
import { diseaseTick, applyNewlySick } from '../../src/core/disease.js';
import { makeWorld, makeOrganism, infect } from '../helpers.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { KIND } from '../../src/core/chronicle.js';
import { TRAIT_NAMES } from '../../src/core/genome.js';

function diseaseWorld(config = {}) {
  return makeWorld({
    width: 32,
    height: 32,
    terrain: TERRAIN.GRASS,
    organisms: [],
    config: {
      disease: {
        contactRate: 1,
        kinBias: 0,
        spontaneousRate: 0,
        durationTicks: 10,
        costPerTick: 0.1,
        lethality: 0,
        ...config,
      },
    },
  });
}

describe('disease: transmission', () => {
  it('spreads by contact within contactRadius and not beyond', () => {
    const world = diseaseWorld({ contactRadius: 1.0 });
    const sick = makeOrganism(world, { x: 10, y: 10 });
    infect(world, sick);
    const near = makeOrganism(world, { x: 10.5, y: 10, traits: { resistance: 0 } });
    const far = makeOrganism(world, { x: 12, y: 10, traits: { resistance: 0 } });
    world.grid.rebuild(world.store);

    diseaseTick(world, sick);
    applyNewlySick(world);

    expect(world.store.sick[near]).toBeGreaterThan(0);
    expect(world.store.sick[far]).toBe(0);
  });

  it('an identical-genome neighbour is infected at contactRate and a maximally distant one never (kinBias = 1)', () => {
    const world = diseaseWorld({ contactRadius: 5, contactRate: 1, kinBias: 1 });
    const zeroTraits = {};
    const oneTraits = {};
    for (const name of TRAIT_NAMES) {
      zeroTraits[name] = 0;
      oneTraits[name] = 1;
    }
    // Every trait pinned to 0, so a neighbour pinned to 1 is at the
    // maximum possible normalized trait-block distance (1).
    const sick = makeOrganism(world, { x: 10, y: 10, traits: { ...zeroTraits, resistance: 0 } });
    infect(world, sick);
    // Identical trait block (dist = 0): p = 1 * max(0, 1-0) * 1 = 1.
    const twin = makeOrganism(world, {
      x: 10.5,
      y: 10,
      traits: { ...zeroTraits, resistance: 0 },
    });
    // Maximally distant (dist = 1): p = 1 * max(0, 1-1) * 1 = 0.
    const opposite = makeOrganism(world, {
      x: 9.5,
      y: 10,
      traits: { ...oneTraits, resistance: 0 },
    });

    world.grid.rebuild(world.store);
    diseaseTick(world, sick);
    applyNewlySick(world);

    expect(world.store.sick[twin]).toBeGreaterThan(0);
    expect(world.store.sick[opposite]).toBe(0);
  });

  it('resistance 1 is immune and pays nothing', () => {
    const world = diseaseWorld({ contactRadius: 2, contactRate: 1, kinBias: 0 });
    const sick = makeOrganism(world, { x: 10, y: 10 });
    infect(world, sick);
    const immune = makeOrganism(world, { x: 10.5, y: 10, traits: { resistance: 1 } });
    world.grid.rebuild(world.store);

    diseaseTick(world, sick);
    applyNewlySick(world);

    expect(world.store.sick[immune]).toBe(0);
  });
});

describe('disease: cost', () => {
  it('a sick organism pays costPerTick × (1 − resistance) into dissipated, ledger exact', () => {
    const world = diseaseWorld({ costPerTick: 0.1 });
    const slot = makeOrganism(world, { x: 10, y: 10, traits: { resistance: 0.4 } });
    infect(world, slot);
    world.grid.rebuild(world.store);
    const before = world.store.energy[slot];
    const dissipatedBefore = world.ledger.dissipated;

    diseaseTick(world, slot);

    const expectedCost = 0.1 * (1 - 0.4);
    const realised = before - world.store.energy[slot];
    expect(realised).toBeCloseTo(expectedCost, 5);
    expect(world.ledger.dissipated - dissipatedBefore).toBeCloseTo(realised, 6);
  });
});

describe('disease: recovery and death', () => {
  it('at the end of the timer it dies with lethality 1 and recovers with 0', () => {
    const dies = diseaseWorld({ durationTicks: 1, lethality: 1 });
    const slotDies = makeOrganism(dies, { x: 5, y: 5, traits: { resistance: 0 } });
    infect(dies, slotDies);
    dies.grid.rebuild(dies.store);
    diseaseTick(dies, slotDies);
    expect(dies.dying[slotDies]).not.toBe(0);

    const recovers = diseaseWorld({ durationTicks: 1, lethality: 0 });
    const slotRecovers = makeOrganism(recovers, { x: 5, y: 5, traits: { resistance: 0 } });
    infect(recovers, slotRecovers);
    recovers.grid.rebuild(recovers.store);
    diseaseTick(recovers, slotRecovers);
    expect(recovers.dying[slotRecovers]).toBe(0);
    expect(recovers.store.sick[slotRecovers]).toBe(0);
  });
});

describe('disease: plague chronicle', () => {
  it('a plague entry appears once when the threshold is crossed', () => {
    const world = diseaseWorld({ outbreakThreshold: 3, chronicleCooldown: 100 });
    const slots = [];
    for (let i = 0; i < 4; i++) {
      slots.push(makeOrganism(world, { x: 5 + i, y: 5 }));
    }
    world.grid.rebuild(world.store);
    // Queue all 4 as newly sick in one application (crosses the threshold of 3).
    for (const s of slots) world.newlySick[s] = 1;
    applyNewlySick(world);

    const entries = world.chronicle.flush() ?? [];
    const plagues = entries.filter((e) => e.kind === KIND.PLAGUE);
    expect(plagues).toHaveLength(1);

    // A further infection (still above threshold) does not re-chronicle
    // within the cooldown.
    const extra = makeOrganism(world, { x: 9, y: 5 });
    world.newlySick[extra] = 1;
    applyNewlySick(world);
    const moreEntries = world.chronicle.flush() ?? [];
    expect(moreEntries.filter((e) => e.kind === KIND.PLAGUE)).toHaveLength(0);
  });
});

describe('disease: enabled flag', () => {
  it('disease.enabled = false never infects', () => {
    const world = makeWorld({
      width: 16,
      height: 16,
      terrain: TERRAIN.GRASS,
      config: { disease: { enabled: false, contactRate: 1, kinBias: 0, spontaneousRate: 1 } },
      organisms: [
        { x: 5, y: 5 },
        { x: 5.5, y: 5, traits: { resistance: 0 } },
      ],
    });
    infect(world, 0);
    world.grid.rebuild(world.store);
    for (let t = 0; t < 20; t++) world.step();
    expect(world.store.sick[1]).toBe(0);
  });
});
