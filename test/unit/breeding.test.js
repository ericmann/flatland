import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import { checkBreeding } from '../../src/core/ecology.js';
import { relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { BRAIN_OUTPUTS } from '../../src/core/genome.js';
import { makeWorld, makeOrganism, alive } from '../helpers.js';

const OUTPUT_BREED = 7; // reflex.js OUTPUT.breed

function bareWorld(opts = {}) {
  return makeWorld({ width: 20, height: 20, terrain: TERRAIN.GRASS, organisms: [], ...opts });
}

/** Make an organism fully eligible to breed (energy, age, breed output). */
function eligible(world, opts = {}) {
  const slot = makeOrganism(world, { x: 10, y: 10, ...opts });
  world.store.energy[slot] = world.store.breedEnergy[slot] + 1;
  world.store.age[slot] = world.store.maturityTicks[slot] + 1;
  world.outputs[slot * BRAIN_OUTPUTS + OUTPUT_BREED] = 1;
  return slot;
}

function runBreedingCheck(world, slot) {
  world.grid.rebuild(world.store);
  world.birthQueueLength = 0;
  checkBreeding(world, slot);
}

describe('checkBreeding: eligibility', () => {
  it('no births below breedEnergy or before maturity', () => {
    const world = bareWorld();
    const tooPoor = makeOrganism(world, { x: 10, y: 10 });
    world.store.energy[tooPoor] = world.store.breedEnergy[tooPoor] - 1;
    world.store.age[tooPoor] = world.store.maturityTicks[tooPoor] + 1;
    world.outputs[tooPoor * BRAIN_OUTPUTS + OUTPUT_BREED] = 1;

    const tooYoung = makeOrganism(world, { x: 11, y: 10 });
    world.store.energy[tooYoung] = world.store.breedEnergy[tooYoung] + 1;
    world.store.age[tooYoung] = 0;
    world.outputs[tooYoung * BRAIN_OUTPUTS + OUTPUT_BREED] = 1;

    world.grid.rebuild(world.store);
    world.birthQueueLength = 0;
    checkBreeding(world, tooPoor);
    checkBreeding(world, tooYoung);
    expect(world.birthQueueLength).toBe(0);
  });

  it('an isolated eligible organism breeds at baseRate over many single-tick trials (+/-20%)', () => {
    const baseRate = 0.01; // default config
    const trials = 10000;
    let queued = 0;
    for (let t = 0; t < trials; t++) {
      const world = bareWorld({ seed: t + 1 });
      const slot = eligible(world);
      runBreedingCheck(world, slot);
      if (world.birthQueueLength > 0) queued++;
    }
    const rate = queued / trials;
    expect(rate).toBeGreaterThan(baseRate * 0.8);
    expect(rate).toBeLessThan(baseRate * 1.2);
  });

  it('with K neighbours within radius it never breeds; with K/2 it breeds at about half rate', () => {
    const K = 10; // default localK
    const radius = 6; // default breeding.radius

    function trialRate(neighbourCount, trials) {
      let queued = 0;
      for (let t = 0; t < trials; t++) {
        const world = bareWorld({ seed: t + 1 });
        const slot = eligible(world);
        for (let n = 0; n < neighbourCount; n++) {
          makeOrganism(world, { x: 10 + 1 + (n % (radius - 1)), y: 10 });
        }
        runBreedingCheck(world, slot);
        if (world.birthQueueLength > 0) queued++;
      }
      return queued / trials;
    }

    const rateAtK = trialRate(K, 4000);
    expect(rateAtK).toBe(0);

    const rateAtHalfK = trialRate(K / 2, 8000);
    expect(rateAtHalfK).toBeGreaterThan(0.005 * 0.6);
    expect(rateAtHalfK).toBeLessThan(0.005 * 1.6);
  });
});

describe('checkBreeding + resolvePredationKills-style resolution (birth mechanics)', () => {
  // resolveBirths is exercised indirectly via the real World.step(), since
  // it is only invoked from there (see world.js), matching how eating and
  // predation are also only reachable through step() plus their own
  // directly-callable helper functions.
  it("the child receives childEnergyFraction of the parent's energy plus its body, all deducted from the parent, ledger exact", () => {
    const world = bareWorld({ config: { breeding: { baseRate: 1 } } }); // force a birth
    const parent = eligible(world, { energy: 200 });
    initGenesisLedger(world);
    const parentEnergyBefore = world.store.energy[parent];
    const parentId = world.store.id[parent];

    world.step(); // one full tick: checkBreeding queues, resolveBirths resolves

    const child = alive(world).find((s) => world.store.parent[s] === parentId);
    expect(child).toBeDefined();

    const childEnergyFraction = world.cfg.breeding.childEnergyFraction;
    const expectedChildEnergy = childEnergyFraction * parentEnergyBefore;
    const expectedCost = expectedChildEnergy + world.store.body[child];

    expect(world.store.energy[child]).toBeCloseTo(expectedChildEnergy, 3);
    // The parent also pays this tick's metabolism (metabolise() runs
    // before checkBreeding in the per-organism loop), so its total loss
    // is the breeding cost plus a small metabolic cost, not exactly the
    // breeding cost alone.
    const parentLoss = parentEnergyBefore - world.store.energy[parent];
    expect(parentLoss).toBeGreaterThanOrEqual(expectedCost);
    expect(parentLoss).toBeLessThan(expectedCost + 1); // metabolism cost is tiny
    expect(relativeError(world)).toBeLessThan(1e-9);
  });

  it('the child copies the genome exactly and inherits species, generation+1 and the parent id', () => {
    const world = bareWorld({ config: { breeding: { baseRate: 1 } } }); // force a birth
    const parent = eligible(world);
    const gLen = world.store.genomeLength;
    const parentGenome = world.store.genome.slice(parent * gLen, parent * gLen + gLen);
    const parentGen = world.store.generation[parent];
    const parentSpecies = world.store.species[parent];
    const parentId = world.store.id[parent];

    world.step();

    const child = alive(world).find((s) => s !== parent && world.store.parent[s] === parentId);
    expect(child).toBeDefined();
    const childGenome = world.store.genome.slice(child * gLen, child * gLen + gLen);
    expect(Array.from(childGenome)).toEqual(Array.from(parentGenome));
    expect(world.store.species[child]).toBe(parentSpecies);
    expect(world.store.generation[child]).toBe(parentGen + 1);
    expect(world.store.parent[child]).toBe(parentId);
    expect(world.store.age[child]).toBe(0);
  });

  it('the child is born on land inside the map', () => {
    const world = bareWorld({ config: { breeding: { baseRate: 1 } } });
    const parent = eligible(world);
    const parentId = world.store.id[parent];
    world.step();
    const child = alive(world).find((s) => s !== parent && world.store.parent[s] === parentId);
    expect(child).toBeDefined();
    expect(world.store.x[child]).toBeGreaterThanOrEqual(0);
    expect(world.store.x[child]).toBeLessThan(world.width);
    expect(world.store.y[child]).toBeGreaterThanOrEqual(0);
    expect(world.store.y[child]).toBeLessThan(world.height);
    const tile = Math.floor(world.store.y[child]) * world.width + Math.floor(world.store.x[child]);
    expect(world.terrain[tile]).not.toBe(TERRAIN.WATER);
  });

  it('a parent killed this tick does not give birth', () => {
    const world = bareWorld({
      config: { breeding: { baseRate: 1 }, predation: { killChance: 1 } },
    });
    const parent = eligible(world, { energy: 200, traits: { diet: 0, size: 0.1 } });
    const predator = makeOrganism(world, {
      x: 10.3,
      y: 10,
      energy: 5,
      traits: { diet: 1, size: 1 },
    });
    world.store.species[predator] = world.store.species[parent] + 1;
    world.outputs[parent * BRAIN_OUTPUTS + OUTPUT_BREED] = 1;

    const parentId = world.store.id[parent];
    world.step();
    // The parent should be dead (hunted); no child should exist with it as parent.
    expect(alive(world).includes(parent)).toBe(false);
    const childOfDeadParent = alive(world).some((s) => world.store.parent[s] === parentId);
    expect(childOfDeadParent).toBe(false);
  });
});
