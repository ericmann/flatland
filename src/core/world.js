/**
 * The `World` class: all simulation state, allocated up front (SPEC §3.5,
 * §6.3). This task only wires the skeleton (grids, buffers, `step()`,
 * `hash()`); every mechanic (plants, movement, predation, …) arrives in
 * later tasks, each behind its own `enabled` flag.
 *
 * Determinism (SPEC §3.1, §6.3): the only randomness is `world.rng`; no
 * `Math.random`, no `Date`, no timers, no DOM. No per-tick allocation:
 * every buffer a later task needs is allocated here in the constructor.
 */
import { Rng } from './rng.js';
import { lightAt } from './light.js';
import { generateTerrain } from './terrain.js';
import { OrganismStore, HASH_ORDER } from './organisms.js';
import { genomeLength, BRAIN_INPUTS, BRAIN_OUTPUTS } from './genome.js';
import { Ledger } from './ledger.js';
import {
  fillInitialPlants,
  growPlants,
  decayCarcasses,
  eatMeal,
  huntTarget,
  resolvePredationKills,
  checkBreeding,
  resolveBirths,
  checkFamine,
  checkImmigration,
} from './ecology.js';
import { applyDue } from './interventions.js';
import { Grid } from './grid.js';
import { gather } from './senses.js';
import { policy, reflexLayer, act, metabolise, ageOrganism } from './reflex.js';
import { forward } from './brain.js';
import { Chronicle, KIND, sentence } from './chronicle.js';
import { regionName } from './names.js';
import { Stats } from './stats.js';
import { SpeciesTable } from './species.js';
import {
  decay as decayPheromone,
  diffuse as diffusePheromone,
  emit as emitPheromone,
} from './pheromone.js';
import { diseaseTick, applyNewlySick } from './disease.js';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Fold one byte into an FNV-1a 32-bit hash accumulator.
 * @param {number} h
 * @param {number} byte
 * @returns {number}
 */
function hashByte(h, byte) {
  return Math.imul(h ^ byte, FNV_PRIME) >>> 0;
}

/**
 * Fold a byte view into an FNV-1a 32-bit hash accumulator (the
 * `hashUpdate` helper named in the design constraints). Byte views are
 * read in native (little-endian, on every target platform) order.
 * @param {number} h
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function hashUpdate(h, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    h = hashByte(h, bytes[i]);
  }
  return h >>> 0;
}

/**
 * Fold a 32-bit unsigned integer (not already a typed-array byte view)
 * into the hash, 4 bytes, little-endian.
 * @param {number} h
 * @param {number} n
 * @returns {number}
 */
function hashUpdateU32(h, n) {
  h = hashByte(h, n & 0xff);
  h = hashByte(h, (n >>> 8) & 0xff);
  h = hashByte(h, (n >>> 16) & 0xff);
  h = hashByte(h, (n >>> 24) & 0xff);
  return h;
}

/**
 * A byte-level view over a typed array's backing buffer.
 * @param {ArrayBufferView} view
 * @returns {Uint8Array}
 */
function bytesOf(view) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/** Fixed keys of `World.counters`; never grows so it never needs hashing separately. */
const COUNTER_KEYS = Object.freeze([
  'born',
  'starved',
  'oldAge',
  'hunted',
  'fire',
  'meteor',
  'disease',
  'capacityRefused',
  'splits',
  'extinctions',
  'immigrations',
  'speciesRefused',
]);

/** Death cause codes, written into `world.dying` and resolved into `counters` (SPEC §4.5). */
export const DEATH = Object.freeze({
  STARVED: 1,
  OLD_AGE: 2,
  HUNTED: 3,
  FIRE: 4,
  METEOR: 5,
  DISEASE: 6,
});

/** `world.events` ring buffer kinds (SPEC §4.11, consumed by P1-12/P1-15/P3-07). */
export const EV_HUNT = 1;
export const EV_BIRTH = 2;
export const EV_DEATH = 3;
export const EV_IMMIGRATION = 4;

const EVENTS_CAPACITY = 64;

/** Fixed-size kill-aggregation table (SPEC §4.11, P3-07): one row per (prey species, predator species) pair seen today. */
const KILL_ROWS = 256;
/** Once `KILL_ROWS` is full, further pairs count toward their prey species here (predator identity lost). */
const KILL_OVERFLOW = 64;

