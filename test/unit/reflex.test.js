import { describe, it, expect } from 'vitest';
import { policy, reflexLayer, OUTPUT } from '../../src/core/reflex.js';
import { INPUT } from '../../src/core/senses.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { makeWorld, makeOrganism } from '../helpers.js';
import { BRAIN_INPUTS, BRAIN_OUTPUTS } from '../../src/core/genome.js';

function bareWorld(opts = {}) {
  return makeWorld({ width: 10, height: 10, terrain: TERRAIN.GRASS, organisms: [], ...opts });
}

describe('policy', () => {
  it('flees a threat ahead by turning hard away', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5 });
    const inOff = slot * BRAIN_INPUTS;
    world.inputs[inOff + INPUT.threatProx] = 0.5;
    world.inputs[inOff + INPUT.threatCos] = 1; // threat straight ahead
    world.inputs[inOff + INPUT.threatSin] = 0;
    policy(world, slot);
    const outOff = slot * BRAIN_OUTPUTS;
    expect(Math.abs(world.outputs[outOff + OUTPUT.turn])).toBe(1);
    expect(world.outputs[outOff + OUTPUT.throttle]).toBe(1);
    expect(world.outputs[outOff + OUTPUT.eat]).toBe(0);
  });

  it('turns toward food and opens the eat gate when hungry', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5 });
    const inOff = slot * BRAIN_INPUTS;
    world.inputs[inOff + INPUT.threatProx] = 0;
    world.inputs[inOff + INPUT.foodMag] = 0.8;
    world.inputs[inOff + INPUT.foodSin] = 0.6;
    world.inputs[inOff + INPUT.hunger] = 0.5;
    policy(world, slot);
    const outOff = slot * BRAIN_OUTPUTS;
    expect(world.outputs[outOff + OUTPUT.turn]).toBeGreaterThan(0);
    expect(world.outputs[outOff + OUTPUT.eat]).toBe(1);
    expect(world.outputs[outOff + OUTPUT.throttle]).toBeCloseTo(0.7, 6);
  });

  it('wanders with a bounded random turn when nothing is sensed', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5 });
    const inOff = slot * BRAIN_INPUTS;
    world.inputs[inOff + INPUT.threatProx] = 0;
    world.inputs[inOff + INPUT.foodMag] = 0;
    policy(world, slot);
    const outOff = slot * BRAIN_OUTPUTS;
    expect(world.outputs[outOff + OUTPUT.turn]).toBeGreaterThanOrEqual(-0.3);
    expect(world.outputs[outOff + OUTPUT.turn]).toBeLessThanOrEqual(0.3);
    expect(world.outputs[outOff + OUTPUT.throttle]).toBeCloseTo(0.4, 6);
    expect(world.outputs[outOff + OUTPUT.eat]).toBe(0);
  });

  it('always sets breed = 1 and every emit to 0', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5 });
    policy(world, slot);
    const outOff = slot * BRAIN_OUTPUTS;
    expect(world.outputs[outOff + OUTPUT.breed]).toBe(1);
    expect(world.outputs[outOff + OUTPUT.emit0]).toBe(0);
    expect(world.outputs[outOff + OUTPUT.emit1]).toBe(0);
    expect(world.outputs[outOff + OUTPUT.emit2]).toBe(0);
    expect(world.outputs[outOff + OUTPUT.emit3]).toBe(0);
  });
});

describe('reflexLayer', () => {
  it('forces eat on a food tile when hungry and stops movement while eating', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5, energy: 1 }); // very hungry
    world.plants[5 * world.width + 5] = 0.5;
    const outOff = slot * BRAIN_OUTPUTS;
    world.outputs[outOff + OUTPUT.eat] = 0;
    world.outputs[outOff + OUTPUT.throttle] = 0.7;
    reflexLayer(world, slot);
    expect(world.outputs[outOff + OUTPUT.eat]).toBe(1);
    expect(world.outputs[outOff + OUTPUT.throttle]).toBe(0);
  });

  it('does not force eat when not hungry enough, even on a food tile', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5 }); // full energy by default
    world.plants[5 * world.width + 5] = 0.5;
    const outOff = slot * BRAIN_OUTPUTS;
    world.outputs[outOff + OUTPUT.eat] = 0;
    world.outputs[outOff + OUTPUT.throttle] = 0.7;
    reflexLayer(world, slot);
    expect(world.outputs[outOff + OUTPUT.eat]).toBe(0);
    // world.outputs is a Float32Array; compare against the stored value.
    expect(world.outputs[outOff + OUTPUT.throttle]).toBe(Math.fround(0.7));
  });

  it('does not force eat on a bare (no plants, no carcass) tile even when starving', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 5, y: 5, energy: 1 });
    // World construction seeds every grass tile with initial plants
    // (SPEC §4.4 plants.initialFill); zero this one to make it genuinely bare.
    world.plants[5 * world.width + 5] = 0;
    const outOff = slot * BRAIN_OUTPUTS;
    world.outputs[outOff + OUTPUT.eat] = 0;
    reflexLayer(world, slot);
    expect(world.outputs[outOff + OUTPUT.eat]).toBe(0);
  });
});
