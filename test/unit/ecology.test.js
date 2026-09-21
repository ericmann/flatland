import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import { eatMeal } from '../../src/core/ecology.js';
import { BRAIN_OUTPUTS } from '../../src/core/genome.js';
import { KIND } from '../../src/core/chronicle.js';
import { relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { makeWorld, makeOrganism, isolate } from '../helpers.js';

const OUTPUT_EAT = 2; // reflex.js OUTPUT.eat

describe('plant growth', () => {
  it('is zero at L = 0', () => {
    const world = makeWorld({
      width: 4,
      height: 4,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    world.plants.fill(0.3);
    // Advance well into the night portion of the day (u >= f), where L is
    // exactly 0 (not just near dawn, where L is a tiny positive number).
    const nightTick = Math.floor(world.cfg.time.ticksPerDay * 0.9);
    for (let i = 0; i < nightTick; i++) world.step();
    expect(world.light).toBe(0);
    const before = world.plants.slice();
    world.step();
    expect(world.light).toBe(0);
    expect(world.plants).toEqual(before);
  });

  it('follows base = growth * L * (1 - p/cap) at soil = 0', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    world.plants.fill(0.3 * cap);
    // Advance to a tick with light > 0.
    while (world.light === 0) world.step();
    // world.step() sets world.light for the tick it just ran *before*
    // calling growPlants, so the light that applies to the *next* step is
    // only known once that next step has run — capture p now (still the
    // pre-growth value for the upcoming step), then read L back out after
    // stepping once more.
    const p = world.plants[0];
    const before = world.plants[0];
    world.step();
    const L = world.light;
    const expectedBase = world.cfg.plants.growth * L * (1 - p / cap);
    const applied = world.plants[0] - before;
    // soil is 0 everywhere, so fromSoil = 0 and want = base; no capping
    // expected here since p is well below cap.
    expect(applied).toBeCloseTo(expectedBase, 5);
  });

  it('soil raises growth and is consumed', () => {
    const noSoil = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    const withSoil = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    const cap = noSoil.cfg.terrain.plantCap[TERRAIN.GRASS];
    noSoil.plants.fill(0.3 * cap);
    withSoil.plants.fill(0.3 * cap);
    withSoil.soil.fill(1.0);
    // Advance to the first tick with light > 0 (not further: P1-11 raised
    // plants.growth enough that waiting for L >= 0.3, as this test used
    // to, saturates both worlds' plants[0] at cap well before that point,
    // making the before/after growth-rate comparison meaningless).
    while (noSoil.light === 0) {
      noSoil.step();
      withSoil.step();
    }
    const plantsNoSoilBefore = noSoil.plants[0];
    const plantsWithSoilBefore = withSoil.plants[0];
    const soilBefore = withSoil.soil[0];

    noSoil.step();
    withSoil.step();

    const growthNoSoil = noSoil.plants[0] - plantsNoSoilBefore;
    const growthWithSoil = withSoil.plants[0] - plantsWithSoilBefore;
    expect(growthWithSoil).toBeGreaterThan(growthNoSoil);
    expect(withSoil.soil[0]).toBeLessThan(soilBefore);
  });

  it('never exceeds cap', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('plants'),
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    world.plants.fill(cap - 0.0001);
    world.soil.fill(1);
    for (let i = 0; i < 500; i++) {
      world.step();
      for (const p of world.plants) {
        expect(p).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('plants.enabled = false disables growth entirely', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      // Immigration (P3-06) would otherwise repopulate this deliberately
      // empty world well within the 2000-tick budget below (its default
      // checkEvery is 600), and a grazing immigrant would perturb plants
      // for a reason unrelated to what this test checks.
      config: { plants: { enabled: false }, immigration: { enabled: false } },
    });
    const before = world.plants.slice();
    for (let i = 0; i < 2000; i++) world.step();
    expect(world.plants).toEqual(before);
  });
});

describe('regrowth debt', () => {
  it('a tile grazed to zero regrows at debtFactor × rate for debtTicks, then at the full rate', () => {
    const enabled = isolate('plants', 'regrowth');
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: { ...enabled, regrowth: { ...enabled.regrowth, debtTicks: 3, debtFactor: 0.5 } },
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    const growth = world.cfg.plants.growth;
    world.plants.fill(0.3 * cap);
    while (world.light === 0) world.step();
    // Now on a lit tick: set fresh debt and predict the next 5 ticks'
    // growth step by step from the same formula growPlants uses, using
    // the actual light each tick produces (soil stays 0 throughout, so
    // there's no soil-boost term to account for).
    world.debt.fill(world.cfg.regrowth.debtTicks);
    let debt = world.cfg.regrowth.debtTicks;
    let p = world.plants[0];
    for (let t = 0; t < 5; t++) {
      world.step();
      const L = world.light;
      let base = growth * L * (1 - p / cap);
      if (debt > 0) {
        base *= world.cfg.regrowth.debtFactor;
        debt--;
      }
      p = Math.min(cap, p + base);
      expect(world.plants[0]).toBeCloseTo(p, 4);
    }
    expect(debt).toBe(0);
    expect(world.debt[0]).toBe(0);
  });

  it('regrowth.enabled = false never sets debt', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [{ x: 1, y: 1, traits: { diet: 0 } }],
      config: { regrowth: { enabled: false, zeroThreshold: 0.5 } },
    });
    const tile = 1 * 3 + 1;
    world.plants[tile] = 0.01; // already below zeroThreshold (0.5)
    world.outputs[0 * BRAIN_OUTPUTS + OUTPUT_EAT] = 1;
    eatMeal(world, 0);
    expect(world.debt[tile]).toBe(0);
  });

  it('debt is hashed', () => {
    const world = makeWorld({ width: 3, height: 3, terrain: TERRAIN.GRASS, organisms: [] });
    const before = world.hash();
    world.debt[0] = 100;
    const after = world.hash();
    expect(after).not.toBe(before);
  });
});

