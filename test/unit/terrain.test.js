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
    // Seeds far enough apart (> maxRerolls) that their possible re-roll
    // ranges [seed, seed+maxRerolls] can never overlap: adjacent seeds can
    // coincidentally collide when the lower one re-rolls into the higher
    // one's un-rerolled attempt (both end up generating from the same
    // effective seed), which is not a bug — it's the "re-roll with seed+1"
    // mechanism (SPEC §4.2) working as specified.
    const a = generateTerrain(100, testCfg);
    const b = generateTerrain(500, testCfg);
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

  it('seeds 1..40 need at most 2 rerolls in total, at the default size (P0-06 tuning target)', () => {
    const defaultCfg = makeConfig();
    // "at most 2 rerolls in total" tracks the P0-06 tuning target of
    // "rerolls needed on <= 2 of 40 seeds": count seeds that needed any
    // reroll at all, not the sum of every individual reroll attempt.
    let seedsNeedingReroll = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { rerolls } = generateTerrain(seed, defaultCfg);
      if (rerolls > 0) seedsNeedingReroll++;
    }
    expect(seedsNeedingReroll).toBeLessThanOrEqual(2);
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
