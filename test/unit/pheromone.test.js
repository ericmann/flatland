import { describe, it, expect } from 'vitest';
import { decay, diffuse, emit } from '../../src/core/pheromone.js';
import { makeWorld } from '../helpers.js';
import { TERRAIN } from '../../src/core/terrain.js';

describe('pheromone: decay', () => {
  it('decay multiplies each channel by its rate', () => {
    const world = makeWorld({ width: 8, height: 8, terrain: TERRAIN.GRASS, organisms: [] });
    for (let c = 0; c < 4; c++) world.pher[c].fill(0.5);

    decay(world);

    const rates = world.cfg.pheromone.decay;
    for (let c = 0; c < 4; c++) {
      for (let i = 0; i < world.pher[c].length; i++) {
        expect(world.pher[c][i]).toBeCloseTo(0.5 * rates[c], 6);
      }
    }
  });
});

describe('pheromone: diffuse', () => {
  it('conserves total mass on an interior region and spreads a point', () => {
    const world = makeWorld({ width: 20, height: 20, terrain: TERRAIN.GRASS, organisms: [] });
    const centre = 10 * 20 + 10; // far from every edge
    world.pher[0][centre] = 1;

    const before = world.pher[0].reduce((a, b) => a + b, 0);
    diffuse(world);
    const after = world.pher[0].reduce((a, b) => a + b, 0);

    expect(after).toBeCloseTo(before, 5);
    // The point itself lost some mass to its neighbours.
    expect(world.pher[0][centre]).toBeLessThan(1);
    expect(world.pher[0][centre - 1]).toBeGreaterThan(0); // west neighbour
    expect(world.pher[0][centre + 1]).toBeGreaterThan(0); // east neighbour
    expect(world.pher[0][centre - 20]).toBeGreaterThan(0); // north neighbour
    expect(world.pher[0][centre + 20]).toBeGreaterThan(0); // south neighbour
  });

  it('edge tiles do not leak: a corner averages over only its 2 existing neighbours', () => {
    const world = makeWorld({ width: 4, height: 4, terrain: TERRAIN.GRASS, organisms: [] });
    const corner = 0; // (0, 0)
    world.pher[1][corner] = 1;

    diffuse(world);

    const rate = world.cfg.pheromone.diffusion[1];
    // Corner (0,0)'s only in-bounds neighbours are (1,0) and (0,1), both 0.
    const expected = 1 + rate * (0 - 1);
    expect(world.pher[1][corner]).toBeCloseTo(expected, 6);
    // No mass appears at the far (wrapped-around) edge.
    expect(world.pher[1][3]).toBe(0); // (3, 0)
    expect(world.pher[1][12]).toBe(0); // (0, 3)
  });
});

describe('pheromone: emit', () => {
  it('emission adds output × gene × emitRate, capped at 1', () => {
    const world = makeWorld({
      width: 8,
      height: 8,
      terrain: TERRAIN.GRASS,
      organisms: [{ x: 3, y: 3 }],
    });
    const slot = 0;
    // `pheno` mirrors the raw gene value directly for the emit/sense
    // traits (SPEC §4.6: they're used as-is, not phenotype-mapped).
    world.store.pheno[slot * 24 + 16] = 0.8; // TRAIT.emit0
    world.outputs[slot * 8 + 3] = 0.5; // OUTPUT.emit0

    emit(world, slot);

    const tile = 3 * 8 + 3;
    expect(world.pher[0][tile]).toBeCloseTo(0.5 * 0.8 * world.cfg.pheromone.emitRate, 6);
  });

  it('emission caps the channel at 1', () => {
    const world = makeWorld({
      width: 8,
      height: 8,
      terrain: TERRAIN.GRASS,
      organisms: [{ x: 2, y: 2 }],
    });
    const tile = 2 * 8 + 2;
    world.pher[0][tile] = 0.999;
    const slot = 0;
    for (let t = 0; t < 24; t++) world.store.pheno[slot * 24 + t] = 1;
    world.outputs[slot * 8 + 3] = 1;

    emit(world, slot);

    expect(world.pher[0][tile]).toBe(1);
  });

  it('does not emit below the 0.05 output gate', () => {
    const world = makeWorld({
      width: 8,
      height: 8,
      terrain: TERRAIN.GRASS,
      organisms: [{ x: 2, y: 2 }],
    });
    const slot = 0;
    for (let t = 0; t < 24; t++) world.store.pheno[slot * 24 + t] = 1;
    world.outputs[slot * 8 + 3] = 0.04;

    emit(world, slot);

    expect(world.pher[0][2 * 8 + 2]).toBe(0);
  });
});

describe('pheromone: enabled flag', () => {
  it('pheromone.enabled = false leaves all channels at zero', () => {
    const world = makeWorld({
      width: 16,
      height: 16,
      terrain: TERRAIN.GRASS,
      config: { pheromone: { enabled: false } },
    });
    for (let t = 0; t < 100; t++) world.step();
    for (let c = 0; c < 4; c++) {
      expect(world.pher[c].every((v) => v === 0)).toBe(true);
    }
  });
});

describe('pheromone: hash', () => {
  it('hash changes when a channel changes', () => {
    const world = makeWorld({ width: 8, height: 8, terrain: TERRAIN.GRASS, organisms: [] });
    const before = world.hash();
    world.pher[2][5] = 0.3;
    const after = world.hash();
    expect(after).not.toBe(before);
  });
});
