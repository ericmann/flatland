import { describe, it, expect, beforeAll } from 'vitest';
import { relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { dietClass, visionClass, TRAIT_COUNT, TRAIT } from '../../src/core/genome.js';
import { makeWorld } from '../helpers.js';

// H_MIN ⚠️ ASSUMPTION (SPEC §9.3): minimum acceptable mean Shannon
// diversity for a healthy multi-species population at the Phase 3 exit
// soak. Set well below the P3-10 sweep's observed mean (~1.6-2.1 over
// 40 seeds at 100,000 ticks under the tuned regrowth defaults,
// docs/sweeps/p3-10-after.txt) so it only fails on a genuine collapse
// toward monoculture, not on ordinary seed variance.
const H_MIN = 0.8;

const TICKS = 100000;

// Pinned seeds (P3-10 sweep, docs/sweeps/p3-10-after.txt; see
// docs/tuning.md "P3-10 pressure tuning" for the full before/after
// tables). Both clear every assertion below with comfortable margin at
// 100,000 ticks under the tuned regrowth defaults (regrowth.debtFactor
// 0.1, regrowth.debtTicks 10800):
//   seed 8:  pop 39, herb 23, carn 9, 12 living species, H 1.816,
//            max species share 20.5%, 99 splits, 142 extinctions,
//            vision classes 10/22/7 (all three represented).
//   seed 39: pop 42, herb 20, carn 10, 14 living species, H 2.060,
//            max species share 19.0%, 57 splits, 94 extinctions,
//            vision classes 3/13/26 (all three represented).
// Chosen over the other 38 sweep seeds (all of which also pass) for the
// combination of high diversity, low dominance and multi-class vision —
// margin on every target, not just the minimum ones.
const PINNED_SEEDS = [8, 39];

describe.each(PINNED_SEEDS)('full soak: seed %d, 100,000 ticks (SPEC §9.3)', (seed) => {
  const world = makeWorld({ width: 256, height: 160, seed });
  initGenesisLedger(world);

  let neverZero = true;
  let noNaN = true;
  let inBounds = true;
  let sampleCount = 0;
  let overShareCount = 0;

  // A synchronous 100,000-tick loop blocks the event loop for minutes on
  // a busy machine; vitest's default 10s hook timeout only fires once
  // this returns, but the explicit timeout still needs raising so it
  // doesn't report a false failure while genuinely still stepping.
  beforeAll(() => {
    const sampleEvery = world.cfg.stats.sampleEvery;
    for (let t = 1; t <= TICKS; t++) {
      world.step();
      if (world.store.count === 0) neverZero = false;

      if (t % sampleEvery === 0) {
        sampleCount++;
        let maxCount = 0;
        for (let id = 0; id < world.species.n; id++) {
          if (world.species.count[id] > maxCount) maxCount = world.species.count[id];
        }
        if (world.store.count > 0 && maxCount / world.store.count > 0.7) overShareCount++;
      }

      if (t % 1000 === 0) {
        for (let i = 0; i < world.store.highWater; i++) {
          if (!world.store.alive[i]) continue;
          const x = world.store.x[i];
          const y = world.store.y[i];
          const energy = world.store.energy[i];
          const heading = world.store.heading[i];
          if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(energy) || Number.isNaN(heading)) {
            noNaN = false;
          }
          if (x < 0 || x >= world.width || y < 0 || y >= world.height) inBounds = false;
        }
      }
    }
  }, 1200000);

  it('population is never zero and both herbivores and carnivores are present at the end', () => {
    expect(neverZero).toBe(true);
    let herbivores = 0;
    let carnivores = 0;
    for (let i = 0; i < world.store.highWater; i++) {
      if (!world.store.alive[i]) continue;
      const cls = dietClass(world.store.pheno[i * TRAIT_COUNT + TRAIT.diet]);
      if (cls === 'herbivore') herbivores++;
      else if (cls === 'carnivore') carnivores++;
    }
    expect(herbivores).toBeGreaterThan(0);
    expect(carnivores).toBeGreaterThan(0);
  });

  it('living species >= 3 at the end and mean Shannon diversity >= H_MIN', () => {
    let living = 0;
    for (let id = 0; id < world.species.n; id++) {
      if (world.species.died[id] === -1) living++;
    }
    expect(living).toBeGreaterThanOrEqual(3);

    expect(world.stats.n).toBeGreaterThan(0);
    let sum = 0;
    for (let k = 0; k < world.stats.n; k++) sum += world.stats.diversity[k];
    expect(sum / world.stats.n).toBeGreaterThanOrEqual(H_MIN);
  });

  it('at least one speciation and one extinction occurred', () => {
    expect(world.counters.splits).toBeGreaterThanOrEqual(1);
    expect(world.counters.extinctions).toBeGreaterThanOrEqual(1);
  });

  it('no species exceeds 70% of the population in more than 20% of samples', () => {
    expect(sampleCount).toBeGreaterThan(0);
    expect(overShareCount / sampleCount).toBeLessThanOrEqual(0.2);
  });

  it('vision peaks at the end are not all in one class', () => {
    const classesSeen = new Set();
    for (let i = 0; i < world.store.highWater; i++) {
      if (!world.store.alive[i]) continue;
      classesSeen.add(visionClass(world.store.pheno[i * TRAIT_COUNT + TRAIT.visionPeak]));
    }
    expect(classesSeen.size).toBeGreaterThan(1);
  });

  it('the energy identity holds within 1e-3 at the end', () => {
    expect(relativeError(world)).toBeLessThan(1e-3);
  });

  it('positions in bounds and no NaN throughout', () => {
    expect(noNaN).toBe(true);
    expect(inBounds).toBe(true);
  });
});
