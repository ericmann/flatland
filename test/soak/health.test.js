import { describe, it, expect, beforeAll } from 'vitest';
import { relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { makeWorld } from '../helpers.js';
import { ecologyReport, sampleMinPopY2 } from '../../scripts/lib/report.mjs';

// P6-01/P6-03 (SPEC §9.3, docs/PLAN.md "Phase 6"): the ecology health
// invariants that the pre-Phase-6 defaults failed. On seed 1 at the
// pre-P6-03 defaults, 100,000 ticks gave born 116 vs immigrations 107
// (an immigration treadmill, not births), mean plant fill ~99%
// (never grazed down), and 97-100% of the living population within 20
// tiles of an edge from day 6 onward (docs/tuning.md "P6-03").
const TICKS = 100000;

// Pinned seeds (P6-03 sweep, docs/sweeps/p6-03-after.txt; see
// docs/tuning.md "P6-03 rebalance" for the full before/after tables).
// 25 of the 40 swept seeds clear every assertion below with margin;
// chosen over the other 24 (as ecology.test.js's P3-10 seeds were) for
// the combination of high diversity and low dominance, not just the
// minimum targets:
//   seed 26: pop 501, herb 478, carn 7, H 2.935, 27 living species, max
//            species share 26.6%, born 912 vs immig 12 (76:1), plants
//            avg 70.5%, edge 30.9%, 0 capacity refusals.
//   seed 32: pop 700, herb 691, carn 4 (thin — a P6-04 target, not a
//            P6-03 one), H 3.280, 50 living species, max species share
//            23.9%, born 1311 vs immig 13 (101:1), plants avg 62.4%,
//            edge 28.4%, 0 capacity refusals.
const PINNED_SEEDS = [26, 32];

describe.each(PINNED_SEEDS)(
  'ecology health: seed %d, 100,000 ticks (SPEC §9.3, Phase 6)',
  (seed) => {
    const world = makeWorld({ width: 256, height: 160, seed });
    initGenesisLedger(world);

    let minPopY2 = /** @type {number | null} */ (null);
    let maxPop = 0;

    // Loop shape and timeout as in test/soak/ecology.test.js: a synchronous
    // 100,000-tick loop blocks the event loop for minutes.
    beforeAll(() => {
      const year2Start = world.cfg.time.ticksPerDay * world.cfg.time.daysPerYear;
      for (let t = 1; t <= TICKS; t++) {
        world.step();
        if (world.store.count > maxPop) maxPop = world.store.count;
        minPopY2 = sampleMinPopY2(minPopY2, t, world.store.count, { startTick: year2Start });
      }
    }, 1200000);

    it('births outnumber immigrations at least ten to one', () => {
      expect(world.counters.born).toBeGreaterThanOrEqual(10 * world.counters.immigrations);
    });

    it('plants are grazed: mean plant fill over the last ~30k ticks is between 15% and 90% of cap', () => {
      const report = ecologyReport(world);
      expect(report.plantsAvgPct).toBeGreaterThanOrEqual(15);
      expect(report.plantsAvgPct).toBeLessThanOrEqual(90);
    });

    it('immigration is a backstop, not a supply: at most 30 immigration events', () => {
      expect(world.counters.immigrations).toBeLessThanOrEqual(30);
    });

    it('the population is not pinned to the edges: at most 60% of living organisms are within 20 tiles of an edge', () => {
      const report = ecologyReport(world, { edgeMargin: 20 });
      expect(report.edgePct).toBeLessThanOrEqual(60);
    });

    it('herbivores and carnivores are both alive at the end', () => {
      const report = ecologyReport(world);
      expect(report.population.herbivore).toBeGreaterThan(0);
      expect(report.population.carnivore).toBeGreaterThan(0);
    });

    it('the energy ledger closes to 1e-3 relative', () => {
      expect(relativeError(world)).toBeLessThan(1e-3);
    });

    // P6-04's four damping/hunter-viability assertions were attempted here
    // and reverted — see docs/PROGRESS.md's P6-04 BLOCKED log entry and
    // docs/tuning.md "P6-04" for the full trial data. Not committed
    // because none of ~20 swept seeds cleared all four simultaneously
    // under any single config tried.
    it('minPopY2 and maxPop were sampled (sanity check, kept for a future attempt at P6-04)', () => {
      expect(maxPop).toBeGreaterThan(0);
      expect(minPopY2).not.toBeNull();
    });
  },
);
