import { describe, it, expect } from 'vitest';
import { makeWorld, stepN } from '../helpers.js';

// SPEC §3.5, §9.2: no per-tick allocation in the step. Vitest is configured
// with --expose-gc (vitest.config.js) so `global.gc` is available here.
describe('no-allocation invariant', () => {
  it('heapUsed grows less than 4 MB over 10,000 ticks after a 2,000-tick warm-up', () => {
    expect(typeof global.gc).toBe('function');

    const world = makeWorld({ seed: 1 });

    // Warm up: let JIT compilation, lazy allocations and any one-time
    // setup settle before measuring.
    stepN(world, 2000);

    global.gc();
    const before = process.memoryUsage().heapUsed;

    stepN(world, 10000);

    global.gc();
    const after = process.memoryUsage().heapUsed;

    const grownBytes = after - before;
    expect(grownBytes).toBeLessThan(4 * 1024 * 1024);
  });
});
