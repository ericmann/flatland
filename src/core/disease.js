/**
 * Contact-transmitted disease (SPEC §4.9): kin-biased transmission,
 * resistance, energy cost, lethality and plague chronicle entries.
 *
 * Determinism (SPEC §3.1, §6.3): sick organisms are visited in slot order
 * (the caller's per-organism loop in `world.js`); contact candidates come
 * from `world.grid` in query (cell-major, then slot) order; new
 * infections go into `world.newlySick` and are applied by
 * `applyNewlySick()` after the full per-organism loop, so a contact
 * cannot relay the same tick it was infected.
 */
import { TRAIT, TRAIT_COUNT, distance, MAX_TRAIT_DISTANCE } from './genome.js';
import { regionName } from './names.js';
import { KIND, sentence } from './chronicle.js';

/**
 * `world.js`'s `DEATH.DISEASE` code, duplicated locally: `world.js`
 * already imports this module, so importing `DEATH` from `world.js` here
 * would cycle back — same reason `ecology.js` duplicates `OUTPUT.eat`.
 */
const DEATH_DISEASE = 6;

/**
 * Per organism `i`: if sick, scan for contacts to infect and progress its
 * own illness (cost, timer, recovery/death at expiry); if healthy, roll
 * for spontaneous infection. Only ever writes `world.newlySick` (deferred
 * application), or, for the sick organism's own progression,
 * `store.sick[i]`, `store.energy[i]`, `world.dying[i]` and the species
 * table's `sick` counter.
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function diseaseTick(world, i) {
  const cfg = world.cfg.disease;
  if (!cfg.enabled) return;
  const store = world.store;
  const rng = world.rng;
  const gLen = store.genomeLength;

  if (store.sick[i] === 0) {
    if (rng.chance(cfg.spontaneousRate)) {
      world.newlySick[i] = 1;
    }
    return;
  }

  // Transmission: contact candidates from the grid, filtered to the true
  // contact radius (the grid's query is a candidate set, not a circle).
  const x = store.x[i];
  const y = store.y[i];
  const r2 = cfg.contactRadius * cfg.contactRadius;
  const n = world.grid.queryRange(x, y, cfg.contactRadius, world.queryOut);
  for (let k = 0; k < n; k++) {
    const j = world.queryOut[k];
    if (j === i || !store.alive[j] || store.sick[j] > 0 || world.newlySick[j]) continue;
    const dx = store.x[j] - x;
    const dy = store.y[j] - y;
    if (dx * dx + dy * dy > r2) continue;

    const dist = distance(store.genome, i * gLen, j * gLen) / MAX_TRAIT_DISTANCE;
    const resistanceJ = store.pheno[j * TRAIT_COUNT + TRAIT.resistance];
    const p = cfg.contactRate * Math.max(0, 1 - cfg.kinBias * dist) * (1 - resistanceJ);
    if (rng.chance(p)) {
      world.newlySick[j] = 1;
    }
  }

  // Progression: energy cost (realised -> dissipated, like metabolism),
  // then tick the timer down; at expiry, recover or die.
  const resistanceI = store.pheno[i * TRAIT_COUNT + TRAIT.resistance];
  const cost = cfg.costPerTick * (1 - resistanceI);
  const before = store.energy[i];
  const intended = Math.min(before, cost);
  store.energy[i] = Math.fround(before - intended);
  world.ledger.dissipated += before - store.energy[i];

  store.sick[i]--;
  if (store.sick[i] === 0) {
    const speciesId = store.species[i];
    world.species.sick[speciesId]--;
    if (rng.chance(cfg.lethality * (1 - resistanceI))) {
      world.dying[i] = DEATH_DISEASE;
    }
  }
}

/**
 * Apply every infection queued in `world.newlySick` during this tick's
 * per-organism loop (SPEC §4.9: a contact cannot relay the same tick),
 * then check each newly-sick organism's species for an outbreak crossing
 * `disease.outbreakThreshold` upward, chronicling a `plague` entry once
 * per species per `disease.chronicleCooldown`.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function applyNewlySick(world) {
  const cfg = world.cfg.disease;
  if (!cfg.enabled) return;
  const store = world.store;
  const newlySick = world.newlySick;
  const species = world.species;

  for (let i = 0; i < store.highWater; i++) {
    if (!newlySick[i]) continue;
    newlySick[i] = 0;
    if (!store.alive[i] || store.sick[i] > 0) continue;

    store.sick[i] = Math.min(65535, cfg.durationTicks); // store.sick is a Uint16Array; clamp, don't let it wrap.
    const id = store.species[i];
    const wasBelow = species.sick[id] < cfg.outbreakThreshold;
    species.sick[id]++;

    if (
      wasBelow &&
      species.sick[id] >= cfg.outbreakThreshold &&
      world.tick - species.lastPlagueAt[id] >= cfg.chronicleCooldown
    ) {
      species.lastPlagueAt[id] = world.tick;
      const place = regionName(store.x[i], store.y[i], world.terrain, world.width, world.height);
      const text = sentence(KIND.PLAGUE, { name: species.names[id], place, n: species.sick[id] });
      world.chronicle.add(world.tick, KIND.PLAGUE, text, place, [id]);
    }
  }
}
