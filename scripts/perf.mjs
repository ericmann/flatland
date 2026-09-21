#!/usr/bin/env node
// Node performance measurement (P5-06, SPEC §8). Two scenarios:
//
//   1. The default world (`makeConfig({})`, the size a phone actually
//      runs — SPEC §4.1/config.js's `world.width`/`world.height` docs)
//      stepped 20,000 ticks after a warm-up, reporting ticks/s and
//      `process.memoryUsage()`.
//   2. The exact 64x40/200-organism scenario `test/invariants/
//      throughput.test.js` gates CI on (SPEC §8's "Sim throughput,
//      Node (CI gate)", revised to >= 1,200 ticks/s -- see that test
//      file's comment for why), built with the same `test/helpers.js`
//      factory so this number is directly comparable to that test's own
//      printed number and to the CI gate. `throughput.test.js` runs this
//      exact script as a child process to measure it, rather than timing
//      in-process under vitest.
//
// No DOM, no timers besides `process.hrtime.bigint` (Node-only tooling,
// not `src/core` — SPEC §3 rule 1's ban is on core, not scripts).
//
//   node scripts/perf.mjs
//   node scripts/perf.mjs --ticks 20000 --gate-ticks 3000
//   node scripts/perf.mjs --gate-only --gate-ticks 3000 --json  # scenario 2 only, what throughput.test.js runs

import os from 'node:os';
import { makeConfig } from '../src/core/config.js';
import { World } from '../src/core/world.js';
import { runGenesis } from '../src/core/genesis.js';
import { makeWorld, stepN } from '../test/helpers.js';
import { flag } from './lib/args.mjs';

const argv = process.argv.slice(2);
const ticks = Number(flag(argv, 'ticks', '20000'));
const warmup = Number(flag(argv, 'warmup', '500'));
const gateTicks = Number(flag(argv, 'gate-ticks', '3000'));
const gateWarmup = Number(flag(argv, 'gate-warmup', '500'));
const jsonOut = argv.includes('--json');
const gateOnly = argv.includes('--gate-only');

/**
 * @param {World} world
 * @param {number} n
 * @returns {number} ticks/s
 */
function timeStep(world, n) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < n; i++) world.step();
  const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
  return elapsedSeconds > 0 ? n / elapsedSeconds : 0;
}

function machineInfo() {
  const cpus = os.cpus();
  return {
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCount: cpus.length,
    totalMemGB: Math.round((os.totalmem() / 1e9) * 10) / 10,
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
  };
}

// --- Scenario 1: default world (the size a real run actually uses). ---
// Skipped under --gate-only (throughput.test.js only needs scenario 2,
// and this scenario's 20,000 ticks otherwise dominate the test's runtime).
let cfg, defaultGenesisCount, defaultWorld, defaultTps, memBefore, memAfter;
if (!gateOnly) {
  cfg = makeConfig({});
  defaultWorld = new World(cfg, 1);
  runGenesis(defaultWorld);
  defaultGenesisCount = defaultWorld.store.count; // before warm-up: population drifts (births/deaths) once stepped.
  stepN(defaultWorld, warmup);
  if (global.gc) global.gc(); // only present under --expose-gc; a cleaner heapUsed baseline when available.
  memBefore = process.memoryUsage();
  defaultTps = timeStep(defaultWorld, ticks);
  memAfter = process.memoryUsage();
}

// --- Scenario 2: the CI throughput gate's exact scenario. ---
// P6-06: all four genesis counts pinned explicitly (not just the
// per-lineage ones) so this stays exactly 200 regardless of the live
// DEFAULTS lineage counts — see test/invariants/throughput.test.js's
// matching comment for why.
const gateWorld = makeWorld({
  width: 64,
  height: 40,
  seed: 1,
  config: {
    genesis: {
      herbivoreLineages: 3,
      herbivoresPerLineage: 56, // 3 lineages * 56 = 168
      carnivoreLineages: 1,
      carnivoresPerLineage: 32, // 1 lineage * 32 = 32 -> 200 total
    },
  },
});
const gateGenesisCount = gateWorld.store.count; // same instant `throughput.test.js` asserts `toBe(200)`.
stepN(gateWorld, gateWarmup);
const gateTps = timeStep(gateWorld, gateTicks);

const result = {
  machine: machineInfo(),
  defaultWorld:
    defaultWorld && cfg && memBefore && memAfter && defaultTps !== undefined
      ? {
          width: cfg.world.width,
          height: cfg.world.height,
          organismsAtGenesis: defaultGenesisCount,
          organismsAfterRun: defaultWorld.store.count,
          warmupTicks: warmup,
          measuredTicks: ticks,
          ticksPerSecond: defaultTps,
          memoryBefore: memBefore,
          memoryAfter: memAfter,
        }
      : null,
  gate: {
    width: 64,
    height: 40,
    organismsAtGenesis: gateGenesisCount,
    organismsAfterRun: gateWorld.store.count,
    warmupTicks: gateWarmup,
    measuredTicks: gateTicks,
    ticksPerSecond: gateTps,
    // Mirrors test/invariants/throughput.test.js's THROUGHPUT_MIN default;
    // see that file's comment for why this was revised down from 2,000.
    budget: Number(process.env.THROUGHPUT_MIN ?? 1200),
  },
};

if (jsonOut) {
  console.log(JSON.stringify(result));
} else {
  console.log('flatland perf — Node throughput and memory (SPEC §8)');
  console.log('---');
  console.log(
    `machine: ${result.machine.cpuCount}x ${result.machine.cpuModel}, ` +
      `${result.machine.totalMemGB} GB, ${result.machine.platform}, node ${result.machine.node}`,
  );
  const dw = result.defaultWorld;
  if (dw) {
    console.log('---');
    console.log(
      `default world: ${dw.width}x${dw.height}, ${dw.organismsAtGenesis} organisms at genesis ` +
        `(${dw.organismsAfterRun} after the run — population drifts under ecology)`,
    );
    console.log(
      `  warm-up ${warmup} ticks, then ${ticks} ticks measured: ${dw.ticksPerSecond.toFixed(0)} ticks/s`,
    );
    console.log(
      `  memory before: heapUsed ${(dw.memoryBefore.heapUsed / 1e6).toFixed(1)} MB, rss ${(dw.memoryBefore.rss / 1e6).toFixed(1)} MB`,
    );
    console.log(
      `  memory after:  heapUsed ${(dw.memoryAfter.heapUsed / 1e6).toFixed(1)} MB, rss ${(dw.memoryAfter.rss / 1e6).toFixed(1)} MB`,
    );
  }
  console.log('---');
  console.log(
    `CI gate scenario: 64x40, ${result.gate.organismsAtGenesis} organisms at genesis ` +
      `(matches test/invariants/throughput.test.js exactly)`,
  );
  console.log(
    `  warm-up ${gateWarmup} ticks, then ${gateTicks} ticks measured: ${gateTps.toFixed(0)} ticks/s ` +
      `(budget: >= ${result.gate.budget} ticks/s)`,
  );
  console.log('---');
  console.log(
    gateTps >= result.gate.budget
      ? 'gate: PASS on this machine, this run.'
      : 'gate: BELOW BUDGET on this machine, this run (see docs/performance.md for context).',
  );
}
