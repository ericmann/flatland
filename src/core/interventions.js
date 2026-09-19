/**
 * The intervention queue (SPEC §3.6, §5.3): every Hand of God action,
 * config change or rename is an event, queued for a future tick, applied
 * in order, and appended to the permanent log.
 *
 * Determinism (SPEC §3.1, §3.6): events apply at the start of their tick,
 * in log order; tile loops are row-major within the affected radius;
 * organisms are affected in slot order (a direct `0..highWater` scan,
 * not the spatial grid — interventions are rare, not a hot loop, so
 * there is no reason to risk the grid's bucket-order for a correctness
 * requirement this strict). Every applied event is appended to
 * `world.interventions` and, except `rename` (its own `naming` kind, no
 * ⚡ — handled by `species.rename()`), chronicled with kind
 * `intervention` and the ⚡ prefix (`chronicle.js`'s `sentence(KIND.
 * INTERVENTION, { text })`).
 */
import { TERRAIN } from './terrain.js';
import { KIND, sentence } from './chronicle.js';
import { regionName } from './names.js';
import { nearestLand } from './genesis.js';
import { diffConfig, applyDiff } from './config.js';

/**
 * @typedef {{ tick: number, kind: string, [key: string]: * }} InterventionEvent
 */

/** `world.js`'s `DEATH.FIRE`/`DEATH.METEOR` codes, duplicated locally: `world.js` already imports this module, so importing `DEATH` from `world.js` here would cycle back — same reason `disease.js` duplicates `DEATH.DISEASE`. */
const DEATH_FIRE = 4;
const DEATH_METEOR = 5;

/** Every intervention kind `queueIntervention`/`applyDue` know how to handle. */
const KNOWN_KINDS = Object.freeze([
  'rain',
  'fire',
  'meteor',
  'plague',
  'river',
  'meadow',
  'rename',
  'config',
]);

/**
 * Required field names per kind, checked for presence (not type) by
 * `queueIntervention` before an event is ever queued.
 * @type {Record<string, string[]>}
 */
const REQUIRED_FIELDS = Object.freeze({
  rain: [],
  fire: ['x', 'y'],
  meteor: ['x', 'y'],
  plague: ['x', 'y'],
  river: ['x', 'y'],
  meadow: ['x', 'y'],
  rename: ['speciesId', 'name'],
  config: ['diff'],
});

/**
 * Queue an intervention for a future tick. Validates the kind is known
 * and every required field for that kind is present, then keeps
 * `world.pending` sorted by `(tick, insertion order)` —
 * `Array.prototype.sort` is stable (ES2019+), so re-sorting after each
 * push preserves insertion order among equal ticks.
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
export function queueIntervention(world, ev) {
  if (!KNOWN_KINDS.includes(ev.kind)) {
    throw new Error(`unknown intervention kind: ${ev.kind}`);
  }
  for (const field of REQUIRED_FIELDS[ev.kind]) {
    if (!(field in ev)) {
      throw new Error(`intervention "${ev.kind}" is missing required field "${field}"`);
    }
  }
  if (ev.tick < world.tick + 1) {
    throw new Error(
      `intervention tick ${ev.tick} must be >= ${world.tick + 1} (current tick ${world.tick})`,
    );
  }
  world.pending.push(ev);
  world.pending.sort((a, b) => a.tick - b.tick);
}

/**
 * Every integer tile offset `(i, j)` from `(x, y)`'s floored tile with
 * `i*i + j*j <= radius*radius`, visited row-major (`j` outer, `i`
 * inner), clamped to world bounds. Shared by every radius-based
 * intervention (SPEC §5.3), tiles and organisms alike — for organisms,
 * the caller re-checks the exact continuous distance from `(x, y)`
 * itself rather than the tile grid (see `forEachOrganismInRadius`).
 * @param {import('./world.js').World} world
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {(tx: number, ty: number) => void} fn
 * @returns {void}
 */
function forEachTileInRadius(world, x, y, radius, fn) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const r = Math.ceil(radius);
  const r2 = radius * radius;
  for (let j = -r; j <= r; j++) {
    const ty = cy + j;
    if (ty < 0 || ty >= world.height) continue;
    for (let i = -r; i <= r; i++) {
      if (i * i + j * j > r2) continue;
      const tx = cx + i;
      if (tx < 0 || tx >= world.width) continue;
      fn(tx, ty);
    }
  }
}

/**
 * Every living organism within `radius` of the exact point `(x, y)`
 * (continuous distance, not tile-snapped), visited in slot order.
 * @param {import('./world.js').World} world
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {(slot: number) => void} fn
 * @returns {void}
 */
function forEachOrganismInRadius(world, x, y, radius, fn) {
  const store = world.store;
  const r2 = radius * radius;
  for (let i = 0; i < store.highWater; i++) {
    if (!store.alive[i]) continue;
    const dx = store.x[i] - x;
    const dy = store.y[i] - y;
    if (dx * dx + dy * dy > r2) continue;
    fn(i);
  }
}

