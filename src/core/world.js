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
import { fillInitialPlants, growPlants, decayCarcasses } from './ecology.js';
import { applyDue } from './interventions.js';
import { Grid } from './grid.js';
import { gather } from './senses.js';

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

    /** Applied interventions, in order (SPEC §3.6). */
    this.interventions = [];
    /** Queued (not yet applied) interventions, used starting P1-04. */
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
    this.queryOut = new Int32Array(cap);

    /** The per-tick spatial hash (SPEC §6.3), rebuilt in step(). */
    this.grid = new Grid(this.width, this.height, cfg.world.cellSize, cap);
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
      if (this.store.alive[i]) {
        gather(this, i);
      }
    }
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