describe('seasons on plant growth', () => {
  it('plant growth summed over a mid-winter day is less than over a mid-summer day', () => {
    /** Total photosynthesis over one full day starting at `yearFrac`. */
    function growthOverDayAt(yearFrac) {
      const world = makeWorld({
        width: 8,
        height: 8,
        terrain: TERRAIN.GRASS,
        organisms: [],
        config: isolate('plants'),
      });
      const DAY = world.cfg.time.ticksPerDay;
      const YEAR = world.cfg.time.daysPerYear;
      const targetTick = Math.round(yearFrac * YEAR) * DAY;
      while (world.tick < targetTick) world.step();

      // With no consumption (no organisms), plants saturate to cap well
      // before a distant target tick, leaving no headroom to measure a
      // seasonal difference; reset to a fixed, well-below-cap level right
      // before the measured day so both seasons start from the same place.
      const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
      world.plants.fill(0.3 * cap);

      const before = world.ledger.flows.photosynthesis;
      for (let t = 0; t < DAY; t++) world.step();
      return world.ledger.flows.photosynthesis - before;
    }

    const summer = growthOverDayAt(0.375); // dayFraction peaks here (SPEC §4.3)
    const winter = growthOverDayAt(0.875); // dayFraction troughs here
    expect(winter).toBeLessThan(summer);
  });
});

