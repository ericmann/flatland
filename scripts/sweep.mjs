#!/usr/bin/env node
// One row per seed, for tuning ⚠️ ASSUMPTION config defaults with a
// before/after table pasted into commit messages, the progress log and
// docs/tuning.md.
//
// `--ticks 0` (the default was `ignored` before P1-10; now it gates the
// mode) prints terrain-only columns: value noise plus the contiguity
// guarantee. `--ticks N > 0` also steps a World N ticks per seed through
// genesis and appends ecology columns.
//
//   node scripts/sweep.mjs --seeds 1..40 --ticks 0
//   node scripts/sweep.mjs --seeds 1..40 --size 64x40 --json
//   node scripts/sweep.mjs --seeds 1..40 --ticks 30000 --out docs/sweeps/p1-11-before.txt

import { writeFileSync } from 'node:fs';
import { makeConfig } from '../src/core/config.js';
import { generateTerrain } from '../src/core/terrain.js';
import { World } from '../src/core/world.js';
import { runGenesis } from '../src/core/genesis.js';
import { flag, flagAll, parseSeeds, parseSize, parseConfigOverrides } from './lib/args.mjs';
import { ecologyReport, sampleMinPopY2 } from './lib/report.mjs';

const argv = process.argv.slice(2);

const SEEDS = parseSeeds(/** @type {string} */ (flag(argv, 'seeds', '1..40')));
const JSON_OUT = argv.includes('--json');
const TICKS = Number(flag(argv, 'ticks', '0'));
const outPath = flag(argv, 'out', null);
const size = parseSize(flag(argv, 'size', null));
const configOverrides = parseConfigOverrides(flagAll(argv, 'config'));

const baseOverrides = size
  ? { world: { width: size.width, height: size.height }, ...configOverrides }
  : configOverrides;
const cfg = makeConfig(baseOverrides);
// P6-01: minPopY2 samples from the start of a world's second year, so a
// boom-bust crash shows up even when the run ends on a peak. Derived
// from this sweep's own config rather than hardcoded, so a --config
// override to time.ticksPerDay/daysPerYear doesn't silently mismatch it.
const YEAR2_START_TICK = cfg.time.ticksPerDay * cfg.time.daysPerYear;

/**
 * Fraction of tiles of each TERRAIN type, in enum order
 * (water, sand, mud, grass, scrub, rock).
 * @param {Uint8Array} terrain
 * @returns {number[]}
 */
function typeFractions(terrain) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < terrain.length; i++) counts[terrain[i]]++;
  return counts.map((c) => c / terrain.length);
}

/**
 * @param {number} seed
 */
function row(seed) {
  const { terrain, rerolls, grassFraction, waterFraction } = generateTerrain(seed, cfg);
  const [water, sand, mud, grass, scrub, rock] = typeFractions(terrain);
  return {
    seed,
    rerolls,
    grassPct: grass * 100,
    waterPct: water * 100,
    largestGrassPct: grassFraction * 100,
    largestWaterPct: waterFraction * 100,
    sandPct: sand * 100,
    mudPct: mud * 100,
    scrubPct: scrub * 100,
    rockPct: rock * 100,
  };
}

/**
 * Step a World seeded with `seed` for `TICKS` ticks (stopping early if the
 * population goes extinct), returning the ecology columns for one sweep
 * row plus `extinctAt` (the tick population hit zero, or 0 if it survived).
 * @param {number} seed
 * @returns {*}
 */
