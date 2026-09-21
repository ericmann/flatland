import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import { queueIntervention } from '../../src/core/interventions.js';
import { KIND } from '../../src/core/chronicle.js';
import { relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { makeWorld, makeOrganism, isolate } from '../helpers.js';

// A flat, fully isolated world (every `.enabled` mechanic off) so an
// intervention's effect is the only thing changing state between ticks.
function flatWorld(opts = {}) {
  return makeWorld({
    width: 20,
    height: 20,
    terrain: TERRAIN.GRASS,
    organisms: [],
    config: isolate(),
    ...opts,
  });
}

/** Sum of every tile in a Float32Array-backed plants/carcass/soil array. */
function sum(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) total += arr[i];
  return total;
}

describe('fire', () => {
  it('clears plants, kills in radius and dissipates the plant mass', () => {
    const world = flatWorld();
    world.plants.fill(0.5);
    const inRadius = makeOrganism(world, { x: 10, y: 10 });
    const outsideRadius = makeOrganism(world, { x: 19, y: 19 });
    initGenesisLedger(world);
    const plantsBefore = sum(world.plants);

    queueIntervention(world, { tick: 1, kind: 'fire', x: 10, y: 10 });
    world.step();

    const plantsLost = plantsBefore - sum(world.plants);
    expect(world.plants[10 * world.width + 10]).toBe(0);
    expect(plantsLost).toBeGreaterThan(0);
    expect(world.ledger.dissipated).toBeCloseTo(plantsLost, 4);
    expect(world.ledger.flows.fire).toBeCloseTo(plantsLost, 4);
    expect(world.store.alive[inRadius]).toBe(0);
    expect(world.store.alive[outsideRadius]).toBe(1);
    expect(world.terrain[10 * world.width + 10]).toBe(TERRAIN.GRASS); // fire never touches terrain

    const line = world.chronicle.entries.find((e) => e.kind === KIND.INTERVENTION);
    expect(line.text).toMatch(/^⚡ Fire sweeps .* 1 dead\.$/);
  });
});

describe('meteor', () => {
  it('turns tiles to rock permanently', () => {
    const world = flatWorld();
    world.plants.fill(0.5);
    const inRadius = makeOrganism(world, { x: 10, y: 10 });
    initGenesisLedger(world);

    queueIntervention(world, { tick: 1, kind: 'meteor', x: 10, y: 10 });
    world.step();

    expect(world.terrain[10 * world.width + 10]).toBe(TERRAIN.ROCK);
    expect(world.plants[10 * world.width + 10]).toBe(0);
    expect(world.terrainDirty).toBeTruthy();
    expect(world.store.alive[inRadius]).toBe(0);

    // Stays rock: growPlants would never re-green it even many ticks later.
    for (let i = 0; i < 500; i++) world.step();
    expect(world.terrain[10 * world.width + 10]).toBe(TERRAIN.ROCK);

    const line = world.chronicle.entries.find((e) => e.kind === KIND.INTERVENTION);
    expect(line.text).toMatch(/^⚡ A meteor strikes .* 1 dead\.$/);
  });
});

describe('plague', () => {
  it('infects in radius', () => {
    const world = flatWorld();
    const inRadius = makeOrganism(world, { x: 10, y: 10 });
    const outsideRadius = makeOrganism(world, { x: 19, y: 19 });

    queueIntervention(world, { tick: 1, kind: 'plague', x: 10, y: 10 });
    world.step();

    expect(world.store.sick[inRadius]).toBe(world.cfg.disease.durationTicks);
    expect(world.store.sick[outsideRadius]).toBe(0);
    expect(world.species.sick[0]).toBe(1);

    const line = world.chronicle.entries.find((e) => e.kind === KIND.INTERVENTION);
    expect(line.text).toMatch(/^⚡ Plague seeded in .*; 1 carriers\.$/);
  });
});

describe('river', () => {
  it('paints water and displaces standers to land', () => {
    const world = flatWorld({ width: 30, height: 30 });
    world.plants.fill(0.5);
    const standing = makeOrganism(world, { x: 10, y: 10 });
    initGenesisLedger(world);

    queueIntervention(world, { tick: 1, kind: 'river', x: 10, y: 10 });
    world.step();

    expect(world.terrain[10 * world.width + 10]).toBe(TERRAIN.WATER);
    expect(world.plants[10 * world.width + 10]).toBe(0);
    expect(world.terrainDirty).toBeTruthy();

    const tx = Math.floor(world.store.x[standing]);
    const ty = Math.floor(world.store.y[standing]);
    expect(world.terrain[ty * world.width + tx]).not.toBe(TERRAIN.WATER);

    const line = world.chronicle.entries.find((e) => e.kind === KIND.INTERVENTION);
    expect(line.text).toMatch(/^⚡ Water opened in .*\.$/);
  });
});

