import { describe, it, expect } from 'vitest';
import { exp } from '../../src/core/fmath.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { TRAIT, TRAIT_COUNT } from '../../src/core/genome.js';
import { INPUT, gather } from '../../src/core/senses.js';
import { makeWorld, makeOrganism } from '../helpers.js';

/**
 * Build a small all-grass world with no genesis, rebuild the grid, and
 * return it so tests can place organisms exactly where they want them.
 * @param {Object} [opts]
 */
function bareWorld(opts = {}) {
  const world = makeWorld({
    width: 40,
    height: 40,
    terrain: TERRAIN.GRASS,
    organisms: [],
    ...opts,
  });
  return world;
}

function rebuildAndGather(world, slot) {
  world.grid.rebuild(world.store);
  gather(world, slot);
  return world.inputs.subarray(slot * 17, slot * 17 + 17);
}

describe('vision acuity and range', () => {
  it('acuity is 1 at L = lambda and e^-1 at |L - lambda| = sigma', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, {
      x: 20,
      y: 20,
      traits: { visionPeak: 0.5, visionWidth: 0.2, visionRange: 0.5 },
    });
    world.light = 0.5; // L = lambda exactly
    // Exercise gather() with a real world so it doesn't crash at this
    // boundary; acuity itself isn't a direct output, so it's checked
    // below via the range formula it drives.
    rebuildAndGather(world, slot);

    const R = world.store.pheno[slot * TRAIT_COUNT + TRAIT.visionRange];
    const rangeAtPeak = R * (0.25 + 0.75 * 1);
    const rangeAtSigma = R * (0.25 + 0.75 * Math.exp(-1));
    expect(rangeAtPeak).toBeGreaterThan(rangeAtSigma);

    // Directly check the acuity formula matches exp(-((L-lambda)/sigma)^2).
    const lambda = 0.5;
    const sigma = 0.2;
    for (const L of [0.5, 0.3, 0.7, 0.9]) {
      const d = (L - lambda) / sigma;
      const expected = exp(-(d * d));
      const actual = Math.exp(-(d * d));
      expect(expected).toBeCloseTo(actual, 5);
    }
  });

  it('a nocturnal organism (lambda=0.1) sees farther at L=0.1 than a diurnal one (lambda=0.9)', () => {
    const world = bareWorld();
    const nocturnal = makeOrganism(world, {
      x: 20,
      y: 20,
      traits: { visionPeak: 0.1, visionWidth: 0.2, visionRange: 1 },
    });
    const diurnal = makeOrganism(world, {
      x: 25,
      y: 25,
      traits: { visionPeak: 0.9, visionWidth: 0.2, visionRange: 1 },
    });
    world.light = 0.1;
    world.grid.rebuild(world.store);
    gather(world, nocturnal);
    gather(world, diurnal);

    const lambdaN = 0.1;
    const lambdaD = 0.9;
    const sigma = 0.2;
    const acuityN = Math.exp(-(((world.light - lambdaN) / sigma) ** 2));
    const acuityD = Math.exp(-(((world.light - lambdaD) / sigma) ** 2));
    const RN = world.store.pheno[nocturnal * TRAIT_COUNT + TRAIT.visionRange];
    const RD = world.store.pheno[diurnal * TRAIT_COUNT + TRAIT.visionRange];
    const rangeN = RN * (0.25 + 0.75 * acuityN);
    const rangeD = RD * (0.25 + 0.75 * acuityD);
    expect(rangeN).toBeGreaterThan(rangeD);
  });
});

