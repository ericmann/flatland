import { describe, it, expect } from 'vitest';
import { act, OUTPUT } from '../../src/core/reflex.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { TRAIT, TRAIT_COUNT, BRAIN_OUTPUTS } from '../../src/core/genome.js';
import { makeWorld, makeOrganism } from '../helpers.js';

function setOutputs(world, slot, { turn = 0, throttle = 1 } = {}) {
  const outOff = slot * BRAIN_OUTPUTS;
  world.outputs[outOff + OUTPUT.turn] = turn;
  world.outputs[outOff + OUTPUT.throttle] = throttle;
}

describe('act (movement)', () => {
  it('throttle 1 on grass moves speed tiles per tick along the heading', () => {
    const world = makeWorld({ width: 20, height: 20, terrain: TERRAIN.GRASS, organisms: [] });
    const slot = makeOrganism(world, { x: 10, y: 10, traits: { speed: 1 } });
    world.store.heading[slot] = 0; // +x
    setOutputs(world, slot, { turn: 0, throttle: 1 });
    const speed = world.store.pheno[slot * TRAIT_COUNT + TRAIT.speed];
    act(world, slot);
    expect(world.store.x[slot]).toBeCloseTo(10 + speed, 5);
    expect(world.store.y[slot]).toBeCloseTo(10, 5);
  });

  it('mud moves at 1/1.6 and scrub at 1/1.3 of the grass speed', () => {
    const grass = makeWorld({ width: 20, height: 20, terrain: TERRAIN.GRASS, organisms: [] });
    const mud = makeWorld({ width: 20, height: 20, terrain: TERRAIN.MUD, organisms: [] });
    const scrub = makeWorld({ width: 20, height: 20, terrain: TERRAIN.SCRUB, organisms: [] });
    const sGrass = makeOrganism(grass, { x: 10, y: 10, traits: { speed: 1 } });
    const sMud = makeOrganism(mud, { x: 10, y: 10, traits: { speed: 1 } });
    const sScrub = makeOrganism(scrub, { x: 10, y: 10, traits: { speed: 1 } });
    for (const [w, s] of [
      [grass, sGrass],
      [mud, sMud],
      [scrub, sScrub],
    ]) {
      w.store.heading[s] = 0;
      setOutputs(w, s, { turn: 0, throttle: 1 });
      act(w, s);
    }
    const distGrass = grass.store.x[sGrass] - 10;
    const distMud = mud.store.x[sMud] - 10;
    const distScrub = scrub.store.x[sScrub] - 10;
    expect(distMud).toBeCloseTo(distGrass / 1.6, 5);
    expect(distScrub).toBeCloseTo(distGrass / 1.3, 5);
  });

  it('the east wall: the organism stays inside and reverses heading', () => {
    const world = makeWorld({ width: 20, height: 20, terrain: TERRAIN.GRASS, organisms: [] });
    // Start within one tick's max movement (speed <= 0.25 tiles/tick) of
    // the wall, so a single step is guaranteed to hit it.
    const startX = 19.99;
    const slot = makeOrganism(world, { x: startX, y: 10, traits: { speed: 1 } });
    world.store.heading[slot] = 0; // +x, heading toward the wall
    setOutputs(world, slot, { turn: 0, throttle: 1 });
    act(world, slot);
    // store.x is a Float32Array: compare against the stored (rounded)
    // starting value, not the double literal.
    expect(world.store.x[slot]).toBe(Math.fround(startX));
    expect(world.store.y[slot]).toBe(10);
    expect(world.store.heading[slot]).toBeCloseTo(Math.PI, 5);
  });

  it('water is impassable and the heading rotates by pi/2', () => {
    const world = makeWorld({
      width: 20,
      height: 20,
      terrain: (x) => (x >= 12 ? TERRAIN.WATER : TERRAIN.GRASS),
      organisms: [],
    });
    // Start within one tick's max movement (speed <= 0.25 tiles/tick) of
    // the water boundary at x=12, so a single step is guaranteed to reach it.
    const startX = 11.9;
    const slot = makeOrganism(world, { x: startX, y: 10, traits: { speed: 1 } });
    world.store.heading[slot] = 0; // +x, straight into the water
    setOutputs(world, slot, { turn: 0, throttle: 1 });
    act(world, slot);
    expect(world.store.x[slot]).toBe(Math.fround(startX));
    expect(world.store.y[slot]).toBe(10);
    expect(world.store.heading[slot]).toBeCloseTo(Math.PI / 2, 5);
  });

  it('movement.enabled = false freezes positions and heading', () => {
    const world = makeWorld({
      width: 20,
      height: 20,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: { movement: { enabled: false } },
    });
    const slot = makeOrganism(world, { x: 10, y: 10, traits: { speed: 1 } });
    world.store.heading[slot] = 0;
    setOutputs(world, slot, { turn: 0.5, throttle: 1 });
    act(world, slot);
    expect(world.store.x[slot]).toBe(10);
    expect(world.store.y[slot]).toBe(10);
    expect(world.store.heading[slot]).toBe(0);
  });
});