/** `world.firsts` bitfield bits (P3-07). */
export const FIRST_HUNTERS = 1;
export const FIRST_NIGHT = 2;

/** Sentinel for `lastImmigrationHerb`/`Carn`: "no immigration yet" (P3-06), a large negative value since tick 0 is real. */
const NEVER_IMMIGRATED = -1_000_000_000;

/**
 * Append an event to `world.events`, overwriting the oldest entry once the
 * ring is full.
 * @param {World} world
 * @param {number} kind EV_HUNT | EV_BIRTH | EV_DEATH
 * @param {number} x world x (tile units; floored)
 * @param {number} y world y (tile units; floored)
 * @param {number} a species id (kind-dependent meaning; see call sites)
 * @param {number} b species id (kind-dependent meaning; see call sites)
 * @returns {void}
 */
export function recordEvent(world, kind, x, y, a, b) {
  const ev = world.events;
  const idx = ev.head;
  ev.kind[idx] = kind;
  ev.tick[idx] = world.tick;
  ev.x[idx] = Math.floor(x);
  ev.y[idx] = Math.floor(y);
  ev.a[idx] = a;
  ev.b[idx] = b;
  ev.head = (idx + 1) % ev.capacity;
  if (ev.count < ev.capacity) ev.count++;
}

/**
 * Record one predation kill into today's kill-aggregation table (SPEC
 * §4.11, P3-07): finds (or creates) the row for this (prey, predator)
 * species pair and increments it. Once the fixed-size table is full,
 * further pairs count toward an overflow bucket keyed by prey species
 * only (predator identity is lost there); once that overflow is also
 * full, further kills for a brand-new pair are silently dropped — the
 * documented bound on this fixed-size table.
 * @param {World} world
 * @param {number} preyId prey species id
 * @param {number} predId predator species id
 * @param {number} x world x of the kill
 * @param {number} y world y of the kill
 * @returns {void}
 */
export function recordKill(world, preyId, predId, x, y) {
  for (let r = 0; r < world.killRowCount; r++) {
    if (world.killPrey[r] === preyId && world.killPred[r] === predId) {
      world.killCount[r]++;
      world.killLastX[r] = x;
      world.killLastY[r] = y;
      return;
    }
  }
  if (world.killRowCount < KILL_ROWS) {
    const r = world.killRowCount++;
    world.killPrey[r] = preyId;
    world.killPred[r] = predId;
    world.killCount[r] = 1;
    world.killLastX[r] = x;
    world.killLastY[r] = y;
    return;
  }
  for (let r = 0; r < world.killOverflowRowCount; r++) {
    if (world.killOverflowPrey[r] === preyId) {
      world.killOverflowCount[r]++;
      return;
    }
  }
  if (world.killOverflowRowCount < KILL_OVERFLOW) {
    const r = world.killOverflowRowCount++;
    world.killOverflowPrey[r] = preyId;
    world.killOverflowCount[r] = 1;
  }
}

/**
 * Flush today's kill table into one `hunt-summary` chronicle entry per
 * prey species with at least one kill (SPEC §4.11), then reset the table
 * for the next day. Called at dawn (`tick % ticksPerDay === 0`).
 * @param {World} world
 * @returns {void}
 */
export function flushKillTable(world) {
  if (world.killRowCount === 0 && world.killOverflowRowCount === 0) return;

  /** @type {number[]} prey species ids, in the row order they first appeared. */
  const preyIds = [];
  const seen = new Set();
  for (let r = 0; r < world.killRowCount; r++) {
    if (!seen.has(world.killPrey[r])) {
      seen.add(world.killPrey[r]);
      preyIds.push(world.killPrey[r]);
    }
  }
  for (let r = 0; r < world.killOverflowRowCount; r++) {
    if (!seen.has(world.killOverflowPrey[r])) {
      seen.add(world.killOverflowPrey[r]);
      preyIds.push(world.killOverflowPrey[r]);
    }
  }

  for (const preyId of preyIds) {
    let total = 0;
    let topPred = -1;
    let topCount = -1;
    let distinctPreds = 0;
    let lastX = 0;
    let lastY = 0;
    for (let r = 0; r < world.killRowCount; r++) {
      if (world.killPrey[r] !== preyId) continue;
      total += world.killCount[r];
      distinctPreds++;
      if (world.killCount[r] > topCount) {
        topCount = world.killCount[r];
        topPred = world.killPred[r];
      }
      lastX = world.killLastX[r];
      lastY = world.killLastY[r];
    }
    for (let r = 0; r < world.killOverflowRowCount; r++) {
      if (world.killOverflowPrey[r] === preyId) total += world.killOverflowCount[r];
    }
    if (total < 1) continue;

    const place = regionName(lastX, lastY, world.terrain, world.width, world.height);
    const preyName = world.species.names[preyId];
    const predName = topPred !== -1 ? world.species.names[topPred] : 'something unseen';
    const text = sentence(KIND.HUNT_SUMMARY, {
      n: total,
      prey: preyName,
      pred: predName,
      others: distinctPreds > 1,
      place,
    });
    world.chronicle.add(world.tick, KIND.HUNT_SUMMARY, text, place, [preyId, topPred]);
  }

  world.killRowCount = 0;
  world.killOverflowRowCount = 0;
}

