#!/usr/bin/env node
// One row per seed, for tuning ⚠️ ASSUMPTION config defaults with a
// before/after table pasted into commit messages, the progress log and
// docs/tuning.md.
//
// For now (P0-06) this prints terrain-only columns: value noise plus the
// contiguity guarantee. --ticks is accepted and ignored until P1-10 adds
// ecology columns from a stepped World.
//
//   node scripts/sweep.mjs --seeds 1..40
//   node scripts/sweep.mjs --seeds 1..40 --size 64x40 --json
//   node scripts/sweep.mjs --seeds 1..40 --ticks 100000   (--ticks ignored)

import { makeConfig } from '../src/core/config.js';
import { generateTerrain } from '../src/core/terrain.js';

const argv = process.argv.slice(2);

/**
 * @param {string} name
 * @param {string|null} fallback
 * @returns {string|null}
 */
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}

/**
 * @param {string} spec
 * @returns {number[]}
 */
function parseSeeds(spec) {
  if (spec.includes('..')) {
    const [a, b] = spec.split('..').map(Number);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return spec.split(',').map(Number);
}

const SEEDS = parseSeeds(/** @type {string} */ (flag('seeds', '1..40')));
const JSON_OUT = argv.includes('--json');
const sizeSpec = flag('size', null);

let cfg = makeConfig();
if (sizeSpec) {
  const [w, h] = sizeSpec.split('x').map(Number);
  cfg = makeConfig({ world: { width: w, height: h } });
}

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

const rows = SEEDS.map(row);

/**
 * @param {string|number} s
 * @param {number} n
 */
function pad(s, n) {
  return String(s).padStart(n);
}

if (JSON_OUT) {
  for (const r of rows) {
    console.log(JSON.stringify(r));
  }
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
}