describe('carcass decay', () => {
  it('decays to soil, slower on mud than on grass', () => {
    const grass = makeWorld({
      width: 2,
      height: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate('carcass'),
    });
    const mud = makeWorld({
      width: 2,
      height: 1,
      terrain: TERRAIN.MUD,
      organisms: [],
      config: isolate('carcass'),
    });
    grass.carcass.fill(1);
    mud.carcass.fill(1);
    grass.step();
    mud.step();
    const grassDecayed = 1 - grass.carcass[0];
    const mudDecayed = 1 - mud.carcass[0];
    expect(mudDecayed).toBeLessThan(grassDecayed);
    expect(grass.soil[0]).toBeGreaterThan(0);
    expect(mud.soil[0]).toBeGreaterThan(0);
  });

  it('carcass.enabled = false disables decay entirely', () => {
    const world = makeWorld({
      width: 2,
      height: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: { carcass: { enabled: false } },
    });
    world.carcass.fill(1);
    for (let i = 0; i < 100; i++) world.step();
    expect(world.carcass[0]).toBe(1);
  });
});

describe('rain intervention', () => {
  it('adds up to amount per tile, capped at cap, counted as hand', () => {
    const world = makeWorld({
      width: 2,
      height: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate(),
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    world.plants.fill(0);
    world.pending.push({ tick: 1, kind: 'rain' });
    world.step();
    const amount = world.cfg.interventions.rain.amount;
    expect(world.plants[0]).toBeCloseTo(Math.min(cap, amount), 5);
    expect(world.ledger.hand).toBeCloseTo(2 * Math.min(cap, amount), 4);
    expect(world.interventions.length).toBe(1);
    expect(world.interventions[0].kind).toBe('rain');
  });

  it('caps at the tile cap even from a high starting level', () => {
    const world = makeWorld({
      width: 1,
      height: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: isolate(),
    });
    const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
    world.plants[0] = cap - 0.05;
    world.pending.push({ tick: 1, kind: 'rain' });
    world.step();
    expect(world.plants[0]).toBeLessThanOrEqual(cap);
  });
});

describe('eatMeal — grazing and scavenging', () => {
  it('grazing transfers energy at etaHerb*(1-d) and dissipates the rest', () => {
    const world = makeWorld({ width: 3, height: 3, terrain: TERRAIN.GRASS, organisms: [] });
    const slot = makeOrganism(world, { x: 1, y: 1, energy: 10, traits: { diet: 0.2 } });
    world.plants[1 * world.width + 1] = 0.05; // less than biteSize, so fully eaten
    world.outputs[slot * BRAIN_OUTPUTS + OUTPUT_EAT] = 1;
    const beforeE = world.store.energy[slot];
    const beforeP = world.plants[1 * world.width + 1];
    const dissBefore = world.ledger.dissipated;

    eatMeal(world, slot);

    const eaten = beforeP - world.plants[1 * world.width + 1];
    const gained = world.store.energy[slot] - beforeE;
    const eff = world.cfg.energy.etaHerb * (1 - 0.2);
    expect(eaten).toBeGreaterThan(0);
    expect(gained).toBeCloseTo(eaten * eff, 5);
    expect(world.ledger.dissipated - dissBefore).toBeCloseTo(eaten - gained, 5);
    expect(world.ledger.flows.grazing).toBeCloseTo(eaten, 5);
  });

  it('a full organism does not graze', () => {
    const world = makeWorld({ width: 3, height: 3, terrain: TERRAIN.GRASS, organisms: [] });
    const slot = makeOrganism(world, { x: 1, y: 1, traits: { diet: 0 } }); // energy = energyMax
    world.plants[1 * world.width + 1] = 0.5;
    world.outputs[slot * BRAIN_OUTPUTS + OUTPUT_EAT] = 1;
    const beforePlants = world.plants[1 * world.width + 1];
    eatMeal(world, slot);
    expect(world.plants[1 * world.width + 1]).toBe(beforePlants);
    expect(world.store.energy[slot]).toBe(world.store.energyMax[slot]);
  });

  it('a pure carnivore (d=1) gains nothing from plants', () => {
    const world = makeWorld({ width: 3, height: 3, terrain: TERRAIN.GRASS, organisms: [] });
    const slot = makeOrganism(world, { x: 1, y: 1, energy: 10, traits: { diet: 1 } });
    world.plants[1 * world.width + 1] = 0.5;
    world.outputs[slot * BRAIN_OUTPUTS + OUTPUT_EAT] = 1;
    const beforePlants = world.plants[1 * world.width + 1];
    eatMeal(world, slot);
    expect(world.plants[1 * world.width + 1]).toBe(beforePlants);
  });

  it('scavenging transfers energy at etaCarn*d from the carcass on the tile', () => {
    const world = makeWorld({ width: 3, height: 3, terrain: TERRAIN.GRASS, organisms: [] });
    const slot = makeOrganism(world, { x: 1, y: 1, energy: 10, traits: { diet: 0.9 } });
    // Genesis seeds every grass tile with initial plants (plants.initialFill);
    // zero this one so only the carcass branch of eatMeal has anything to do.
    world.plants[1 * world.width + 1] = 0;
    world.carcass[1 * world.width + 1] = 0.05;
    world.outputs[slot * BRAIN_OUTPUTS + OUTPUT_EAT] = 1;
    const beforeE = world.store.energy[slot];
    const beforeC = world.carcass[1 * world.width + 1];

    eatMeal(world, slot);

    const eaten = beforeC - world.carcass[1 * world.width + 1];
    const gained = world.store.energy[slot] - beforeE;
    const eff = world.cfg.energy.etaCarn * 0.9;
    expect(eaten).toBeGreaterThan(0);
    expect(gained).toBeCloseTo(eaten * eff, 5);
    expect(world.ledger.flows.scavenging).toBeCloseTo(eaten, 5);
  });

  it('does not eat when the eat output is below 0.5', () => {
    const world = makeWorld({ width: 3, height: 3, terrain: TERRAIN.GRASS, organisms: [] });
    const slot = makeOrganism(world, { x: 1, y: 1, energy: 10, traits: { diet: 0 } });
    world.plants[1 * world.width + 1] = 0.5;
    world.outputs[slot * BRAIN_OUTPUTS + OUTPUT_EAT] = 0.4;
    const before = world.plants[1 * world.width + 1];
    eatMeal(world, slot);
    expect(world.plants[1 * world.width + 1]).toBe(before);
  });
});

describe('immigration', () => {
  function immigrationWorld(config = {}) {
    return makeWorld({
      width: 64,
      height: 40,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: {
        immigration: {
          checkEvery: 10,
          floorHerbivores: 4,
          floorCarnivores: 4,
          cooldownTicks: 100,
          groupSize: 4,
          ...config,
        },
      },
    });
  }

  it('immigration fires at the floor, at an edge, with groupSize members and a migration entry', () => {
    const world = immigrationWorld();
    world.chronicle.flush();

    for (let t = 0; t < world.cfg.immigration.checkEvery; t++) world.step();

    expect(world.counters.immigrations).toBeGreaterThanOrEqual(1);
    expect(world.store.count).toBeGreaterThanOrEqual(world.cfg.immigration.groupSize);

    let onEdge = false;
    for (let i = 0; i < world.store.highWater; i++) {
      if (!world.store.alive[i]) continue;
      const x = world.store.x[i];
      const y = world.store.y[i];
      if (x === 0.5 || x === world.width - 0.5 || y === 0.5 || y === world.height - 0.5) {
        onEdge = true;
      }
    }
    expect(onEdge).toBe(true);

    const entries = world.chronicle.flush() ?? [];
    expect(entries.some((e) => e.kind === KIND.MIGRATION)).toBe(true);
  });

  it('not again before cooldownTicks', () => {
    // A floor well above groupSize, so the population stays below it after
    // one arrival — the cooldown, not the floor, is what should block the
    // next check.
    const world = immigrationWorld({
      floorHerbivores: 10,
      floorCarnivores: 10,
      groupSize: 4,
      cooldownTicks: 1000,
    });
    for (let t = 0; t < world.cfg.immigration.checkEvery; t++) world.step();
    const firstCount = world.counters.immigrations;
    expect(firstCount).toBeGreaterThanOrEqual(1);

    for (let t = 0; t < world.cfg.immigration.checkEvery * 5; t++) world.step();
    expect(world.counters.immigrations).toBe(firstCount);
  });

  it('the new species descends from the extinct one', () => {
    const world = immigrationWorld({ floorHerbivores: 100, floorCarnivores: 0 });
    const extinctId = world.species.create(world, 0, -1, 5, 5);
    world.species.dietClassAtBirth[extinctId] = 0; // herbivore
    world.species.died[extinctId] = 5;
    world.species.count[extinctId] = 0;

    for (let t = 0; t < world.cfg.immigration.checkEvery; t++) world.step();

    let descendsFromExtinct = false;
    for (let id = 0; id < world.species.n; id++) {
      if (world.species.ancestor[id] === extinctId) descendsFromExtinct = true;
    }
    expect(descendsFromExtinct).toBe(true);
  });

  it('immigration.enabled = false never fires', () => {
    const world = immigrationWorld({ enabled: false });
    for (let t = 0; t < world.cfg.immigration.checkEvery * 5; t++) world.step();
    expect(world.counters.immigrations).toBe(0);
    expect(world.store.count).toBe(0);
  });
});

describe('plant stock at a raised scale (P6-02)', () => {
  // A P6-02-scale grass cap (40 energy units/tile, vs. the ≤1 defaults),
  // confirming the growth formula, biteSize and the energy ledger all
  // still behave correctly once "a full tile" is no longer 1.
  const PLANT_CAP = Object.freeze([0, 0, 14, 40, 24, 0]);

  it('a grass tile grows toward its (raised) cap and never exceeds it', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      // growth raised well above any real default just for this test, so
      // it reaches most of the way to cap in a bounded number of ticks
      // regardless of whatever P6-03 tunes the real default to.
      config: { ...isolate('plants'), terrain: { plantCap: PLANT_CAP }, plants: { growth: 2 } },
    });
    const cap = PLANT_CAP[TERRAIN.GRASS];
    world.plants.fill(0);
    for (let t = 0; t < 2000; t++) {
      world.step();
      expect(world.plants[0]).toBeLessThanOrEqual(cap);
    }
    expect(world.plants[0]).toBeGreaterThan(cap * 0.5);
  });

  it('a bite removes exactly biteSize energy units regardless of the cap scale', () => {
    const world = makeWorld({
      width: 3,
      height: 3,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: {
        terrain: { plantCap: PLANT_CAP },
        organisms: { biteSize: 0.3 },
      },
    });
    const slot = makeOrganism(world, { x: 1, y: 1, energy: 10, traits: { diet: 0 } });
    world.plants[1 * world.width + 1] = PLANT_CAP[TERRAIN.GRASS]; // tile is full (40, not 1)
    world.outputs[slot * BRAIN_OUTPUTS + OUTPUT_EAT] = 1;
    const beforeP = world.plants[1 * world.width + 1];

    eatMeal(world, slot);

    const eaten = beforeP - world.plants[1 * world.width + 1];
    expect(eaten).toBeCloseTo(0.3, 5); // plenty of room to eat a full bite, plenty of plants left
  });

  it('the energy ledger closes to 1e-6 relative with growth, grazing and metabolism at the raised scale', () => {
    const world = makeWorld({
      width: 10,
      height: 10,
      terrain: TERRAIN.GRASS,
      organisms: [],
      config: {
        ...isolate('plants', 'metabolism'),
        terrain: { plantCap: PLANT_CAP },
        organisms: { biteSize: 0.3 },
        plants: { growth: 0.02 },
      },
    });
    makeOrganism(world, { x: 5, y: 5, energy: 20, traits: { diet: 0 } }); // hungry: reflexLayer forces eat on food
    initGenesisLedger(world);

    for (let t = 0; t < 2000; t++) world.step();

    expect(relativeError(world)).toBeLessThan(1e-6);
  });
});