/** DEATH code -> `world.counters` key, index-aligned (index 0 unused). */
const DEATH_COUNTER_KEY = Object.freeze([
  null,
  'starved',
  'oldAge',
  'hunted',
  'fire',
  'meteor',
  'disease',
]);

/**
 * Free every slot marked `dying`, in slot order: its remaining energy plus
 * body mass becomes carcass on its current tile, the cause is counted, and
 * the slot is freed (SPEC §4.5, §6.3). Called once per tick, after every
 * organism has acted.
 * @param {World} world
 * @returns {void}
 */
function resolve(world) {
  const store = world.store;
  const dying = world.dying;
  const carcass = world.carcass;
  const ledger = world.ledger;

  for (let i = 0; i < store.highWater; i++) {
    const cause = dying[i];
    if (cause === 0) continue;
    dying[i] = 0;
    if (!store.alive[i]) continue;

    const amount = Math.max(0, store.energy[i]) + store.body[i];
    const tile = Math.floor(store.y[i]) * world.width + Math.floor(store.x[i]);
    const before = carcass[tile];
    carcass[tile] = Math.fround(before + amount);
    const realised = carcass[tile] - before;
    ledger.dissipated += amount - realised;
    ledger.flows.deaths += amount;

    const key = DEATH_COUNTER_KEY[cause];
    if (key) world.counters[key]++;

    // Predation deaths already recorded EV_HUNT in resolvePredationKills
    // (ecology.js); only record EV_DEATH for the other causes.
    if (cause === DEATH.STARVED || cause === DEATH.OLD_AGE) {
      recordEvent(world, EV_DEATH, store.x[i], store.y[i], store.species[i], cause);
    }

    world.species.onDeath(world, i, cause);
    store.free(i);
  }
}

