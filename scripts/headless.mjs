#!/usr/bin/env node
// Run the simulation without a browser and print an ecology report (P1-10).
// Imports only src/core/**, no sim, no DOM.
//
//   node scripts/headless.mjs
//   node scripts/headless.mjs --seed 2 --ticks 5000
//   node scripts/headless.mjs --size 64x40 --config genesis.herbivoresPerLineage=56
//   node scripts/headless.mjs --json --quiet

import { makeConfig } from '../src/core/config.js';
import { World } from '../src/core/world.js';
import { runGenesis } from '../src/core/genesis.js';
import { flag, flagAll, parseSize, parseConfigOverrides } from './lib/args.mjs';
import { ecologyReport } from './lib/report.mjs';

const argv = process.argv.slice(2);

const seed = Number(flag(argv, 'seed', '1'));
const ticks = Number(flag(argv, 'ticks', '30000'));
const size = parseSize(flag(argv, 'size', null));
const configOverrides = parseConfigOverrides(flagAll(argv, 'config'));
const quiet = argv.includes('--quiet');
const jsonOut = argv.includes('--json');

const overrides = size
  ? { world: { width: size.width, height: size.height }, ...configOverrides }
  : configOverrides;
const cfg = makeConfig(overrides);

const world = new World(cfg, seed);
runGenesis(world);

const start = process.hrtime.bigint();
for (let i = 0; i < ticks; i++) world.step();
const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
const ticksPerSecond = elapsedSeconds > 0 ? ticks / elapsedSeconds : 0;

const report = ecologyReport(world, { ticksPerSecond });
const chronicleLines = world.chronicle.entries.slice(-10);

if (jsonOut) {
  console.log(JSON.stringify({ ...report, chronicle: chronicleLines }));
} else if (!quiet) {
  console.log(
    `flatland headless — seed ${seed}, ${cfg.world.width}x${cfg.world.height}, tick ${report.tick}`,
  );
  console.log('---');
  console.log(
    `population: total ${report.population.total}  herbivore ${report.population.herbivore}  ` +
      `omnivore ${report.population.omnivore}  carnivore ${report.population.carnivore}`,
  );
  console.log(
    `species: ${report.species.map((/** @type {{id: number, count: number}} */ s) => `#${s.id}=${s.count}`).join(', ') || '(none)'}`,
  );
  console.log(
    `born ${report.born}  hunts ${report.hunts}  capacityRefused ${report.capacityRefused}`,
  );
  console.log(
    `deaths: starved ${report.deaths.starved}  oldAge ${report.deaths.oldAge}  hunted ${report.deaths.hunted}  ` +
      `fire ${report.deaths.fire}  meteor ${report.deaths.meteor}  disease ${report.deaths.disease}`,
  );
  console.log(
    `speciations ${report.speciations}  extinctions ${report.extinctions}  immigrations ${report.immigrations}`,
  );
  console.log(
    `diversity: now ${report.diversityNow.toFixed(3)}  avg ${report.diversityAvg.toFixed(3)}  ` +
      `plants% ${(report.plantsFraction * 100).toFixed(1)}`,
  );
  console.log(
    `vision: nocturnal ${report.visionHistogram.nocturnal}  crepuscular ${report.visionHistogram.crepuscular}  ` +
      `diurnal ${report.visionHistogram.diurnal}`,
  );
  console.log(`ticks/s: ${report.ticksPerSecond.toFixed(0)}`);
  console.log(`hash: ${report.hash}`);
  console.log('---');
  console.log(`chronicle (last ${chronicleLines.length}):`);
  for (const entry of chronicleLines) {
    console.log(`  [${entry.tick}] ${entry.kind}: ${entry.text}`);
  }
}