function ecologyRow(seed) {
  const world = new World(cfg, seed);
  runGenesis(world);

  let extinctAt = 0;
  let minPopY2 = null;
  const start = process.hrtime.bigint();
  let ticksRun = 0;
  for (let i = 0; i < TICKS; i++) {
    world.step();
    ticksRun++;
    minPopY2 = sampleMinPopY2(minPopY2, world.tick, world.store.count, {
      startTick: YEAR2_START_TICK,
    });
    if (world.store.count === 0) {
      extinctAt = world.tick;
      break;
    }
  }
  const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
  const tps = elapsedSeconds > 0 ? ticksRun / elapsedSeconds : 0;

  const report = ecologyReport(world, { ticksPerSecond: tps });
  return {
    pop: report.population.total,
    herb: report.population.herbivore,
    omni: report.population.omnivore,
    carn: report.population.carnivore,
    species: report.species.length,
    H: report.diversityAvg,
    plantsPct: report.plantsFraction * 100,
    born: report.born,
    starved: report.deaths.starved,
    hunted: report.deaths.hunted,
    old: report.deaths.oldAge,
    splits: report.speciations,
    extinct: report.extinctions,
    gen: report.maxGeneration,
    immig: report.immigrations,
    plagues: report.plagues,
    maxSharePct: report.maxSharePct,
    noct: report.visionHistogram.nocturnal,
    crep: report.visionHistogram.crepuscular,
    diur: report.visionHistogram.diurnal,
    avgH: report.diversityAvg,
    swimmers: report.swimmers,
    crossings: report.crossings,
    rain: report.rain,
    fog: report.fog,
    extinctAt,
    tps,
    bornPerImmig: report.bornPerImmig,
    deathAgePct: report.deathAgeMeanPct,
    edgePct: report.edgePct,
    plantsAvgPct: report.plantsAvgPct,
    minPopY2: minPopY2 ?? 0,
    refused: report.capacityRefused,
  };
}

const rows = SEEDS.map(row);
const ecologyRows = TICKS > 0 ? SEEDS.map(ecologyRow) : null;

/**
 * @param {string|number} s
 * @param {number} n
 */
function pad(s, n) {
  return String(s).padStart(n);
}

