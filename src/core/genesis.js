/**
 * Genesis: the founder population (SPEC §4.5, §4.9). Every random draw
 * comes from `world.rng`, consumed in a fixed order, so genesis is
 * reproducible from the world's seed alone (SPEC §3.1).
 */
import { sin, cos, TAU } from './fmath.js';
import { TERRAIN } from './terrain.js';
import { TRAIT, TRAIT_COUNT, applyPhenotype } from './genome.js';
import { writePrior } from './brain.js';
import { regionName } from './names.js';
import { KIND } from './chronicle.js';

/** @type {Set<number>} */
const LAND_TYPES = new Set([TERRAIN.GRASS, TERRAIN.SCRUB]);
const MAX_CENTRE_ATTEMPTS = 1000;

/**
 * A lineage centre: a random GRASS/SCRUB tile via rejection sampling, or
 * (if that fails within the attempt budget) the first land tile found in
 * row-major order.
 * @param {import('./world.js').World} world
 * @returns {{ x: number, y: number }}
 */
function findLineageCentre(world) {
  const { rng, terrain, width, height } = world;
  for (let attempt = 0; attempt < MAX_CENTRE_ATTEMPTS; attempt++) {
    const x = rng.int(width);
    const y = rng.int(height);
    if (LAND_TYPES.has(terrain[y * width + x])) {
      return { x, y };
    }
  }
  for (let i = 0; i < terrain.length; i++) {
    if (LAND_TYPES.has(terrain[i])) {
      return { x: i % width, y: Math.floor(i / width) };
    }
  }
  // Terrain's own contiguity guarantee (SPEC §4.2) means this cannot
  // happen in practice; fall back to the origin rather than throw.
  return { x: 0, y: 0 };
}

/**
 * If (x, y)'s tile is water, find the nearest non-water tile by scanning
 * rings of increasing Chebyshev radius, each ring in row-major order.
 * @param {import('./world.js').World} world
 * @param {number} x
 * @param {number} y
 * @returns {{ x: number, y: number }}
 */
function nearestLand(world, x, y) {
  const { terrain, width, height } = world;
  const ix = Math.min(width - 1, Math.max(0, Math.floor(x)));
  const iy = Math.min(height - 1, Math.max(0, Math.floor(y)));
  if (terrain[iy * width + ix] !== TERRAIN.WATER) {
    return { x, y };
  }
  const maxRadius = Math.max(width, height);
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const ny = iy + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = ix + dx;
        if (nx < 0 || nx >= width) continue;
        if (terrain[ny * width + nx] !== TERRAIN.WATER) {
          return { x: nx + 0.5, y: ny + 0.5 };
        }
      }
    }
  }
  // No non-water tile anywhere (should not happen given the terrain
  // guarantee); leave the position where it landed.
  return { x, y };
}

/**
 * Clamp a continuous position strictly inside [0, size).
 * @param {number} v
 * @param {number} size
 * @returns {number}
 */
function clampInside(v, size) {
  const eps = 1e-3;
  return Math.max(0, Math.min(size - eps, v));
}

/**
 * Populate `world` with the founder lineages (SPEC §4.5, §4.9): herbivore
 * lineages first, then carnivore lineages, in that order. Every random
 * draw comes from `world.rng`.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function runGenesis(world) {
  const { cfg, rng, store } = world;
  const g = cfg.genesis;
  const gLen = store.genomeLength;

  /** @type {{ carn: boolean }[]} */
  const lineages = [];
  for (let i = 0; i < g.herbivoreLineages; i++) lineages.push({ carn: false });
  for (let i = 0; i < g.carnivoreLineages; i++) lineages.push({ carn: true });

  const founderTraits = new Float32Array(TRAIT_COUNT);
  /** @type {{ x: number, y: number } | null} */
  let firstCentre = null;
  /** @type {string[]} one per lineage, in creation order (SPEC §4.11's genesis sentence). */
  const lineageNames = [];

  // The seeded prior (SPEC §4.7): computed once, in gene space, then each
  // founder's weight genes are the prior plus their own noise draw.
  const priorGenome = new Float32Array(gLen);
  if (g.brainPrior === 'seeded') {
    writePrior(priorGenome, 0, cfg);
  }

  for (let speciesIndex = 0; speciesIndex < lineages.length; speciesIndex++) {
    const lineage = lineages[speciesIndex];
    const centre = findLineageCentre(world);
    if (firstCentre === null) firstCentre = centre;

    for (let t = 0; t < TRAIT_COUNT; t++) {
      founderTraits[t] = rng.float();
    }
    const [dietLo, dietHi] = lineage.carn ? g.dietCarnivore : g.dietHerbivore;
    founderTraits[TRAIT.diet] = rng.range(dietLo, dietHi);

    const memberCount = lineage.carn ? g.carnivoresPerLineage : g.herbivoresPerLineage;
    /** The lineage's species id, created from the first member placed (SPEC §4.9). */
    let speciesId = -1;
    for (let m = 0; m < memberCount; m++) {
      const slot = store.alloc();
      if (slot === -1) {
        world.counters.capacityRefused++;
        continue;
      }

      const gOff = slot * gLen;
      for (let t = 0; t < TRAIT_COUNT; t++) {
        const v = founderTraits[t] + rng.gaussian() * g.lineageNoise;
        store.genome[gOff + t] = Math.max(0, Math.min(1, v));
      }
      // Weight genes (SPEC §4.7): seeded prior + per-member noise, or
      // uniform random, per genesis.brainPrior.
      for (let k = TRAIT_COUNT; k < gLen; k++) {
        const v =
          g.brainPrior === 'seeded' ? priorGenome[k] + rng.gaussian() * g.brainNoise : rng.float();
        store.genome[gOff + k] = Math.max(0, Math.min(1, v));
      }
      applyPhenotype(cfg, store, slot);

      const r = g.clusterRadius * Math.sqrt(rng.float());
      const theta = TAU * rng.float();
      const px = clampInside(centre.x + 0.5 + r * cos(theta), world.width);
      const py = clampInside(centre.y + 0.5 + r * sin(theta), world.height);
      const landed = nearestLand(world, px, py);

      store.x[slot] = landed.x;
      store.y[slot] = landed.y;
      store.heading[slot] = TAU * rng.float();
      store.energy[slot] = g.energyFraction * store.energyMax[slot];
      store.age[slot] = 0;
      if (speciesId === -1) {
        speciesId = world.species.create(world, gOff, -1, store.x[slot], store.y[slot]);
        lineageNames.push(world.species.names[speciesId]);
      }
      store.species[slot] = speciesId;
      world.species.count[speciesId]++;
      store.generation[slot] = 1;
      store.parent[slot] = 0;
      store.sick[slot] = 0;
      store.flags[slot] = 0;
      store.offspring[slot] = 0;
    }
  }

  // The genesis chronicle entry (SPEC §4.11): lineage names, from the
  // real species table.
  const place =
    firstCentre !== null
      ? regionName(firstCentre.x, firstCentre.y, world.terrain, world.width, world.height)
      : regionName(0, 0, world.terrain, world.width, world.height);
  world.chronicle.add(
    world.tick,
    KIND.GENESIS,
    `Genesis. ${lineages.length} lineages seeded: ${lineageNames.join(', ')}.`,
    place,
    [],
  );
}
