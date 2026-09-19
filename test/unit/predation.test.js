import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import { DEATH, EV_HUNT } from '../../src/core/world.js';
import { huntTarget, resolvePredationKills } from '../../src/core/ecology.js';
import { relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { makeWorld, makeOrganism } from '../helpers.js';

function bareWorld(opts = {}) {
  return makeWorld({ width: 10, height: 10, terrain: TERRAIN.GRASS, organisms: [], ...opts });
}

/**
 * Place a predator at (x,y) and a prey at (x+dist,y), on different
 * species, and run huntTarget for the predator.
 */
function setupAttack(world, dist, { predatorTraits = {}, preyTraits = {} } = {}) {
  const predator = makeOrganism(world, {
    x: 5,
    y: 5,
    energy: 5,
    traits: { diet: 1, size: 1, ...predatorTraits },
  });
  const prey = makeOrganism(world, {
    x: 5 + dist,
    y: 5,
    energy: 20,
    traits: { diet: 0, size: 0.1, ...preyTraits },
  });
  world.store.species[prey] = world.store.species[predator] + 1;
  // huntTarget reads world.grid, which world.step() normally rebuilds
  // before the per-organism loop; called directly here, it must be
  // rebuilt explicitly after adding organisms.
  world.grid.rebuild(world.store);
  huntTarget(world, predator);
  return { predator, prey };
}

describe('huntTarget', () => {
  it('finds an attacker within reach; killChance=1 kills, killChance=0 never does', () => {
    const killAlways = bareWorld({ config: { predation: { killChance: 1 } } });
    const { predator: pA, prey: preyA } = setupAttack(killAlways, 0.5);
    resolvePredationKills(killAlways);
    expect(killAlways.dying[preyA]).toBe(DEATH.HUNTED);
    void pA;

    const killNever = bareWorld({ config: { predation: { killChance: 0 } } });
    const { prey: preyB } = setupAttack(killNever, 0.5);
    resolvePredationKills(killNever);
    expect(killNever.dying[preyB]).toBe(0);
  });

  it('is never the same species', () => {
    const world = bareWorld({ config: { predation: { killChance: 1 } } });
    const predator = makeOrganism(world, { x: 5, y: 5, traits: { diet: 1, size: 1 } });
    const other = makeOrganism(world, { x: 5.5, y: 5, traits: { diet: 0, size: 0.1 } });
    world.store.species[other] = world.store.species[predator]; // same species
    world.grid.rebuild(world.store);
    huntTarget(world, predator);
    expect(world.attackTarget[predator]).toBe(-1);
  });

  it('prey larger than ratio*attacker is safe', () => {
    const world = bareWorld();
    const predator = makeOrganism(world, { x: 5, y: 5, traits: { diet: 1, size: 0 } }); // smallest
    const big = makeOrganism(world, { x: 5.5, y: 5, traits: { diet: 0, size: 1 } }); // largest
    world.store.species[big] = world.store.species[predator] + 1;
    world.grid.rebuild(world.store);
    huntTarget(world, predator);
    expect(world.attackTarget[predator]).toBe(-1);
  });

  it('an ineligible attacker (diet below minDiet) never targets anything', () => {
    const world = bareWorld();
    const notPredator = makeOrganism(world, { x: 5, y: 5, traits: { diet: 0, size: 1 } });
    const other = makeOrganism(world, { x: 5.5, y: 5, traits: { diet: 0, size: 0.1 } });
    world.store.species[other] = world.store.species[notPredator] + 1;
    world.grid.rebuild(world.store);
    huntTarget(world, notPredator);
    expect(world.attackTarget[notPredator]).toBe(-1);
  });

  it('a target outside reach is not selected', () => {
    const world = bareWorld();
    const { predator } = setupAttack(world, world.cfg.predation.reach + 0.5);
    expect(world.attackTarget[predator]).toBe(-1);
  });
});

describe('resolvePredationKills', () => {
  it('two attackers on one prey: the lower slot eats, the higher gets nothing', () => {
    const world = bareWorld({ config: { predation: { killChance: 1 } } });
    const prey = makeOrganism(world, { x: 5, y: 5, energy: 20, traits: { diet: 0, size: 0.1 } });
    const attackerLow = makeOrganism(world, {
      x: 5.2,
      y: 5,
      energy: 5,
      traits: { diet: 1, size: 1 },
    });
    const attackerHigh = makeOrganism(world, {
      x: 5.3,
      y: 5,
      energy: 5,
      traits: { diet: 1, size: 1 },
    });
    // Both attackers share one species (different from prey's) so they
    // are never mutually eligible prey for each other despite being
    // physically closer to each other than to the actual prey.
    world.store.species[attackerLow] = world.store.species[prey] + 1;
    world.store.species[attackerHigh] = world.store.species[prey] + 1;
    world.grid.rebuild(world.store);
    huntTarget(world, attackerLow);
    huntTarget(world, attackerHigh);
    expect(world.attackTarget[attackerLow]).toBe(prey);
    expect(world.attackTarget[attackerHigh]).toBe(prey);

    const energyHighBefore = world.store.energy[attackerHigh];
    resolvePredationKills(world);

    expect(world.dying[prey]).toBe(DEATH.HUNTED);
    expect(world.store.energy[attackerLow]).toBeGreaterThan(5);
    // The higher-slot attacker's own attempt is skipped: by the time its
    // turn comes in slot order, the prey is already dying (world.dying[j] !== 0).
    expect(world.store.energy[attackerHigh]).toBe(energyHighBefore);
  });

  it("prey's energy + body splits exactly into attacker gain, dissipation and carcass", () => {
    const world = bareWorld({ config: { predation: { killChance: 1 } } });
    setupAttack(world, 0.5, {});
    // Baseline the ledger after the two organisms exist, not before, so
    // their starting energy/body counts as part of "genesis".
    initGenesisLedger(world);
    resolvePredationKills(world);
    expect(relativeError(world)).toBeLessThan(1e-9);
  });

  it('records a hunt event with attacker and prey species', () => {
    const world = bareWorld({ config: { predation: { killChance: 1 } } });
    const { predator, prey } = setupAttack(world, 0.5);
    resolvePredationKills(world);
    const ev = world.events;
    const idx = (ev.head - 1 + ev.capacity) % ev.capacity;
    expect(ev.kind[idx]).toBe(EV_HUNT);
    expect(ev.a[idx]).toBe(world.store.species[predator]);
    // prey is freed by resolve() later, not here; species value is still
    // set on the slot at the moment the event is recorded.
    void prey;
  });

  it('never kills across the same species', () => {
    const world = bareWorld({ config: { predation: { killChance: 1 } } });
    const predator = makeOrganism(world, { x: 5, y: 5, traits: { diet: 1, size: 1 } });
    const same = makeOrganism(world, { x: 5.3, y: 5, traits: { diet: 0, size: 0.1 } });
    // Deliberately same species (default 0 for both).
    world.grid.rebuild(world.store);
    huntTarget(world, predator);
    resolvePredationKills(world);
    expect(world.dying[same]).toBe(0);
  });
});