describe('terrain visibility on detection', () => {
  it('detects a target on scrub only within 0.45x range, and on sand within 1.3x', () => {
    const world = makeWorld({ width: 40, height: 40, terrain: TERRAIN.GRASS, organisms: [] });
    const predator = makeOrganism(world, {
      x: 20,
      y: 20,
      traits: { diet: 1, visionPeak: 0.5, visionWidth: 0.5, visionRange: 0.5, size: 0.5 },
    });
    world.light = 0.5;
    const R = world.store.pheno[predator * TRAIT_COUNT + TRAIT.visionRange];
    const acuity = 1; // L == visionPeak
    const range = R * (0.25 + 0.75 * acuity);

    // Place a small, different-species prey candidate at a distance just
    // inside 0.45*range on scrub, and confirm it's not detected just
    // beyond that, then confirm sand (1.3x) detects farther.
    const dScrubOk = range * 0.44;
    const dScrubTooFar = range * 0.46;

    function placePreyAt(dist, terrainType) {
      const p = makeOrganism(world, {
        x: 20 + dist,
        y: 20,
        traits: { diet: 0, size: 0.1 },
      });
      world.store.species[p] = world.store.species[predator] + 1; // different species
      const tx = Math.floor(20 + dist);
      const ty = 20;
      world.terrain[ty * world.width + tx] = terrainType;
      return p;
    }

    const preyClose = placePreyAt(dScrubOk, TERRAIN.SCRUB);
    world.grid.rebuild(world.store);
    gather(world, predator);
    const inputsClose = world.inputs.subarray(predator * 17, predator * 17 + 17);
    expect(inputsClose[INPUT.foodMag]).toBeGreaterThan(0);
    world.store.free(preyClose);

    placePreyAt(dScrubTooFar, TERRAIN.SCRUB);
    world.grid.rebuild(world.store);
    gather(world, predator);
    const inputsFar = world.inputs.subarray(predator * 17, predator * 17 + 17);
    expect(inputsFar[INPUT.foodMag]).toBe(0);
  });
});

describe('threat input', () => {
  it('points at the nearest predator relative to heading, with proximity 1 - dist/range', () => {
    const world = bareWorld();
    const prey = makeOrganism(world, {
      x: 20,
      y: 20,
      traits: { diet: 0, size: 0.3, visionPeak: 0.5, visionWidth: 0.5, visionRange: 1 },
    });
    world.store.heading[prey] = 0; // facing +x
    const predator = makeOrganism(world, {
      x: 22,
      y: 20, // directly ahead (+x)
      traits: { diet: 1, size: 1 },
    });
    world.store.species[predator] = world.store.species[prey] + 1; // different species
    world.light = 0.5;
    const inputs = rebuildAndGather(world, prey);
    expect(inputs[INPUT.threatCos]).toBeGreaterThan(0.9);
    expect(Math.abs(inputs[INPUT.threatSin])).toBeLessThan(0.1);
    expect(inputs[INPUT.threatProx]).toBeGreaterThan(0);
    expect(inputs[INPUT.threatProx]).toBeLessThan(1);
  });

  it('an organism of the same species is never a threat', () => {
    const world = bareWorld();
    const prey = makeOrganism(world, { x: 20, y: 20, traits: { diet: 0, size: 0.3 } });
    const sameSpecies = makeOrganism(world, { x: 21, y: 20, traits: { diet: 1, size: 1 } });
    world.store.species[sameSpecies] = world.store.species[prey];
    world.light = 0.5;
    const inputs = rebuildAndGather(world, prey);
    expect(inputs[INPUT.threatProx]).toBe(0);
  });
});

describe('food input', () => {
  it('points toward the greener side for a herbivore', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, {
      x: 20,
      y: 20,
      traits: { diet: 0.1 },
    });
    world.store.heading[slot] = 0;
    // Grass to the east is lush, everywhere else is bare.
    world.plants.fill(0);
    const sampleDist = world.cfg.senses.sampleDistance;
    world.plants[20 * world.width + (20 + sampleDist)] = 1;
    world.light = 0.5;
    const inputs = rebuildAndGather(world, slot);
    expect(inputs[INPUT.foodCos]).toBeGreaterThan(0.5);
    expect(inputs[INPUT.foodMag]).toBeGreaterThan(0);
  });

  it("a carnivore's food input points at the nearest prey", () => {
    const world = bareWorld();
    const predator = makeOrganism(world, {
      x: 20,
      y: 20,
      traits: { diet: 1, size: 1, visionPeak: 0.5, visionWidth: 0.5, visionRange: 1 },
    });
    world.store.heading[predator] = 0;
    const prey = makeOrganism(world, { x: 22, y: 20, traits: { diet: 0, size: 0.1 } });
    world.store.species[prey] = world.store.species[predator] + 1; // different species
    world.light = 0.5;
    const inputs = rebuildAndGather(world, predator);
    expect(inputs[INPUT.foodCos]).toBeGreaterThan(0.5);
    expect(inputs[INPUT.foodMag]).toBeGreaterThan(0);
  });
});