export class World {
  /**
   * @param {typeof import('./config.js').DEFAULTS} cfg a `makeConfig()` result
   * @param {number} seed uint32 world seed
   * @param {{ terrain?: Uint8Array }} [opts] test-only override: a prebuilt
   *   terrain grid, bypassing seeded generation (SPEC §4.2)
   */
  constructor(cfg, seed, opts = {}) {
    this.cfg = cfg;
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.tick = 0;
    this.light = 0;
    /** 1 = a famine chronicle entry may fire on the next below-threshold sample (P3-05); disarmed after firing, re-armed once plants recover above 2x the threshold. */
    this.famineArmed = 1;
    /** Tick of the last immigration event per diet class (P3-06), or `NEVER_IMMIGRATED` until the first. */
    this.lastImmigrationHerb = NEVER_IMMIGRATED;
    this.lastImmigrationCarn = NEVER_IMMIGRATED;

    this.width = cfg.world.width;
    this.height = cfg.world.height;
    const total = this.width * this.height;

    if (opts.terrain) {
      this.terrain = opts.terrain;
      this.terrainRerolls = 0;
    } else {
      const generated = generateTerrain(this.seed, cfg);
      this.terrain = generated.terrain;
      this.terrainRerolls = generated.rerolls;
    }

    this.plants = new Float32Array(total);
    this.carcass = new Float32Array(total);
    this.soil = new Float32Array(total);
    /** Regrowth debt, in remaining ticks (P3-04): a tile grazed to `regrowth.zeroThreshold` regrows at `regrowth.debtFactor × base` until this hits 0. */
    this.debt = new Uint16Array(total);
    /** Four pheromone channels (SPEC §4.8): decay/diffuse/emit in `pheromone.js`. */
    this.pher = [
      new Float32Array(total),
      new Float32Array(total),
      new Float32Array(total),
      new Float32Array(total),
    ];
    /** Shared diffusion scratch (P3-01): `diffuse()` writes here, then copies back, per channel — never swaps buffers. */
    this.pherScratch = new Float32Array(total);

    /** The energy conservation ledger (SPEC §4.4). */
    this.ledger = new Ledger();
    fillInitialPlants(this);

    const gLen = genomeLength(cfg);
    this.store = new OrganismStore(cfg.world.maxOrganisms, gLen);

    /**
     * Applied interventions, in order (SPEC §3.6).
     * @type {import('./interventions.js').InterventionEvent[]}
     */
    this.interventions = [];
    /**
     * Queued (not yet applied) interventions, sorted by (tick, insertion order).
     * @type {import('./interventions.js').InterventionEvent[]}
     */
    this.pending = [];

    /** @type {Record<string, number>} */
    this.counters = {};
    for (const key of COUNTER_KEYS) {
      this.counters[key] = 0;
    }

    // Scratch buffers for later tasks (SPEC §3.5: no per-tick allocation).
    const cap = cfg.world.maxOrganisms;
    this.inputs = new Float32Array(cap * BRAIN_INPUTS);
    this.outputs = new Float32Array(cap * BRAIN_OUTPUTS);
    /** Scratch hidden-layer activations for `brain.forward` (P2-02), reused across organisms/ticks. */
    this.hidden = new Float32Array(cfg.brain.hidden);
    this.dying = new Uint8Array(cap);
    /** Infections queued this tick, applied after the per-organism loop (P3-03, `disease.js`). */
    this.newlySick = new Uint8Array(cap);
    this.attackTarget = new Int32Array(cap);
    this.birthQueue = new Int32Array(cap);
    /** Number of valid entries currently in `birthQueue` (reset each tick by `resolveBirths`). */
    this.birthQueueLength = 0;
    this.queryOut = new Int32Array(cap);

    /** The per-tick spatial hash (SPEC §6.3), rebuilt in step(). */
    this.grid = new Grid(this.width, this.height, cfg.world.cellSize, cap);

    /**
     * A fixed ring of recent notable events (SPEC §4.11), consumed by the
     * snapshot encoder (P1-12), idle POIs (P1-15) and the chronicle
     * aggregator (P3-07).
     */
    this.events = {
      capacity: EVENTS_CAPACITY,
      kind: new Int32Array(EVENTS_CAPACITY),
      tick: new Int32Array(EVENTS_CAPACITY),
      x: new Int32Array(EVENTS_CAPACITY),
      y: new Int32Array(EVENTS_CAPACITY),
      a: new Int32Array(EVENTS_CAPACITY),
      b: new Int32Array(EVENTS_CAPACITY),
      head: 0,
      count: 0,
    };

    /** Kill-aggregation table (SPEC §4.11, P3-07), flushed into `hunt-summary` chronicle entries at dawn. */
    this.killPrey = new Int32Array(KILL_ROWS).fill(-1);
    this.killPred = new Int32Array(KILL_ROWS).fill(-1);
    this.killCount = new Int32Array(KILL_ROWS);
    this.killLastX = new Float32Array(KILL_ROWS);
    this.killLastY = new Float32Array(KILL_ROWS);
    this.killRowCount = 0;
    /** Once the table above is full, further pairs count here by prey species only. */
    this.killOverflowPrey = new Int32Array(KILL_OVERFLOW).fill(-1);
    this.killOverflowCount = new Int32Array(KILL_OVERFLOW);
    this.killOverflowRowCount = 0;

    /** Bits set once each `first`-kind chronicle entry has fired (P3-07): `FIRST_HUNTERS`, `FIRST_NIGHT`. */
    this.firsts = 0;

    /** Per-organism predation target, set by `ecology.huntTarget` (-1 = none). */
    this.attackTarget.fill(-1);

    /** The append-only chronicle (SPEC §4.11). */
    this.chronicle = new Chronicle();
    /** Periodic ecological samples (SPEC §9.3), a ring buffer over `cfg.stats.historyLength`. */
    this.stats = new Stats(this);
    /** The species (phylogeny) table (SPEC §4.9-4.10). */
    this.species = new SpeciesTable(cfg);
  }

