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

// Pinned seeds, originally from the P6-03 sweep (docs/sweeps/
// p6-03-after.txt): seeds 26 and 32, chosen for high diversity and low
// dominance. Both still passed every assertion below after P6-05 (see
// docs/tuning.md "P6-05"), but P6-05's bigger genesis grew seed 26 to a
// population of 1,052 by 100,000 ticks, which times out this file's own
// 1,200,000ms hook (the same risk test/soak/ecology.test.js hit twice —
// see its own comment). Re-pinned to two smaller-population seeds from
// the P6-05 after-sweep (docs/sweeps/p6-05-after.txt) that clear every
// assertion below with margin. Seed 8 was tried first (small final
// population, 114) and also timed out this file's hook despite that —
// its 4,697 births over the run mean far more birth/death churn per
// tick than its standing population suggests, and that churn (species
// assignment, ledger settlement, store alloc/free), not population
// size alone, drives per-tick cost under vitest's overhead. Replaced
// with seed 18, both a small population and low churn:
//   seed 18: pop 150, herb 139, carn 6, 18 living species, H 2.432,
//            born 389 vs immig 12 (32:1), plants avg 87.3%, edge
//            42.0%, 0 capacity refusals.
//   seed 33: pop 135, herb 81, carn 4, 18 living species, H 2.172,
//            born 596 vs immig 9 (66:1), plants avg 82.4%, edge 37.8%,
//            0 capacity refusals.
const PINNED_SEEDS = [18, 33];

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

    // P6-05 (docs/PLAN.md "Phase 6"): species diversity through year 4.
    it('at least 6 living species at the end', () => {
      const report = ecologyReport(world);
      expect(report.species.length).toBeGreaterThanOrEqual(6);
    });

    it('mean Shannon diversity over the run is at least 1.2', () => {
      const report = ecologyReport(world);
      expect(report.diversityAvg).toBeGreaterThanOrEqual(1.2);
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
