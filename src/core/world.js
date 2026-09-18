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
} from './ecology.js';
import { applyDue } from './interventions.js';
import { Grid } from './grid.js';
import { gather } from './senses.js';
import { policy, reflexLayer, act, metabolise, ageOrganism } from './reflex.js';

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

const EVENTS_CAPACITY = 64;

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
    /** Four pheromone channels (SPEC §4.8), zero until P3-01 wires emission/decay. */
    this.pher = [
      new Float32Array(total),
      new Float32Array(total),
      new Float32Array(total),
      new Float32Array(total),
    ];

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
    this.dying = new Uint8Array(cap);
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

    /** Per-organism predation target, set by `ecology.huntTarget` (-1 = none). */
    this.attackTarget.fill(-1);
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

    this.grid.rebuild(this.store);
    for (let i = 0; i < this.store.highWater; i++) {
      if (!this.store.alive[i]) continue;
      gather(this, i);
      policy(this, i);
      reflexLayer(this, i);
      act(this, i);
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
      checkBreeding(this, i);
    }
    if (this.cfg.predation.enabled) {
      resolvePredationKills(this);
    }
    resolve(this);
    // Births are resolved after kills and deaths (SPEC §4.5, §6.3), so a
    // parent that died this tick (already freed by resolve() above) does
    // not breed.
    resolveBirths(this);
  }

  /**
   * A deterministic FNV-1a 32-bit hash of everything that defines world
   * state, as an 8-character lowercase hex string (SPEC §3.1, §6.3). Order:
   * tick, rng state, next organism id; terrain, plants, carcass, soil,
   * the four pheromone channels; then the organism store's arrays in
   * `HASH_ORDER`. The species table (P2-04) appends its columns later.
   * @returns {string}
   */
  hash() {
    let h = FNV_OFFSET_BASIS;
    h = hashUpdateU32(h, this.tick >>> 0);
    h = hashUpdateU32(h, this.rng.state >>> 0);
    h = hashUpdateU32(h, this.store.nextId >>> 0);
    h = hashUpdate(h, bytesOf(this.terrain));
    h = hashUpdate(h, bytesOf(this.plants));
    h = hashUpdate(h, bytesOf(this.carcass));
    h = hashUpdate(h, bytesOf(this.soil));
    for (const p of this.pher) {
      h = hashUpdate(h, bytesOf(p));
    }
    /** @type {*} */
    const store = this.store;
    for (const name of HASH_ORDER) {
      h = hashUpdate(h, bytesOf(store[name]));
    }
    return h.toString(16).padStart(8, '0');
  }
}