/**
 * Chronicle a Hand-of-God event with the standard ⚡ prefix.
 * @param {import('./world.js').World} world
 * @param {string} text
 * @param {string} place
 * @returns {void}
 */
function chronicleIntervention(world, text, place) {
  const line = sentence(KIND.INTERVENTION, { text });
  world.chronicle.add(world.tick, KIND.INTERVENTION, line, place, []);
}

/**
 * Fire (SPEC §5.3): plants in radius are destroyed (realised loss ->
 * `ledger.dissipated` and the itemized `ledger.flows.fire`), organisms
 * in radius die (`dying = FIRE`, resolved into carcass like any other
 * death at the end of this tick's `step()`).
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyFire(world, ev) {
  const radius = world.cfg.interventions.fire.radius;
  const plants = world.plants;
  const ledger = world.ledger;

  forEachTileInRadius(world, ev.x, ev.y, radius, (tx, ty) => {
    const idx = ty * world.width + tx;
    const before = plants[idx];
    if (before <= 0) return;
    plants[idx] = 0;
    ledger.dissipated += before;
    ledger.flows.fire += before;
  });

  let n = 0;
  forEachOrganismInRadius(world, ev.x, ev.y, radius, (i) => {
    if (world.dying[i] !== 0) return;
    world.dying[i] = DEATH_FIRE;
    n++;
  });

  const place = regionName(ev.x, ev.y, world.terrain, world.width, world.height);
  chronicleIntervention(world, `Fire sweeps ${place}. ${n} dead.`, place);
}

/**
 * Meteor (SPEC §5.3): terrain in radius becomes rock, plants in radius
 * are destroyed (dissipated only — no itemized flow, unlike fire),
 * organisms in radius die (`dying = METEOR`).
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyMeteor(world, ev) {
  const radius = world.cfg.interventions.meteor.radius;
  const terrain = world.terrain;
  const plants = world.plants;
  const ledger = world.ledger;

  forEachTileInRadius(world, ev.x, ev.y, radius, (tx, ty) => {
    const idx = ty * world.width + tx;
    terrain[idx] = TERRAIN.ROCK;
    const before = plants[idx];
    if (before > 0) {
      plants[idx] = 0;
      ledger.dissipated += before;
    }
  });
  world.terrainDirty = 1;

  let n = 0;
  forEachOrganismInRadius(world, ev.x, ev.y, radius, (i) => {
    if (world.dying[i] !== 0) return;
    world.dying[i] = DEATH_METEOR;
    n++;
  });

  const place = regionName(ev.x, ev.y, world.terrain, world.width, world.height);
  chronicleIntervention(world, `A meteor strikes ${place}. ${n} dead.`, place);
}

/**
 * Plague (SPEC §5.3): every not-already-sick living organism in radius
 * is infected for `disease.durationTicks`, mirroring `disease.js`'s
 * `applyNewlySick` bookkeeping (`store.sick`, the species `sick` count)
 * so the ordinary outbreak-threshold chronicle logic downstream stays
 * accurate.
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyPlague(world, ev) {
  const radius = world.cfg.interventions.plague.radius;
  const duration = world.cfg.disease.durationTicks;
  const store = world.store;
  const species = world.species;

  let n = 0;
  forEachOrganismInRadius(world, ev.x, ev.y, radius, (i) => {
    if (store.sick[i] > 0) return;
    store.sick[i] = Math.min(65535, duration);
    species.sick[store.species[i]]++;
    n++;
  });

  const place = regionName(ev.x, ev.y, world.terrain, world.width, world.height);
  chronicleIntervention(world, `Plague seeded in ${place}; ${n} carriers.`, place);
}

/**
 * River (SPEC §5.3): terrain in radius becomes water, plants on those
 * tiles are destroyed (dissipated), and any organism now standing on
 * water is displaced to the nearest land (the same ring scan
 * `genesis.js`'s `nearestLand` uses for founders/immigrants).
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyRiver(world, ev) {
  const radius = world.cfg.interventions.river.radius;
  const terrain = world.terrain;
  const plants = world.plants;
  const ledger = world.ledger;

  forEachTileInRadius(world, ev.x, ev.y, radius, (tx, ty) => {
    const idx = ty * world.width + tx;
    terrain[idx] = TERRAIN.WATER;
    const before = plants[idx];
    if (before > 0) {
      plants[idx] = 0;
      ledger.dissipated += before;
    }
  });
  world.terrainDirty = 1;

  // Displace standers after the terrain change is fully in place, so
  // `nearestLand` correctly avoids every newly flooded tile.
  const store = world.store;
  for (let i = 0; i < store.highWater; i++) {
    if (!store.alive[i]) continue;
    const tx = Math.floor(store.x[i]);
    const ty = Math.floor(store.y[i]);
    if (terrain[ty * world.width + tx] !== TERRAIN.WATER) continue;
    const land = nearestLand(world, store.x[i], store.y[i]);
    store.x[i] = land.x;
    store.y[i] = land.y;
  }

  const place = regionName(ev.x, ev.y, world.terrain, world.width, world.height);
  chronicleIntervention(world, `Water opened in ${place}.`, place);
}

/**
 * Meadow (SPEC §5.3): non-water terrain in radius becomes grass, and
 * every touched tile's plants are raised to at least `meadow.plants` —
 * the created mass (a gift, not a loss) is counted as `ledger.hand`,
 * same as rain.
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyMeadow(world, ev) {
  const radius = world.cfg.interventions.meadow.radius;
  const minPlants = world.cfg.interventions.meadow.plants;
  const cap = world.cfg.terrain.plantCap[TERRAIN.GRASS];
  const terrain = world.terrain;
  const plants = world.plants;
  const ledger = world.ledger;

  forEachTileInRadius(world, ev.x, ev.y, radius, (tx, ty) => {
    const idx = ty * world.width + tx;
    if (terrain[idx] === TERRAIN.WATER) return;
    terrain[idx] = TERRAIN.GRASS;
    const before = plants[idx];
    const target = Math.min(cap, Math.max(before, minPlants));
    plants[idx] = Math.fround(target);
    ledger.hand += plants[idx] - before;
  });
  world.terrainDirty = 1;

  const place = regionName(ev.x, ev.y, world.terrain, world.width, world.height);
  chronicleIntervention(world, `Meadow laid down in ${place}.`, place);
}

/**
 * Rain (SPEC §5.3): every tile with plant capacity gets a drink, capped at
 * its cap. The realised delta is counted as `ledger.hand`.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
function applyRain(world) {
  const caps = world.cfg.terrain.plantCap;
  const amount = world.cfg.interventions.rain.amount;
  const plants = world.plants;
  const terrain = world.terrain;
  const ledger = world.ledger;

  for (let i = 0; i < plants.length; i++) {
    const cap = caps[terrain[i]];
    if (cap <= 0) continue;
    const before = plants[i];
    const target = Math.min(cap, before + amount);
    plants[i] = Math.fround(target);
    ledger.hand += plants[i] - before;
  }

  chronicleIntervention(world, 'Rain. Every green tile drinks.', 'the whole world');
}

/**
 * Rename (SPEC §3.6, §4.10, §5.3): delegates to `SpeciesTable.rename`,
 * which does its own `naming`-kind chronicling (no ⚡) — no
 * `chronicleIntervention` call here.
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyRename(world, ev) {
  world.species.rename(world, ev.speciesId, ev.name);
}

/**
 * Config keys whose change would resize a typed array, and so can never
 * be applied live (SPEC §5.3).
 * @param {string} key
 * @returns {boolean}
 */
