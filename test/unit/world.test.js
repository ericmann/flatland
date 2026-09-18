import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { World } from '../../src/core/world.js';
import { runGenesis } from '../../src/core/genesis.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { lightAt } from '../../src/core/light.js';
import { alive, makeWorld } from '../helpers.js';

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
