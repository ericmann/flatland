import { describe, it, expect } from 'vitest';
import { makeWorld } from '../helpers.js';

// SPEC §9.2: no organism position outside the grid, no NaN, living energy
// within [0, energyMax], over seeded runs.
describe('bounds invariant', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}: positions stay in bounds, no NaN, energy in [0, energyMax], over 5000 ticks`, () => {
      const world = makeWorld({ seed });
      for (let t = 0; t < 5000; t++) {
        world.step();
        for (let i = 0; i < world.store.highWater; i++) {
          if (!world.store.alive[i]) continue;
          const x = world.store.x[i];
          const y = world.store.y[i];
          const energy = world.store.energy[i];
          const heading = world.store.heading[i];

          expect(Number.isNaN(x)).toBe(false);
          expect(Number.isNaN(y)).toBe(false);
          expect(Number.isNaN(energy)).toBe(false);
          expect(Number.isNaN(heading)).toBe(false);

          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(world.width);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(world.height);

          expect(energy).toBeGreaterThanOrEqual(0);
          expect(energy).toBeLessThanOrEqual(world.store.energyMax[i] + 1e-3);
        }
      }
    });
  }
});
