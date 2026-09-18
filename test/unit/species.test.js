import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { World } from '../../src/core/world.js';
import { TRAIT_COUNT, TRAIT } from '../../src/core/genome.js';
import { DEATH } from '../../src/core/world.js';
import { makeWorld, makeOrganism, stepN } from '../helpers.js';

/**
 * A bare world (genesis skipped) with one organism at (5, 5), already
 * assigned to a freshly-created species of its own.
 */
function setupOneSpecies() {
  const world = makeWorld({ width: 20, height: 20, organisms: [] });
  const slot = makeOrganism(world, { x: 5, y: 5 });
  const gLen = world.store.genomeLength;
  const speciesId = world.species.create(world, slot * gLen, -1, 5, 5);
  world.store.species[slot] = speciesId;
  world.species.count[speciesId] = 1;
  return { world, slot, speciesId, gLen };
}

describe('SpeciesTable', () => {
  it('a newborn within θ joins the parent species and moves the centroid by centroidRate', () => {
    const { world, speciesId, gLen } = setupOneSpecies();
    const child = makeOrganism(world, { x: 6, y: 6 });
    // Copy the parent's genome, then nudge one trait gene by a small,
    // sub-theta amount.
    const parentOff = 0 * gLen; // the "parent" slot from setupOneSpecies is slot 0
    for (let k = 0; k < gLen; k++) {
      world.store.genome[child * gLen + k] = world.store.genome[parentOff + k];
    }
    world.store.genome[child * gLen + TRAIT.size] = Math.min(
      1,
      world.store.genome[parentOff + TRAIT.size] + 0.05,
    );
    world.store.species[child] = speciesId; // inherited, as resolveBirths does before calling assignNewborn

    const centroidBefore = world.species.centroid.slice(
      speciesId * TRAIT_COUNT,
      (speciesId + 1) * TRAIT_COUNT,
    );
    world.species.assignNewborn(world, child);

    expect(world.store.species[child]).toBe(speciesId);
    expect(world.species.count[speciesId]).toBe(2);

    const rate = world.cfg.species.centroidRate;
    for (let t = 0; t < TRAIT_COUNT; t++) {
      const childGene = world.store.genome[child * gLen + t];
      const expected = centroidBefore[t] + (childGene - centroidBefore[t]) * rate;
      expect(world.species.centroid[speciesId * TRAIT_COUNT + t]).toBeCloseTo(expected, 5);
    }
  });

  it('a newborn beyond θ founds a species whose ancestor is the parent species and born = tick', () => {
    const { world, speciesId, gLen } = setupOneSpecies();
    world.tick = 42;
    const child = makeOrganism(world, { x: 6, y: 6 });
    // Maximally different trait genes: distance = sqrt(24) >> theta (0.6).
    for (let t = 0; t < TRAIT_COUNT; t++) {
      const parentGene = world.store.genome[0 * gLen + t];
      world.store.genome[child * gLen + t] = parentGene < 0.5 ? 1 : 0;
    }
    world.store.species[child] = speciesId;

    world.species.assignNewborn(world, child);

    const newId = world.store.species[child];
    expect(newId).not.toBe(speciesId);
    expect(world.species.ancestor[newId]).toBe(speciesId);
    expect(world.species.born[newId]).toBe(42);
    expect(world.species.count[newId]).toBe(1);
    // The old species lost nothing (the newborn never joined it).
    expect(world.species.count[speciesId]).toBe(1);
  });

  it('the last death records died = tick and never deletes the species', () => {
    const { world, slot, speciesId } = setupOneSpecies();
    world.tick = 7;
    world.species.onDeath(world, slot, DEATH.STARVED);

    expect(world.species.count[speciesId]).toBe(0);
    expect(world.species.died[speciesId]).toBe(7);
    // Never deleted: the row still exists with all its history.
    expect(world.species.n).toBeGreaterThan(speciesId);
    expect(world.species.names[speciesId]).toBeDefined();
  });

  it('species counts sum to the living population after 2000 default ticks', () => {
    const world = makeWorld({ seed: 1 });
    stepN(world, 2000);

    let sum = 0;
    for (let id = 0; id < world.species.n; id++) {
      if (world.species.died[id] === -1) sum += world.species.count[id];
    }
    expect(sum).toBe(world.store.count);
  });

  it('hash changes when a centroid changes', () => {
    const cfg = makeConfig({ world: { width: 20, height: 20 } });
    const a = new World(cfg, 1);
    const b = new World(cfg, 1);
    const slotA = makeOrganism(a, { x: 5, y: 5 });
    const slotB = makeOrganism(b, { x: 5, y: 5 });
    const gLenA = a.store.genomeLength;
    a.species.create(a, slotA * gLenA, -1, 5, 5);
    b.species.create(b, slotB * gLenA, -1, 5, 5);
    expect(a.hash()).toBe(b.hash());

    a.species.centroid[0] += 0.1;
    expect(a.hash()).not.toBe(b.hash());
  });
});
