// Shared ecology reporting for scripts/headless.mjs and scripts/sweep.mjs.
// Imports only src/core/**, no DOM, no sim.
import { TRAIT, TRAIT_COUNT, dietClass, visionClass } from '../../src/core/genome.js';

/**
 * A point-in-time report of a World's ecological state (SPEC §9.5):
 * population by diet class and by species, births, deaths by cause,
 * hunts, capacity refusals, speciation/extinction counts, immigrations,
 * Shannon diversity now and averaged over samples, plants fraction, the
 * max generation among the living, a vision-class histogram, and the
 * world hash.
 * `ticksPerSecond` is not measured here (timing is the caller's job); it
 * is threaded through as a parameter so this stays a pure function of
 * `world` plus whatever the caller already measured.
 * @param {import('../../src/core/world.js').World} world
 * @param {{ ticksPerSecond?: number }} [opts]
 * @returns {*}
 */
export function ecologyReport(world, { ticksPerSecond = 0 } = {}) {
  const store = world.store;

  let total = 0;
  let herbivore = 0;
  let omnivore = 0;
  let carnivore = 0;
  let maxGeneration = 0;
  const visionHistogram = { nocturnal: 0, crepuscular: 0, diurnal: 0 };
  /** @type {Map<number, number>} */
  const bySpecies = new Map();

  for (let i = 0; i < store.highWater; i++) {
    if (!store.alive[i]) continue;
    total++;

    const pOff = i * TRAIT_COUNT;
    const cls = dietClass(store.pheno[pOff + TRAIT.diet]);
    if (cls === 'herbivore') herbivore++;
    else if (cls === 'carnivore') carnivore++;
    else omnivore++;

    visionHistogram[visionClass(store.pheno[pOff + TRAIT.visionPeak])]++;
    if (store.generation[i] > maxGeneration) maxGeneration = store.generation[i];

    const sp = store.species[i];
    bySpecies.set(sp, (bySpecies.get(sp) ?? 0) + 1);
  }

  const species = Array.from(bySpecies.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, count]) => ({ id, count }));

  const stats = world.stats;
  let sumDiversity = 0;
  for (let k = 0; k < stats.n; k++) {
    sumDiversity += stats.diversity[k];
  }
  const diversityAvg = stats.n > 0 ? sumDiversity / stats.n : 0;
  const diversityNow =
    stats.n > 0 ? stats.diversity[(stats.head - 1 + stats.capacity) % stats.capacity] : 0;

  let capSum = 0;
  let plantSum = 0;
  const caps = world.cfg.terrain.plantCap;
  for (let i = 0; i < world.terrain.length; i++) {
    capSum += caps[world.terrain[i]];
    plantSum += world.plants[i];
  }
  const plantsFraction = capSum > 0 ? plantSum / capSum : 0;

  return {
    tick: world.tick,
    population: { total, herbivore, omnivore, carnivore },
    species,
    born: world.counters.born,
    deaths: {
      starved: world.counters.starved,
      oldAge: world.counters.oldAge,
      hunted: world.counters.hunted,
      fire: world.counters.fire,
      meteor: world.counters.meteor,
      disease: world.counters.disease,
    },
    hunts: world.counters.hunted,
    capacityRefused: world.counters.capacityRefused,
    speciations: world.counters.splits,
    extinctions: world.counters.extinctions,
    immigrations: world.counters.immigrations,
    diversityNow,
    diversityAvg,
    plantsFraction,
    maxGeneration,
    visionHistogram,
    ticksPerSecond,
    hash: world.hash(),
  };
}
