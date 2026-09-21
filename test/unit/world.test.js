import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { World } from '../../src/core/world.js';
import { runGenesis } from '../../src/core/genesis.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { lightAt } from '../../src/core/light.js';
import { gather } from '../../src/core/senses.js';
import { policy, OUTPUT } from '../../src/core/reflex.js';
import { genomeLength, BRAIN_OUTPUTS, TRAIT_COUNT } from '../../src/core/genome.js';
import { alive, makeWorld, isolate } from '../helpers.js';

describe('genesis', () => {
  it('places every organism on a non-water tile inside the map', () => {
    const world = makeWorld({ seed: 3 });
    for (const slot of alive(world)) {
      const x = world.store.x[slot];
      const y = world.store.y[slot];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(world.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(world.height);
      const type = world.terrain[Math.floor(y) * world.width + Math.floor(x)];
      expect(type).not.toBe(TERRAIN.WATER);
    }
  });

  it('genesis counts match config (3 x 50 herbivores + 1 x 24 carnivores)', () => {
    const world = makeWorld({ seed: 5 });
    const g = world.cfg.genesis;
    const expected =
      g.herbivoreLineages * g.herbivoresPerLineage + g.carnivoreLineages * g.carnivoresPerLineage;
    expect(alive(world).length).toBe(expected);
    expect(world.store.count).toBe(expected);
  });

  it('is skipped when makeWorld is given an organisms list, even empty', () => {
    const world = makeWorld({ seed: 1, organisms: [] });
    expect(alive(world).length).toBe(0);
  });
});

describe('World.step', () => {
  it('increments tick and updates light to match lightAt(tick, cfg)', () => {
    const world = makeWorld({ seed: 1, organisms: [] });
    expect(world.tick).toBe(0);
    world.step();
    expect(world.tick).toBe(1);
    expect(world.light).toBe(lightAt(1, world.cfg));
    world.step();
    expect(world.tick).toBe(2);
    expect(world.light).toBe(lightAt(2, world.cfg));
  });
});

describe('World.hash', () => {
  it('is stable for two identical worlds and changes after a step', () => {
    const a = makeWorld({ seed: 7, organisms: [] });
    const b = makeWorld({ seed: 7, organisms: [] });
    expect(a.hash()).toBe(b.hash());
    const beforeHash = a.hash();
    a.step();
    expect(a.hash()).not.toBe(beforeHash);
  });

  it('covers rng state: advancing rng alone changes the hash', () => {
    const a = makeWorld({ seed: 9, organisms: [] });
    const b = makeWorld({ seed: 9, organisms: [] });
    const before = a.hash();
    a.rng.next();
    expect(a.hash()).not.toBe(before);
    expect(b.hash()).toBe(before);
  });

  it('returns a hex string', () => {
    const world = makeWorld({ seed: 1, organisms: [] });
    expect(world.hash()).toMatch(/^[0-9a-f]+$/);
  });
});

describe('World construction', () => {
  it('allocates all four pheromone grids, sized to the world', () => {
    const world = makeWorld({
      width: 20,
      height: 15,
      seed: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
    });
    expect(world.pher.length).toBe(4);
    for (const p of world.pher) {
      expect(p).toBeInstanceOf(Float32Array);
      expect(p.length).toBe(20 * 15);
      expect(p.every((v) => v === 0)).toBe(true);
    }
  });

  it('allocates plants, carcass and soil grids sized to the world', () => {
    // A prebuilt terrain bypasses seeded generation, which real terrain
    // generation cannot satisfy at such a tiny size (too small for the
    // 8%/2% contiguity guarantee) — this test only checks array sizing.
    const world = makeWorld({
      width: 10,
      height: 8,
      seed: 1,
      terrain: TERRAIN.GRASS,
      organisms: [],
    });
    expect(world.plants.length).toBe(80);
    expect(world.carcass.length).toBe(80);
    expect(world.soil.length).toBe(80);
  });

  it('a prebuilt terrain bypasses seeded generation', () => {
    const world = makeWorld({ width: 5, height: 5, terrain: TERRAIN.GRASS, organisms: [] });
    expect(world.terrain.every((t) => t === TERRAIN.GRASS)).toBe(true);
  });

  it('accepts a real makeConfig() result directly (not just via the test helper)', () => {
    const cfg = makeConfig({ world: { width: 8, height: 6 } });
    const world = new World(cfg, 42, { terrain: new Uint8Array(48).fill(TERRAIN.GRASS) });
    expect(world.width).toBe(8);
    expect(world.height).toBe(6);
    runGenesis(world);
    expect(world.store.count).toBeGreaterThan(0);
  });
});

describe('brain vs. reflex policy wiring (P2-03)', () => {
  it("with brain.enabled = false the reflex policy runs (outputs equal the policy's)", () => {
    // Full energy (no hunger) and no threat/food gradient near the
    // organism, so reflexLayer's force-eat never fires and act() never
    // touches outputs: the full step() pipeline should leave outputs
    // exactly as policy() (not the brain) set them.
    const opts = {
      width: 20,
      height: 20,
      seed: 1,
      terrain: TERRAIN.GRASS,
      config: isolate('movement'),
      organisms: [{ x: 10, y: 10 }],
    };
    const stepped = makeWorld(opts);
    const reference = makeWorld(opts);

    stepped.step();

    reference.tick++;
    reference.light = lightAt(reference.tick, reference.cfg);
    reference.grid.rebuild(reference.store);
    gather(reference, 0);
    policy(reference, 0);

    expect(Array.from(stepped.outputs.slice(0, BRAIN_OUTPUTS))).toEqual(
      Array.from(reference.outputs.slice(0, BRAIN_OUTPUTS)),
    );
  });

  it('the reflex layer forces eat on food when hungry even if the brain says otherwise', () => {
    const world = makeWorld({
      width: 20,
      height: 20,
      seed: 1,
      terrain: TERRAIN.GRASS,
      config: isolate('movement', 'plants', 'brain'),
      organisms: [{ x: 10, y: 10, energy: 1 }], // very hungry
    });
    // Zero every weight gene: the brain's own prediction for `eat` is
    // sigmoid of a strongly negative bias (weight = (0 - 0.5)*2*scale), i.e.
    // "don't eat" — the reflex layer must override this when hungry on food.
    const gLen = genomeLength(world.cfg);
    world.store.genome.fill(0, TRAIT_COUNT, gLen); // slot 0's own weight block
    world.plants.fill(1); // food present under the organism

    world.step();

    expect(world.outputs[OUTPUT.eat]).toBe(1);
  });
});

describe('death counters (P6-01)', () => {
  it('every death increments deaths and adds its age as a percentage of lifespan to deathAgePct', () => {
    // isolate('aging', 'metabolism'): only those two mechanics run, so the
    // only two ways to die are old age (organism 0) and starvation
    // (organism 1) — no movement, predation or breeding to interfere.
    // A shared phenotype.lifespan range of exactly 2 days at 1 tick/day
    // (both ⚠️ config, overridden here, not the real defaults) makes
    // lifespanTicks exactly 2 for every organism regardless of its
    // lifespan gene, so the expected death-age percentages are exact
    // integers rather than depending on a formula this test would have
    // to reimplement.
    const world = makeWorld({
      width: 10,
      height: 10,
      seed: 1,
      terrain: TERRAIN.GRASS,
      config: {
        ...isolate('aging', 'metabolism'),
        time: { ticksPerDay: 1 },
        phenotype: { lifespan: [2, 2] },
        metabolism: { base: 10 }, // huge relative to any organism's energy below
      },
      organisms: [
        { x: 1, y: 1, energy: 1000 }, // dies of old age on the 3rd tick (age 3 > lifespanTicks 2)
        { x: 2, y: 2, energy: 1 }, // dies of starvation on the 1st tick (cost >> energy)
      ],
    });

    world.step(); // organism 1 starves here: age 1, deathAgePct += round(100*1/2) = 50
    world.step();
    world.step(); // organism 0 dies of old age here: age 3, deathAgePct += round(100*3/2) = 150

    expect(world.counters.deaths).toBe(2);
    expect(world.counters.deathAgePct).toBe(200); // 50 + 150
  });
});
