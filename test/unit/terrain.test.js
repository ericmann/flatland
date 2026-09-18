import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { generateTerrain, TERRAIN_NAMES } from '../../src/core/terrain.js';

const testCfg = makeConfig({ world: { width: 64, height: 40 } });

describe('generateTerrain', () => {
  it('seeded generation is stable: same seed gives an identical Uint8Array', () => {
    const a = generateTerrain(42, testCfg);
    const b = generateTerrain(42, testCfg);
    expect(a.terrain).toEqual(b.terrain);
    expect(a.rerolls).toBe(b.rerolls);
  });

  it('different seeds give different terrain', () => {
    const a = generateTerrain(1, testCfg);
    const b = generateTerrain(2, testCfg);
    expect(a.terrain).not.toEqual(b.terrain);
  });

  it('every tile is one of the six known types', () => {
    const { terrain } = generateTerrain(7, testCfg);
    for (let i = 0; i < terrain.length; i++) {
      expect(terrain[i]).toBeGreaterThanOrEqual(0);
      expect(terrain[i]).toBeLessThanOrEqual(5);
    }
    expect(TERRAIN_NAMES.length).toBe(6);
  });

  it('the default size satisfies the grass and water contiguity guarantees for seeds 1..10', () => {
    const defaultCfg = makeConfig();
    for (let seed = 1; seed <= 10; seed++) {
      const { grassFraction, waterFraction } = generateTerrain(seed, defaultCfg);
      expect(grassFraction).toBeGreaterThanOrEqual(defaultCfg.terrain.minGrassFraction);
      expect(waterFraction).toBeGreaterThanOrEqual(defaultCfg.terrain.minWaterFraction);
    }
  });

  it('reports how many rerolls it took', () => {
    const { rerolls } = generateTerrain(3, testCfg);
    expect(rerolls).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(rerolls)).toBe(true);
  });

  it('a config whose thresholds make grass impossible rerolls then throws with a clear message', () => {
    const impossible = makeConfig({
      world: { width: 64, height: 40 },
      terrain: {
        thresholds: { water: 0, sand: 0, mud: 0, grass: 0, scrub: 0 },
        maxRerolls: 2,
      },
    });
    // With grass=0 threshold, no value can ever land in [mud, grass) — the
    // grass band is empty, so the grass guarantee can never be met.
    expect(() => generateTerrain(1, impossible)).toThrow(/terrain: no valid map after/);
  });
});