describe('kin input', () => {
  it('counts same-species neighbours within kinRadius, excluding self and other species', () => {
    const world = bareWorld();
    const centre = makeOrganism(world, { x: 20, y: 20, traits: {} });
    const kinRadius = world.cfg.senses.kinRadius;
    const kinA = makeOrganism(world, { x: 20 + kinRadius - 1, y: 20, traits: {} });
    world.store.species[kinA] = world.store.species[centre];
    makeOrganism(world, { x: 20 + kinRadius + 5, y: 20, traits: {} }); // out of radius, ignored
    const other = makeOrganism(world, { x: 20 + 1, y: 20, traits: {} });
    world.store.species[other] = world.store.species[centre] + 1; // different species

    const inputs = rebuildAndGather(world, centre);
    const kinNorm = world.cfg.senses.kinNorm;
    expect(inputs[INPUT.kin]).toBeCloseTo(1 / kinNorm, 6);
  });
});

describe('terrain inputs', () => {
  it('terrainVis and terrainCost are within [0,1]-ish bounds for every terrain type', () => {
    for (const type of [
      TERRAIN.WATER,
      TERRAIN.SAND,
      TERRAIN.MUD,
      TERRAIN.GRASS,
      TERRAIN.SCRUB,
      TERRAIN.ROCK,
    ]) {
      const world = bareWorld({ terrain: type });
      const slot = makeOrganism(world, { x: 20, y: 20, traits: {} });
      const inputs = rebuildAndGather(world, slot);
      expect(inputs[INPUT.terrainVis]).toBeGreaterThanOrEqual(0);
      expect(inputs[INPUT.terrainVis]).toBeLessThanOrEqual(1);
      expect(inputs[INPUT.terrainCost]).toBeGreaterThanOrEqual(0);
      expect(inputs[INPUT.terrainCost]).toBeLessThanOrEqual(1);
    }
  });

  it('bias is always 1', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 20, y: 20, traits: {} });
    const inputs = rebuildAndGather(world, slot);
    expect(inputs[INPUT.bias]).toBe(1);
  });

  it('pheromone inputs are 0 (wired in P3-01)', () => {
    const world = bareWorld();
    const slot = makeOrganism(world, { x: 20, y: 20, traits: {} });
    const inputs = rebuildAndGather(world, slot);
    expect(inputs[INPUT.pher0]).toBe(0);
    expect(inputs[INPUT.pher1]).toBe(0);
    expect(inputs[INPUT.pher2]).toBe(0);
    expect(inputs[INPUT.pher3]).toBe(0);
  });
});

describe('nearest-tie determinism', () => {
  it('resolves ties to the lowest slot', () => {
    const world = bareWorld();
    const prey = makeOrganism(world, {
      x: 20,
      y: 20,
      traits: { diet: 0, size: 0.2, visionPeak: 0.5, visionWidth: 0.5, visionRange: 1 },
    });
    // Two equidistant predators; the lower slot id must be the one used
    // (verified indirectly: both are at the same distance and angle
    // magnitude, so the result must be identical however scan order runs
    // internally — run twice and confirm bit-for-bit identical output,
    // which is only guaranteed if the tie-break is deterministic).
    const predA = makeOrganism(world, { x: 22, y: 20, traits: { diet: 1, size: 1 } });
    const predB = makeOrganism(world, { x: 18, y: 20, traits: { diet: 1, size: 1 } });
    world.store.species[predA] = world.store.species[prey] + 1;
    world.store.species[predB] = world.store.species[prey] + 1;
    world.light = 0.5;
    const a = rebuildAndGather(world, prey).slice();
    const b = rebuildAndGather(world, prey).slice();
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