if (JSON_OUT) {
  rows.forEach((r, idx) => {
    const merged = ecologyRows ? { ...r, ...ecologyRows[idx] } : r;
    console.log(JSON.stringify(merged));
  });
} else {
  console.log(`world ${cfg.world.width}x${cfg.world.height}, ${rows.length} seed(s)\n`);
  console.log(
    '  seed  reroll   grass%   water%  lgGrass%  lgWater%    sand%     mud%   scrub%    rock%',
  );
  for (const r of rows) {
    console.log(
      `${pad(r.seed, 6)}  ${pad(r.rerolls, 6)}  ${pad(r.grassPct.toFixed(1), 7)}  ${pad(r.waterPct.toFixed(1), 7)}  ` +
        `${pad(r.largestGrassPct.toFixed(1), 8)}  ${pad(r.largestWaterPct.toFixed(1), 8)}  ${pad(r.sandPct.toFixed(1), 7)}  ` +
        `${pad(r.mudPct.toFixed(1), 7)}  ${pad(r.scrubPct.toFixed(1), 7)}  ${pad(r.rockPct.toFixed(1), 7)}`,
    );
  }
  const mean = (/** @type {'grassPct'|'waterPct'} */ key) =>
    rows.reduce((a, r) => a + r[key], 0) / rows.length;
  const needingReroll = rows.filter((r) => r.rerolls > 0).length;
  const totalRerolls = rows.reduce((a, r) => a + r.rerolls, 0);
  console.log('---');
  console.log(
    `mean grass% ${mean('grassPct').toFixed(1)}  mean water% ${mean('waterPct').toFixed(1)}  ` +
      `seeds needing reroll: ${needingReroll}/${rows.length}  total rerolls: ${totalRerolls}`,
  );

  if (ecologyRows) {
    console.log();
    console.log(
      '     pop     herb     omni     carn  species        H  plants%     born  starved   hunted      old   splits  extinct      gen  extinctAt      tps    immig  plagues maxShare%  noct/crep/diur     avgH  swimmers crossings     rain      fog  born/immig  deathAge%    edge%  plantsAvg%  minPopY2  refused',
    );
    ecologyRows.forEach((e) => {
      console.log(
        `${pad(e.pop, 8)} ${pad(e.herb, 8)} ${pad(e.omni, 8)} ${pad(e.carn, 8)} ${pad(e.species, 8)} ` +
          `${pad(e.H.toFixed(3), 8)} ${pad(e.plantsPct.toFixed(1), 8)} ${pad(e.born, 8)} ${pad(e.starved, 8)} ` +
          `${pad(e.hunted, 8)} ${pad(e.old, 8)} ${pad(e.splits, 8)} ${pad(e.extinct, 8)} ${pad(e.gen, 8)} ` +
          `${pad(e.extinctAt, 10)} ${pad(e.tps.toFixed(0), 8)} ${pad(e.immig, 8)} ${pad(e.plagues, 8)} ` +
          `${pad(e.maxSharePct.toFixed(1), 9)}  ${pad(`${e.noct}/${e.crep}/${e.diur}`, 14)} ${pad(e.avgH.toFixed(3), 8)} ` +
          `${pad(e.swimmers, 9)} ${pad(e.crossings, 9)} ${pad(e.rain, 8)} ${pad(e.fog, 8)} ` +
          `${pad(e.bornPerImmig.toFixed(1), 10)} ${pad(e.deathAgePct.toFixed(1), 10)} ${pad(e.edgePct.toFixed(1), 8)} ` +
          `${pad(e.plantsAvgPct.toFixed(1), 10)} ${pad(e.minPopY2, 9)} ${pad(e.refused, 8)}`,
      );
    });
    const survived = ecologyRows.filter((e) => e.pop > 0 && e.herb > 0 && e.carn > 0).length;
    const withSplits = ecologyRows.filter((e) => e.splits >= 1).length;
    const withCrossing = ecologyRows.filter((e) => e.crossings >= 1).length;
    const emean = (
      /** @type {'pop'|'H'|'plantsPct'|'tps'|'splits'|'gen'|'immig'|'plagues'|'maxSharePct'|'avgH'|'swimmers'|'rain'|'fog'|'bornPerImmig'|'deathAgePct'|'edgePct'|'plantsAvgPct'|'minPopY2'|'refused'} */ key,
    ) => ecologyRows.reduce((a, e) => a + e[key], 0) / ecologyRows.length;
    console.log('---');
    console.log(
      `mean pop ${emean('pop').toFixed(1)}  mean H ${emean('H').toFixed(3)}  mean plants% ${emean('plantsPct').toFixed(1)}  ` +
        `mean splits ${emean('splits').toFixed(1)}  mean gen ${emean('gen').toFixed(1)}  ` +
        `mean tps ${emean('tps').toFixed(0)}  survived: ${survived}/${ecologyRows.length}  ` +
        `seeds with splits>=1: ${withSplits}/${ecologyRows.length}`,
    );
    console.log(
      `mean immig ${emean('immig').toFixed(1)}  mean plagues ${emean('plagues').toFixed(1)}  ` +
        `mean maxShare% ${emean('maxSharePct').toFixed(1)}  mean avgH ${emean('avgH').toFixed(3)}`,
    );
    console.log(
      `mean swimmers ${emean('swimmers').toFixed(1)}  seeds with a swim crossing: ${withCrossing}/${ecologyRows.length}  ` +
        `mean rain events ${emean('rain').toFixed(1)}  mean fog events ${emean('fog').toFixed(1)}`,
    );
    console.log(
      `mean born/immig ${emean('bornPerImmig').toFixed(2)}  mean deathAge% ${emean('deathAgePct').toFixed(1)}  ` +
        `mean edge% ${emean('edgePct').toFixed(1)}  mean plantsAvg% ${emean('plantsAvgPct').toFixed(1)}  ` +
        `mean minPopY2 ${emean('minPopY2').toFixed(1)}  mean refused ${emean('refused').toFixed(1)}  ` +
        `seeds with 0 refused: ${ecologyRows.filter((e) => e.refused === 0).length}/${ecologyRows.length}`,
    );
  }
}

if (outPath) {
  const lines = [];
  lines.push(`world ${cfg.world.width}x${cfg.world.height}, ${rows.length} seed(s)`);
  rows.forEach((r, idx) => {
    const merged = ecologyRows ? { ...r, ...ecologyRows[idx] } : r;
    lines.push(JSON.stringify(merged));
  });
  writeFileSync(outPath, lines.join('\n') + '\n');
}