function isSizeChangingKey(key) {
  return key.startsWith('world.') || key === 'brain.hidden' || key === 'stats.historyLength';
}

/**
 * Config (SPEC §3.6, §5.3): apply a live config diff, rejecting any key
 * that would resize a typed array (`world.*`, `brain.hidden`,
 * `stats.historyLength`) before mutating anything.
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyConfigChange(world, ev) {
  const keys = Object.keys(ev.diff);
  for (const key of keys) {
    if (isSizeChangingKey(key)) {
      throw new Error(
        `intervention "config": key "${key}" would resize a buffer and cannot be applied live`,
      );
    }
  }
  const merged = { ...diffConfig(world.cfg), ...ev.diff };
  world.cfg = applyDiff(merged);
  chronicleIntervention(world, `Config changed: ${keys.join(', ')}.`, 'the whole world');
}

/**
 * Apply one intervention's effect (SPEC §5.3).
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyIntervention(world, ev) {
  switch (ev.kind) {
    case 'rain':
      applyRain(world);
      break;
    case 'fire':
      applyFire(world, ev);
      break;
    case 'meteor':
      applyMeteor(world, ev);
      break;
    case 'plague':
      applyPlague(world, ev);
      break;
    case 'river':
      applyRiver(world, ev);
      break;
    case 'meadow':
      applyMeadow(world, ev);
      break;
    case 'rename':
      applyRename(world, ev);
      break;
    case 'config':
      applyConfigChange(world, ev);
      break;
    default:
      throw new Error(`unknown intervention kind: ${ev.kind}`);
  }
}

/**
 * Apply every pending event whose tick equals `world.tick`, in order, and
 * move each into `world.interventions` (the permanent log). This is the
 * first stage of `step()`, after `tick++` and light (SPEC §6.3).
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function applyDue(world) {
  const pending = world.pending;
  let n = 0;
  while (n < pending.length && pending[n].tick === world.tick) {
    n++;
  }
  for (let i = 0; i < n; i++) {
    applyIntervention(world, pending[i]);
    world.interventions.push(pending[i]);
  }
  if (n > 0) {
    pending.splice(0, n);
  }
}
