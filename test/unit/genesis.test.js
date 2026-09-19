import { describe, it, expect } from 'vitest';
import { makeConfig } from '../../src/core/config.js';
import { World } from '../../src/core/world.js';
import { runGenesis } from '../../src/core/genesis.js';
import { TRAIT_COUNT } from '../../src/core/genome.js';

describe('genesis: brain weight initialisation (P2-03)', () => {
  it('seeded prior founders differ only by noise (weight sd ≈ brainNoise)', () => {
    const cfg = makeConfig({ genesis: { brainPrior: 'seeded', brainNoise: 0.1 } });
    const world = new World(cfg, 1);
    runGenesis(world);
    const gLen = world.store.genomeLength;

    // W1[input=0][hidden=0] (gene offset TRAIT_COUNT) is not one of the
    // prior's six mapped inputs (foodSin/threatSin/threatProx/hunger/
    // threatCos/foodMag), so its prior value is exactly 0.5 (weight 0).
    const geneIndex = TRAIT_COUNT;
    const values = [];
    for (let i = 0; i < world.store.highWater; i++) {
      if (!world.store.alive[i]) continue;
      values.push(world.store.genome[i * gLen + geneIndex]);
    }
    expect(values.length).toBeGreaterThan(50);

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeCloseTo(0.5, 1);
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);
    expect(sd).toBeGreaterThan(cfg.genesis.brainNoise * 0.7);
    expect(sd).toBeLessThan(cfg.genesis.brainNoise * 1.3);
  });

  it('random prior gives uniform weight genes', () => {
    const cfg = makeConfig({ genesis: { brainPrior: 'random' } });
    const world = new World(cfg, 1);
    runGenesis(world);
    const gLen = world.store.genomeLength;

    const values = [];
    for (let i = 0; i < world.store.highWater; i++) {
      if (!world.store.alive[i]) continue;
      for (let k = TRAIT_COUNT; k < gLen; k++) {
        values.push(world.store.genome[i * gLen + k]);
      }
    }
    expect(values.length).toBeGreaterThan(1000);

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    // Uniform[0,1]: mean 0.5, variance 1/12.
    expect(mean).toBeCloseTo(0.5, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1 / Math.sqrt(12), 1);
  });
});
