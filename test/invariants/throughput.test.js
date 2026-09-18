import { describe, it, expect } from 'vitest';
import { makeWorld, stepN } from '../helpers.js';

// SPEC §8: >= 2,000 ticks/s on a GitHub runner, 64x40 world, 200 organisms.
// A PR that regresses this by more than 10% fails CI.
describe('throughput invariant', () => {
  it('a 64x40 world with 200 organisms sustains >= 2000 ticks/s', () => {
    const world = makeWorld({
      width: 64,
      height: 40,
      seed: 1,
      config: {
        genesis: {
          herbivoresPerLineage: 56, // 3 lineages * 56 = 168
          carnivoresPerLineage: 32, // 1 lineage * 32 = 32 -> 200 total
        },
      },
    });
    expect(world.store.count).toBe(200);

    stepN(world, 500); // warm-up

    const start = process.hrtime.bigint();
    stepN(world, 3000);
    const elapsedNs = process.hrtime.bigint() - start;
    const elapsedSeconds = Number(elapsedNs) / 1e9;
    const ticksPerSecond = 3000 / elapsedSeconds;

    console.log(`throughput: ${ticksPerSecond.toFixed(0)} ticks/s`);

    const minimum = Number(process.env.THROUGHPUT_MIN ?? 2000);
    expect(ticksPerSecond).toBeGreaterThanOrEqual(minimum);
  });
});