  /**
   * Advance one tick (SPEC §6.3). Later tasks insert further stages here,
   * in order, each behind its own config `enabled` flag.
   * @returns {void}
   */
  step() {
    this.tick++;
    this.light = lightAt(this.tick, this.cfg);
    applyDue(this);
    growPlants(this);
    decayCarcasses(this);
    decayPheromone(this);
    if (this.tick % this.cfg.pheromone.diffuseEvery === 0) {
      diffusePheromone(this);
    }

    this.grid.rebuild(this.store);
    for (let i = 0; i < this.store.highWater; i++) {
      if (!this.store.alive[i]) continue;
      gather(this, i);
      if (this.cfg.brain.enabled) {
        forward(
          this.cfg,
          this.store.genome,
          i * this.store.genomeLength,
          this.inputs,
          i * BRAIN_INPUTS,
          this.outputs,
          i * BRAIN_OUTPUTS,
          this.hidden,
        );
      } else {
        policy(this, i);
      }
      reflexLayer(this, i);
      act(this, i);
      emitPheromone(this, i);
      // Eating and predation-target-finding slot in here (SPEC §6.3,
      // "Eating and predation slot into act in P1-07"); implemented in
      // ecology.js (not reflex.js's act()) since only ecology.js is in
      // this task's Files touched — see the P1-07 log entry.
      eatMeal(this, i);
      if (this.cfg.predation.enabled) {
        huntTarget(this, i);
      }
      metabolise(this, i);
      ageOrganism(this, i);
      diseaseTick(this, i);
      checkBreeding(this, i);
    }
    applyNewlySick(this);
    if (this.cfg.predation.enabled) {
      resolvePredationKills(this);
    }
    resolve(this);
    // Births are resolved after kills and deaths (SPEC §4.5, §6.3), so a
    // parent that died this tick (already freed by resolve() above) does
    // not breed.
    resolveBirths(this);
    checkImmigration(this);

    if (this.tick % this.cfg.stats.sampleEvery === 0) {
      this.stats.sample(this);
      checkFamine(this);
    }
    if (this.tick % this.cfg.time.ticksPerDay === 0) {
      flushKillTable(this);
      this.species.checkFirstNight(this);
    }
  }

  /**
   * A deterministic FNV-1a 32-bit hash of everything that defines world
   * state, as an 8-character lowercase hex string (SPEC §3.1, §6.3). Order:
   * tick, rng state, next organism id, `famineArmed` (P3-05),
   * `lastImmigrationHerb`/`Carn` (P3-06), `firsts` (P3-07 — the kill
   * table itself is transient bookkeeping, like chronicle text, and is
   * not hashed); terrain, plants, carcass, soil,
   * the regrowth debt grid (P3-04), the four pheromone channels; then the
   * organism store's arrays in
   * `HASH_ORDER`; then the species table's `ancestor, born, died, count,
   * centroid` columns (P2-04). Names are strings and are not hashed —
   * they are a function of hashed state plus renames, which are logged
   * interventions (P4-04).
   * @returns {string}
   */
  hash() {
    let h = FNV_OFFSET_BASIS;
    h = hashUpdateU32(h, this.tick >>> 0);
    h = hashUpdateU32(h, this.rng.state >>> 0);
    h = hashUpdateU32(h, this.store.nextId >>> 0);
    h = hashUpdateU32(h, this.famineArmed);
    h = hashUpdateU32(h, this.lastImmigrationHerb);
    h = hashUpdateU32(h, this.lastImmigrationCarn);
    h = hashUpdateU32(h, this.firsts);
    h = hashUpdate(h, bytesOf(this.terrain));
    h = hashUpdate(h, bytesOf(this.plants));
    h = hashUpdate(h, bytesOf(this.carcass));
    h = hashUpdate(h, bytesOf(this.soil));
    h = hashUpdate(h, bytesOf(this.debt));
    for (const p of this.pher) {
      h = hashUpdate(h, bytesOf(p));
    }
    /** @type {*} */
    const store = this.store;
    for (const name of HASH_ORDER) {
      h = hashUpdate(h, bytesOf(store[name]));
    }
    const species = this.species;
    h = hashUpdate(h, bytesOf(species.ancestor));
    h = hashUpdate(h, bytesOf(species.born));
    h = hashUpdate(h, bytesOf(species.died));
    h = hashUpdate(h, bytesOf(species.count));
    h = hashUpdate(h, bytesOf(species.centroid));
    return h.toString(16).padStart(8, '0');
  }
}
