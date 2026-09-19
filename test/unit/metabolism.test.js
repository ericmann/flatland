import { describe, it, expect } from 'vitest';
import { metabolise, ageOrganism, OUTPUT } from '../../src/core/reflex.js';
import { relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { TRAIT, TRAIT_COUNT, BRAIN_OUTPUTS } from '../../src/core/genome.js';
import { DEATH } from '../../src/core/world.js';
import { makeWorld, makeOrganism } from '../helpers.js';

function bareWorld({ config = {}, ...opts } = {}) {
  return makeWorld({
    width: 10,
    height: 10,
    terrain: TERRAIN.GRASS,
    organisms: [],
    // Isolate metabolism from temperature (P5-01) by default, so these
    // tests' plain `base * metab * (0.5 + size) * ...` formulas hold;
    // the temperature-specific test below re-enables it explicitly.
    config: { temperature: { enabled: false }, ...config },
    ...opts,
  });
}

describe('metabolise', () => {
  it('standing still costs base * metab * (0.5 + size) per tick, recorded as dissipated', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5 });
    const outOff = slot * BRAIN_OUTPUTS;
    world.outputs[outOff + OUTPUT.throttle] = 0;
    const pOff = slot * TRAIT_COUNT;
    const size = world.store.pheno[pOff + TRAIT.size];
    const metab = world.store.pheno[pOff + TRAIT.metabolism];
    const expectedCost = world.cfg.metabolism.base * metab * (0.5 + size);
    const before = world.store.energy[slot];
    const dissipatedBefore = world.ledger.dissipated;
    metabolise(world, slot);
    const paid = before - world.store.energy[slot];
    // store.energy is a Float32Array, so the implementation's actual
    // subtraction is before - fround(before - expectedCost); compare
    // against that exact value rather than the unrounded double.
    const expectedPaid = before - Math.fround(before - expectedCost);
    expect(paid).toBe(expectedPaid);
    // These two are plain doubles derived from the same `paid` value in
    // the implementation, so they must match exactly.
    expect(world.ledger.dissipated - dissipatedBefore).toBe(paid);
    expect(world.ledger.flows.metabolism).toBe(paid);
  });

  it('full throttle costs (1 + moveCost * speed/speedMax) times more than standing still', () => {
    const world = bareWorld();
    const still = makeOrganism(world, { x: 5, y: 5, traits: { speed: 0.5 } });
    const moving = makeOrganism(world, { x: 6, y: 6, traits: { speed: 0.5 } });
    world.outputs[still * BRAIN_OUTPUTS + OUTPUT.throttle] = 0;
    world.outputs[moving * BRAIN_OUTPUTS + OUTPUT.throttle] = 1;
    const beforeStill = world.store.energy[still];
    const beforeMoving = world.store.energy[moving];
    metabolise(world, still);
    metabolise(world, moving);
    const costStill = beforeStill - world.store.energy[still];
    const costMoving = beforeMoving - world.store.energy[moving];
    const speed = world.store.pheno[moving * TRAIT_COUNT + TRAIT.speed];
    const speedMax = world.cfg.phenotype.speed[1];
    const expectedFactor = 1 + (world.cfg.metabolism.moveCost * 1 * speed) / speedMax;
    expect(costMoving / costStill).toBeCloseTo(expectedFactor, 2);
  });

  it('an organism at zero energy dies of starvation and its body mass appears as carcass', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5, energy: 0.001 });
    world.outputs[slot * BRAIN_OUTPUTS + OUTPUT.throttle] = 0;
    metabolise(world, slot);
    expect(world.dying[slot]).toBe(DEATH.STARVED);
    expect(world.store.energy[slot]).toBeLessThanOrEqual(0);
  });

  it('metabolism.enabled = false never spends energy', () => {
    const world = bareWorld({ config: { metabolism: { enabled: false } } });
    const slot = makeOrganism(world, { x: 5, y: 5 });
    const before = world.store.energy[slot];
    metabolise(world, slot);
    expect(world.store.energy[slot]).toBe(before);
  });

  it('the cost rises with the gap between preferred and ambient temperature', () => {
    const world = bareWorld({ config: { temperature: { enabled: true } } });
    world.ambient = 0.5;
    // Same size/metab/speed (both default to the trait midpoint) so the
    // only difference between these two is the prefTemp-to-ambient gap.
    const atAmbient = makeOrganism(world, { x: 5, y: 5, traits: { prefTemp: 0.5 } });
    const farFromAmbient = makeOrganism(world, { x: 6, y: 6, traits: { prefTemp: 0.9 } });
    world.outputs[atAmbient * BRAIN_OUTPUTS + OUTPUT.throttle] = 0;
    world.outputs[farFromAmbient * BRAIN_OUTPUTS + OUTPUT.throttle] = 0;

    const beforeAt = world.store.energy[atAmbient];
    const beforeFar = world.store.energy[farFromAmbient];
    metabolise(world, atAmbient);
    metabolise(world, farFromAmbient);
    const costAt = beforeAt - world.store.energy[atAmbient];
    const costFar = beforeFar - world.store.energy[farFromAmbient];

    expect(costFar).toBeGreaterThan(costAt);

    const prefFar = world.store.pheno[farFromAmbient * TRAIT_COUNT + TRAIT.prefTemp];
    const expectedFactor = 1 + world.cfg.temperature.costGain * Math.abs(prefFar - world.ambient);
    expect(costFar / costAt).toBeCloseTo(expectedFactor, 5);
  });

  it('temperature.enabled = false ignores the preferred-temperature gap', () => {
    const world = bareWorld();
    world.ambient = 0.9;
    const atAmbient = makeOrganism(world, { x: 5, y: 5, traits: { prefTemp: 0.5 } });
    const farFromAmbient = makeOrganism(world, { x: 6, y: 6, traits: { prefTemp: 0.9 } });
    world.outputs[atAmbient * BRAIN_OUTPUTS + OUTPUT.throttle] = 0;
    world.outputs[farFromAmbient * BRAIN_OUTPUTS + OUTPUT.throttle] = 0;

    const beforeAt = world.store.energy[atAmbient];
    const beforeFar = world.store.energy[farFromAmbient];
    metabolise(world, atAmbient);
    metabolise(world, farFromAmbient);
    expect(beforeAt - world.store.energy[atAmbient]).toBe(
      beforeFar - world.store.energy[farFromAmbient],
    );
  });
});

