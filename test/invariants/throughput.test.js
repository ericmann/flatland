import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeWorld } from '../helpers.js';

const PERF_SCRIPT = fileURLToPath(new URL('../../scripts/perf.mjs', import.meta.url));

// SPEC §8: >= 1,200 ticks/s on a GitHub runner, 64x40 world, 200 organisms
// (revised down from an original 2,000 ⚠️ ASSUMPTION once real GitHub-runner
// data existed -- see docs/performance.md's P5-06 findings and the
// "chore: revise the CI throughput budget" note in docs/PROGRESS.md's Log
// for the measurements behind this number).
//
// Measured via a real `node scripts/perf.mjs` child process rather than
// timed in-process here: vitest's own runtime measurably deflates a tight
// World.step() loop timed in-process -- observed ~5x slower than the
// identical scenario run as a plain Node process, on the same machine at
// the same moment, under the same load. Timing in-process would gate on
// vitest's own overhead rather than on Flatland's actual throughput.
describe('throughput invariant', () => {
  it('genesis produces exactly 200 organisms for the gate scenario', () => {
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
  });

  it('a 64x40 world with 200 organisms sustains >= 1200 ticks/s', () => {
    const stdout = execFileSync(
      process.execPath,
      [PERF_SCRIPT, '--gate-only', '--gate-ticks', '3000', '--json'],
      { encoding: 'utf8' },
    );
    const result = JSON.parse(stdout);
    const ticksPerSecond = result.gate.ticksPerSecond;

    console.log(`throughput: ${ticksPerSecond.toFixed(0)} ticks/s`);

    const minimum = Number(process.env.THROUGHPUT_MIN ?? 1200);
    expect(ticksPerSecond).toBeGreaterThanOrEqual(minimum);
  }, 30000);
});