describe('meadow', () => {
  it('paints grass and its plant mass is counted as hand', () => {
    const world = flatWorld({ terrain: TERRAIN.SCRUB });
    world.plants.fill(0.1);
    // A water tile within radius must stay water (never painted grass).
    world.terrain[10 * world.width + 11] = TERRAIN.WATER;
    world.plants[10 * world.width + 11] = 0;
    initGenesisLedger(world);

    const handBefore = world.ledger.hand;
    queueIntervention(world, { tick: 1, kind: 'meadow', x: 10, y: 10 });
    world.step();

    const idx = 10 * world.width + 10;
    expect(world.terrain[idx]).toBe(TERRAIN.GRASS);
    expect(world.plants[idx]).toBeGreaterThanOrEqual(world.cfg.interventions.meadow.plants);
    expect(world.ledger.hand).toBeGreaterThan(handBefore);
    expect(world.terrain[10 * world.width + 11]).toBe(TERRAIN.WATER); // untouched

    const line = world.chronicle.entries.find((e) => e.kind === KIND.INTERVENTION);
    expect(line.text).toMatch(/^⚡ Meadow laid down in .*\.$/);
  });

  it('raises tiles to meadow.plants energy units clamped at the grass cap (P6-02)', () => {
    // A P6-02-scale grass cap (40 energy units/tile) and meadow.plants
    // (20, half the cap) rather than the ≤ 1 defaults, so this exercises
    // the "clamped to cap" branch at a scale where meadow.plants is well
    // below cap, not coincidentally equal to it.
    const world = flatWorld({
      terrain: TERRAIN.SCRUB,
      config: {
        ...isolate(),
        terrain: { plantCap: [0, 0, 14, 40, 24, 0] },
        interventions: { meadow: { plants: 20 } },
      },
    });
    world.plants.fill(5);
    initGenesisLedger(world);

    queueIntervention(world, { tick: 1, kind: 'meadow', x: 10, y: 10 });
    world.step();

    const idx = 10 * world.width + 10;
    expect(world.terrain[idx]).toBe(TERRAIN.GRASS);
    expect(world.plants[idx]).toBe(20); // raised to meadow.plants, well under the 40 cap
  });
});

describe('rename', () => {
  it('changes the species name uniquely and logs naming', () => {
    const world = makeWorld({ seed: 1 });
    const id = 0;
    const oldName = world.species.names[id];

    queueIntervention(world, {
      tick: world.tick + 1,
      kind: 'rename',
      speciesId: id,
      name: 'Test Lineage',
    });
    world.step();

    expect(world.species.names[id]).toBe('Test Lineage');
    expect(world.species.names[id]).not.toBe(oldName);
    expect(world.species.dirty[id]).toBe(1);

    const naming = world.chronicle.entries.find((e) => e.kind === KIND.NAMING);
    expect(naming.text).toBe(`You named the ${oldName} Test Lineage.`);
    expect(world.chronicle.entries.some((e) => e.kind === KIND.INTERVENTION)).toBe(false);
  });

  it('makes a colliding name unique the same way speciesName does', () => {
    const world = makeWorld({ seed: 1 });
    // Give species 1 (if any) the exact name we're about to request for
    // species 0, forcing the uniqueness suffix to kick in.
    if (world.species.n < 2) {
      world.species.names.push('Meadow Grazers');
      world.species.n = Math.max(world.species.n, 2);
    } else {
      world.species.names[1] = 'Meadow Grazers';
    }

    queueIntervention(world, {
      tick: world.tick + 1,
      kind: 'rename',
      speciesId: 0,
      name: 'Meadow Grazers',
    });
    world.step();

    expect(world.species.names[0]).not.toBe('Meadow Grazers');
    expect(world.species.names[0]).toMatch(/^Meadow Grazers/);
  });
});

describe('config', () => {
  it('changes a numeric key and rejects size keys', () => {
    const world = flatWorld();
    const next = world.cfg.interventions.rain.amount + 0.1;

    queueIntervention(world, {
      tick: 1,
      kind: 'config',
      diff: { 'interventions.rain.amount': next },
    });
    world.step();

    expect(world.cfg.interventions.rain.amount).toBeCloseTo(next, 6);
    const line = world.chronicle.entries.find((e) => e.kind === KIND.INTERVENTION);
    expect(line.text).toMatch(/^⚡ Config changed: interventions\.rain\.amount\.$/);
  });

  it('rejects a diff that would resize a buffer, applied at step time', () => {
    for (const [key, value] of [
      ['world.width', 30],
      ['brain.hidden', 12],
      ['stats.historyLength', 10],
    ]) {
      const world = flatWorld();
      queueIntervention(world, { tick: 1, kind: 'config', diff: { [key]: value } });
      expect(() => world.step()).toThrow();
    }
  });
});

describe('applyDue', () => {
  it('appends every applied event to world.interventions in order', () => {
    const world = flatWorld();
    queueIntervention(world, { tick: 3, kind: 'rain' });
    queueIntervention(world, { tick: 1, kind: 'fire', x: 5, y: 5 });
    queueIntervention(world, { tick: 2, kind: 'meadow', x: 5, y: 5 });

    for (let i = 0; i < 3; i++) world.step();

    expect(world.interventions.map((e) => e.kind)).toEqual(['fire', 'meadow', 'rain']);
    expect(world.interventions.map((e) => e.tick)).toEqual([1, 2, 3]);
  });
});

describe('energy identity with interventions', () => {
  it('holds within 1e-3 across fire, meteor, plague, river and meadow', () => {
    const world = flatWorld({ width: 40, height: 40 });
    makeOrganism(world, { x: 20, y: 20 });
    makeOrganism(world, { x: 5, y: 5 });
    initGenesisLedger(world);

    queueIntervention(world, { tick: 10, kind: 'fire', x: 20, y: 20 });
    queueIntervention(world, { tick: 20, kind: 'meteor', x: 15, y: 15 });
    queueIntervention(world, { tick: 30, kind: 'plague', x: 5, y: 5 });
    queueIntervention(world, { tick: 40, kind: 'river', x: 8, y: 8 });
    queueIntervention(world, { tick: 50, kind: 'meadow', x: 12, y: 12 });

    for (let t = 1; t <= 60; t++) {
      world.step();
      expect(relativeError(world)).toBeLessThan(1e-3);
    }
  });
});
