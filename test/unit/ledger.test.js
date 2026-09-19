import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import { stocks, relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { queueIntervention } from '../../src/core/interventions.js';
import { makeWorld } from '../helpers.js';

describe('ledger', () => {
  it('genesis equals the initial stocks total, after initGenesisLedger', () => {
    const world = makeWorld({ seed: 3 });
    initGenesisLedger(world);
    const s = stocks(world);
    expect(world.ledger.genesis).toBeCloseTo(s.total, 6);
    expect(s.organisms).toBeGreaterThan(0);
  });

  it('relativeError is 0 on a fresh world (before any steps)', () => {
    const world = makeWorld({ seed: 4 });
    initGenesisLedger(world);
    expect(relativeError(world)).toBeLessThan(1e-9);
  });

  it('relativeError stays within 1e-3 after some ticks with no interventions', () => {
    const world = makeWorld({ seed: 6 });
    initGenesisLedger(world);
    for (let i = 0; i < 500; i++) world.step();
    expect(relativeError(world)).toBeLessThan(1e-3);
  });

  it('immigration is an input term and the identity holds', () => {
    // No genesis population: both diet-class floors are crossed
    // immediately, so the first immigration.checkEvery boundary brings in
    // both a herbivore and a carnivore group.
    const world = makeWorld({
      width: 64,
      height: 40,
      terrain: TERRAIN.GRASS,
      organisms: [],
    });
    initGenesisLedger(world);
    expect(world.ledger.immigration).toBe(0);

    for (let i = 0; i < world.cfg.immigration.checkEvery; i++) world.step();

    expect(world.counters.immigrations).toBeGreaterThanOrEqual(1);
    expect(world.ledger.immigration).toBeGreaterThan(0);
    expect(relativeError(world)).toBeLessThan(1e-3);
  });
});

describe('queueIntervention', () => {
  it('rejects a tick at or before the current tick', () => {
    const world = makeWorld({ width: 4, height: 4, terrain: TERRAIN.GRASS, organisms: [] });
    expect(() => queueIntervention(world, { tick: world.tick, kind: 'rain' })).toThrow();
    expect(() => queueIntervention(world, { tick: world.tick - 1, kind: 'rain' })).toThrow();
    expect(() => queueIntervention(world, { tick: world.tick + 1, kind: 'rain' })).not.toThrow();
  });

  it('keeps pending events sorted by (tick, insertion order)', () => {
    const world = makeWorld({ width: 4, height: 4, terrain: TERRAIN.GRASS, organisms: [] });
    const a = { tick: 5, kind: 'rain', label: 'a' };
    const b = { tick: 3, kind: 'rain', label: 'b' };
    const c = { tick: 5, kind: 'rain', label: 'c' };
    const d = { tick: 3, kind: 'rain', label: 'd' };
    queueIntervention(world, a);
    queueIntervention(world, b);
    queueIntervention(world, c);
    queueIntervention(world, d);
    expect(world.pending.map((e) => e.label)).toEqual(['b', 'd', 'a', 'c']);
  });
});