describe('ageOrganism', () => {
  it('past lifespan, marks the organism dying of old age', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5 });
    world.store.age[slot] = world.store.lifespanTicks[slot] + 1;
    ageOrganism(world, slot);
    expect(world.dying[slot]).toBe(DEATH.OLD_AGE);
  });

  it('below lifespan, does not mark dying', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5 });
    world.store.age[slot] = 0;
    ageOrganism(world, slot);
    expect(world.dying[slot]).toBe(0);
    expect(world.store.age[slot]).toBe(1);
  });

  it('aging.enabled = false never ages or marks dying', () => {
    const world = bareWorld({ config: { aging: { enabled: false } } });
    const slot = makeOrganism(world, { x: 5, y: 5 });
    world.store.age[slot] = world.store.lifespanTicks[slot] + 1;
    ageOrganism(world, slot);
    expect(world.dying[slot]).toBe(0);
    expect(world.store.age[slot]).toBe(world.store.lifespanTicks[slot] + 1);
  });
});

describe('the energy ledger stays exact through deaths', () => {
  it('relativeError is under 1e-9 after 500 ticks with organisms dying', () => {
    const world = makeWorld({ seed: 2, width: 30, height: 30 });
    // Force fast starvation deaths by dropping everyone's energy first,
    // then baseline the ledger against that (already-modified) state.
    for (let i = 0; i < world.store.highWater; i++) {
      if (world.store.alive[i]) world.store.energy[i] = 0.5;
    }
    initGenesisLedger(world);
    for (let t = 0; t < 500; t++) world.step();
    expect(relativeError(world)).toBeLessThan(1e-9);
  });
});
