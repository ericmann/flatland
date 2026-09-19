/**
 * The double-buffered transferable snapshot (SPEC §6.4): one `ArrayBuffer`
 * per frame, encoded on the sim side and decoded on the render side as
 * typed-array *views* (no copies), so the whole thing can be handed across
 * the Worker boundary as a transferable.
 *
 * `src/sim` is not `src/core`: it may read `Math.PI` and use ordinary
 * `Array`/`Map` outside the encode/decode hot arrays, but it still never
 * touches `Math.random`/`Date.now` (eslint) and never mutates `world`
 * state — it only reads.
 */
import {
  genomeLength,
  BRAIN_INPUTS,
  BRAIN_OUTPUTS,
  TRAIT,
  TRAIT_COUNT,
  dietClass,
  visionClass,
} from '../core/genome.js';
import { FLAG_TERRAIN, FLAG_PHEROMONE, FLAG_SELECTED, FLAG_SPECIES } from './protocol.js';

const MAGIC = 0x464c4154; // 'FLAT'
const VERSION = 1;
const HEADER_INTS = 24;
const HEADER_BYTES = HEADER_INTS * 4;
const EVENTS_CAPACITY = 64; // world.js's EVENTS_CAPACITY; events section is sized for the worst case.

// Header field indices (Int32Array(24) at offset 0).
const H_MAGIC = 0;
const H_VERSION = 1;
const H_TICK = 2;
const H_LIGHT_BITS = 3;
const H_N_ORGS = 4;
const H_WIDTH = 5;
const H_HEIGHT = 6;
const H_FLAGS = 7;
const H_SELECTED_SLOT = 8;
const H_TERRAIN_DIRTY = 9;
const H_OFF_ORGS = 10;
const H_OFF_TERRAIN = 11;
const H_OFF_PLANTS = 12;
const H_OFF_CARCASS = 13;
const H_OFF_PHEROMONE = 14;
const H_OFF_SELECTED = 15;
const H_OFF_EVENTS = 16;
const H_BYTE_LENGTH = 17;
const H_EVENTS_COUNT = 18;
const H_ACHIEVED_TPS_X100 = 19;
const H_SPEED_X1000 = 20;
const H_OFF_SPECIES = 21;
const H_SPECIES_COUNT = 22;
// 23 reserved (always zero).

/** `flagsByte` bit layout for one organism (SPEC §6.4): bit 0 sick, bits 1-2 dietClass, bits 3-4 visionClass, bit 5 social (sociality > 0.6). */
const DIET_CODE = Object.freeze({ herbivore: 0, omnivore: 1, carnivore: 2 });
const VISION_CODE = Object.freeze({ nocturnal: 0, crepuscular: 1, diurnal: 2 });

/**
 * Round `offset` up to the next multiple of 4, so the next typed-array
 * view (Float32Array/Int32Array/Uint32Array) can be constructed directly
 * over the buffer without a byteOffset alignment error.
 * @param {number} offset
 * @returns {number}
 */
function align4(offset) {
  return (offset + 3) & ~3;
}

/** Number of family-record scalars appended after the original 12 trailing scalars (P2-06): offspring, livingSiblings, livingKin, speciesBorn, speciesAncestor. */
const FAMILY_SCALARS = 5;

/**
 * The selected-organism record's element count: genome, then the 17
 * brain inputs, then the 8 brain outputs, then 12 trailing scalars
 * (energy, energyMax, age, lifespanTicks, x, y, heading, species,
 * generation, parentId, sick, body), then 5 family-record scalars (P2-06:
 * offspring, livingSiblings, livingKin, speciesBorn, speciesAncestor).
 * @param {typeof import('../core/config.js').DEFAULTS} cfg
 * @returns {number}
 */
function selectedRecordLength(cfg) {
  return genomeLength(cfg) + BRAIN_INPUTS + BRAIN_OUTPUTS + 12 + FAMILY_SCALARS;
}

/** Bytes per species-table row (P2-06): ancestor, born, died, count (Int32) then hue (Float32). */
const SPECIES_ROW_BYTES = 20;

/**
 * The worst-case byte length of a snapshot for `cfg`: full population, and
 * every optional section present. `SnapshotPool` allocates buffers this
 * size so they can be reused for any snapshot regardless of which flags a
 * particular request sets.
 * @param {typeof import('../core/config.js').DEFAULTS} cfg
 * @returns {number}
 */
export function snapshotByteLength(cfg) {
  const n = cfg.world.maxOrganisms;
  const tiles = cfg.world.width * cfg.world.height;

  const orgsBytes = 16 * n + 8 * n + 4 * n + 4 * n; // f32 x4, i32 x2, u32 x1, u8/i8 x4
  const terrainBytes = tiles; // Uint8
  const plantsBytes = tiles * 4; // Float32
  const carcassBytes = tiles * 4; // Float32
  const pheromoneBytes = tiles * 4 * 4; // 4 channels, Float32
  const selectedBytes = selectedRecordLength(cfg) * 4; // Float32
  const eventsBytes = EVENTS_CAPACITY * 6 * 4; // Int32, 6 fields/event
  const speciesBytes = cfg.world.maxSpecies * SPECIES_ROW_BYTES;

  let offset = HEADER_BYTES;
  offset = align4(offset + orgsBytes);
  offset = align4(offset + terrainBytes);
  offset = align4(offset + plantsBytes);
  offset = align4(offset + carcassBytes);
  offset = align4(offset + pheromoneBytes);
  offset = align4(offset + selectedBytes);
  offset = align4(offset + eventsBytes);
  offset = align4(offset + speciesBytes);
  return offset;
}

/**
 * Encode a snapshot of `world` into `buffer` (an `ArrayBuffer` at least
 * `snapshotByteLength(world.cfg)` bytes, from a `SnapshotPool`), writing
 * only typed-array views over it — never allocating a new `ArrayBuffer`.
 *
 * Interpretation: SPEC/PLAN call for the events section to carry "events
 * since the last snapshot", but `world.events` (world.js, out of this
 * task's Files touched) is a fixed 64-slot ring with no persistent read
 * cursor of its own. Without adding one there, this encodes whatever is
 * currently in the ring (`world.events.count` entries, oldest to newest);
 * a caller that requests snapshots more often than the ring wraps will
 * see the same event more than once. A future task that touches
 * world.js's events ring should add a cursor so this can be exact.
 * @param {import('../core/world.js').World} world
 * @param {ArrayBuffer} buffer
 * @param {{ flags: number, selectedId?: number, terrainDirty?: boolean, tps?: number, speed?: number }} opts
 * @returns {number} the number of bytes actually used (<= buffer.byteLength)
 */
export function encodeSnapshot(world, buffer, opts) {
  const { flags, selectedId = 0, terrainDirty = false, tps = 0, speed = 1 } = opts;
  const cfg = world.cfg;
  const store = world.store;
  const width = world.width;
  const height = world.height;
  const tiles = width * height;

  const header = new Int32Array(buffer, 0, HEADER_INTS);

  // --- organisms: compact SoA over living slots, in slot order ---
  let offset = HEADER_BYTES;
  const orgsOffset = offset;
  let n = 0;
  for (let i = 0; i < store.highWater; i++) {
    if (store.alive[i]) n++;
  }

  const orgX = new Float32Array(buffer, offset, n);
  offset += n * 4;
  const orgY = new Float32Array(buffer, offset, n);
  offset += n * 4;
  const orgSize = new Float32Array(buffer, offset, n);
  offset += n * 4;
  const orgHue = new Float32Array(buffer, offset, n);
  offset += n * 4;
  const orgSpecies = new Int32Array(buffer, offset, n);
  offset += n * 4;
  const orgSlot = new Int32Array(buffer, offset, n);
  offset += n * 4;
  const orgId = new Uint32Array(buffer, offset, n);
  offset += n * 4;
  const orgEnergyFrac = new Uint8Array(buffer, offset, n);
  offset += n;
  const orgAgeFrac = new Uint8Array(buffer, offset, n);
  offset += n;
  const orgFlagsByte = new Uint8Array(buffer, offset, n);
  offset += n;
  const orgHeading = new Int8Array(buffer, offset, n);
  offset += n;

  let selectedSlot = -1;
  let w = 0;
  for (let i = 0; i < store.highWater; i++) {
    if (!store.alive[i]) continue;
    const pOff = i * TRAIT_COUNT;
    orgX[w] = store.x[i];
    orgY[w] = store.y[i];
    orgSize[w] = store.pheno[pOff + TRAIT.size];
    orgHue[w] = store.pheno[pOff + TRAIT.hue];
    orgSpecies[w] = store.species[i];
    orgSlot[w] = i;
    orgId[w] = store.id[i];
    orgEnergyFrac[w] = Math.round(
      255 * Math.min(1, Math.max(0, store.energy[i] / store.energyMax[i])),
    );
    orgAgeFrac[w] = Math.round(
      255 * Math.min(1, Math.max(0, store.age[i] / store.lifespanTicks[i])),
    );
    const diet = DIET_CODE[dietClass(store.pheno[pOff + TRAIT.diet])];
    const vision = VISION_CODE[visionClass(store.pheno[pOff + TRAIT.visionPeak])];
    const social = store.pheno[pOff + TRAIT.sociality] > 0.6 ? 1 : 0;
    orgFlagsByte[w] = (store.sick[i] > 0 ? 1 : 0) | (diet << 1) | (vision << 3) | (social << 5);
    orgHeading[w] = Math.max(-127, Math.min(127, Math.round((store.heading[i] / Math.PI) * 127)));
    if (selectedId !== 0 && store.id[i] === selectedId) selectedSlot = i;
    w++;
  }

  // --- terrain (only when FLAG_TERRAIN) ---
  offset = align4(offset);
  const terrainOffset = offset;
  if (flags & FLAG_TERRAIN) {
    new Uint8Array(buffer, offset, tiles).set(world.terrain);
    offset += tiles;
  }

  // --- plants and carcass (always) ---
  offset = align4(offset);
  const plantsOffset = offset;
  new Float32Array(buffer, offset, tiles).set(world.plants);
  offset += tiles * 4;

  const carcassOffset = offset;
  new Float32Array(buffer, offset, tiles).set(world.carcass);
  offset += tiles * 4;

  // --- pheromones (only when FLAG_PHEROMONE) ---
  offset = align4(offset);
  const pheromoneOffset = offset;
  if (flags & FLAG_PHEROMONE) {
    for (let c = 0; c < 4; c++) {
      new Float32Array(buffer, offset, tiles).set(world.pher[c]);
      offset += tiles * 4;
    }
  }

  // --- selected record (only when FLAG_SELECTED and the id is alive) ---
  offset = align4(offset);
  const selectedOffset = offset;
  if (flags & FLAG_SELECTED && selectedSlot !== -1) {
    const gLen = store.genomeLength;
    const rec = new Float32Array(buffer, offset, selectedRecordLength(cfg));
    let k = 0;
    for (let g = 0; g < gLen; g++) rec[k++] = store.genome[selectedSlot * gLen + g];
    for (let ii = 0; ii < BRAIN_INPUTS; ii++)
      rec[k++] = world.inputs[selectedSlot * BRAIN_INPUTS + ii];
    for (let oo = 0; oo < BRAIN_OUTPUTS; oo++)
      rec[k++] = world.outputs[selectedSlot * BRAIN_OUTPUTS + oo];
    rec[k++] = store.energy[selectedSlot];
    rec[k++] = store.energyMax[selectedSlot];
    rec[k++] = store.age[selectedSlot];
    rec[k++] = store.lifespanTicks[selectedSlot];
    rec[k++] = store.x[selectedSlot];
    rec[k++] = store.y[selectedSlot];
    rec[k++] = store.heading[selectedSlot];
    rec[k++] = store.species[selectedSlot];
    rec[k++] = store.generation[selectedSlot];
    rec[k++] = store.parent[selectedSlot];
    rec[k++] = store.sick[selectedSlot];
    rec[k++] = store.body[selectedSlot];

    // Family record (P2-06): offspring and speciesBorn/speciesAncestor
    // are direct field reads; livingKin is the species table's own
    // incrementally-maintained count. livingSiblings needs a dedicated
    // pass over living slots (there is no sibling index), done here since
    // it only matters when a selection exists.
    const selectedParentId = store.parent[selectedSlot];
    const selectedId2 = store.id[selectedSlot];
    let livingSiblings = 0;
    for (let i = 0; i < store.highWater; i++) {
      if (!store.alive[i] || store.id[i] === selectedId2) continue;
      if (store.parent[i] === selectedParentId) livingSiblings++;
    }
    const speciesId = store.species[selectedSlot];

    rec[k++] = store.offspring[selectedSlot];
    rec[k++] = livingSiblings;
    rec[k++] = world.species.count[speciesId];
    rec[k++] = world.species.born[speciesId];
    rec[k] = world.species.ancestor[speciesId];

    offset += selectedRecordLength(cfg) * 4;
  }

  // --- events since the last snapshot (see Interpretation above) ---
  offset = align4(offset);
  const eventsOffset = offset;
  const ev = world.events;
  const eventsCount = ev.count;
  const eventsView = new Int32Array(buffer, offset, eventsCount * 6);
  const start = (ev.head - eventsCount + ev.capacity) % ev.capacity;
  for (let e = 0; e < eventsCount; e++) {
    const idx = (start + e) % ev.capacity;
    const base = e * 6;
    eventsView[base] = ev.kind[idx];
    eventsView[base + 1] = ev.tick[idx];
    eventsView[base + 2] = ev.x[idx];
    eventsView[base + 3] = ev.y[idx];
    eventsView[base + 4] = ev.a[idx];
    eventsView[base + 5] = ev.b[idx];
  }
  offset += eventsCount * 6 * 4;

  // --- species table (only when FLAG_SPECIES): one row per species ever
  // created (SPEC §4.9-4.10), oldest first, matching creation order ---
  offset = align4(offset);
  const speciesOffset = offset;
  const speciesTable = world.species;
  const speciesCount = flags & FLAG_SPECIES ? speciesTable.n : 0;
  if (speciesCount > 0) {
    const spAncestor = new Int32Array(buffer, offset, speciesCount);
    offset += speciesCount * 4;
    const spBorn = new Int32Array(buffer, offset, speciesCount);
    offset += speciesCount * 4;
    const spDied = new Int32Array(buffer, offset, speciesCount);
    offset += speciesCount * 4;
    const spCount = new Int32Array(buffer, offset, speciesCount);
    offset += speciesCount * 4;
    const spHue = new Float32Array(buffer, offset, speciesCount);
    offset += speciesCount * 4;
    for (let id = 0; id < speciesCount; id++) {
      spAncestor[id] = speciesTable.ancestor[id];
      spBorn[id] = speciesTable.born[id];
      spDied[id] = speciesTable.died[id];
      spCount[id] = speciesTable.count[id];
      spHue[id] = speciesTable.hue[id];
    }
  }

  // --- header ---
  const lightBits = new Int32Array(new Float32Array([world.light]).buffer)[0];
  header[H_MAGIC] = MAGIC | 0;
  header[H_VERSION] = VERSION;
  header[H_TICK] = world.tick;
  header[H_LIGHT_BITS] = lightBits;
  header[H_N_ORGS] = n;
  header[H_WIDTH] = width;
  header[H_HEIGHT] = height;
  header[H_FLAGS] = flags;
  header[H_SELECTED_SLOT] = selectedSlot;
  header[H_TERRAIN_DIRTY] = terrainDirty ? 1 : 0;
  header[H_OFF_ORGS] = orgsOffset;
  header[H_OFF_TERRAIN] = terrainOffset;
  header[H_OFF_PLANTS] = plantsOffset;
  header[H_OFF_CARCASS] = carcassOffset;
  header[H_OFF_PHEROMONE] = pheromoneOffset;
  header[H_OFF_SELECTED] = selectedOffset;
  header[H_OFF_EVENTS] = eventsOffset;
  header[H_BYTE_LENGTH] = offset;
  header[H_EVENTS_COUNT] = eventsCount;
  header[H_ACHIEVED_TPS_X100] = Math.round(tps * 100);
  header[H_SPEED_X1000] = Math.round(speed * 1000);
  header[H_OFF_SPECIES] = speciesOffset;
  header[H_SPECIES_COUNT] = speciesCount;
  header[23] = 0;

  return offset;
}

/**
 * Decode a snapshot buffer into typed-array *views* over it (no copies).
 * @param {ArrayBuffer} buffer
 * @returns {*}
 */
export function decodeSnapshot(buffer) {
  const header = new Int32Array(buffer, 0, HEADER_INTS);
  const n = header[H_N_ORGS];
  const width = header[H_WIDTH];
  const height = header[H_HEIGHT];
  const tiles = width * height;
  const flags = header[H_FLAGS];

  let offset = header[H_OFF_ORGS];
  const orgs = {
    n,
    x: new Float32Array(buffer, offset, n),
    y: new Float32Array(buffer, (offset += n * 4), n),
    size: new Float32Array(buffer, (offset += n * 4), n),
    hue: new Float32Array(buffer, (offset += n * 4), n),
    species: new Int32Array(buffer, (offset += n * 4), n),
    slot: new Int32Array(buffer, (offset += n * 4), n),
    id: new Uint32Array(buffer, (offset += n * 4), n),
    energyFrac: new Uint8Array(buffer, (offset += n * 4), n),
    ageFrac: new Uint8Array(buffer, (offset += n), n),
    flagsByte: new Uint8Array(buffer, (offset += n), n),
    heading: new Int8Array(buffer, offset + n, n),
  };

  const terrain =
    flags & FLAG_TERRAIN ? new Uint8Array(buffer, header[H_OFF_TERRAIN], tiles) : undefined;
  const plants = new Float32Array(buffer, header[H_OFF_PLANTS], tiles);
  const carcass = new Float32Array(buffer, header[H_OFF_CARCASS], tiles);

  let pher;
  if (flags & FLAG_PHEROMONE) {
    pher = [];
    let pOff = header[H_OFF_PHEROMONE];
    for (let c = 0; c < 4; c++) {
      pher.push(new Float32Array(buffer, pOff, tiles));
      pOff += tiles * 4;
    }
  }

  let selected;
  const selectedSlot = header[H_SELECTED_SLOT];
  if (flags & FLAG_SELECTED && selectedSlot !== -1) {
    // The record's length isn't stored directly; it's the gap up to the
    // next section (events), which the encoder always places right after.
    const byteLen = header[H_OFF_EVENTS] - header[H_OFF_SELECTED];
    selected = new Float32Array(buffer, header[H_OFF_SELECTED], byteLen / 4);
  }

  const eventsCount = header[H_EVENTS_COUNT];
  const events = new Int32Array(buffer, header[H_OFF_EVENTS], eventsCount * 6);

  let species;
  const speciesCount = header[H_SPECIES_COUNT];
  if (flags & FLAG_SPECIES && speciesCount > 0) {
    let spOff = header[H_OFF_SPECIES];
    species = {
      n: speciesCount,
      ancestor: new Int32Array(buffer, spOff, speciesCount),
      born: new Int32Array(buffer, (spOff += speciesCount * 4), speciesCount),
      died: new Int32Array(buffer, (spOff += speciesCount * 4), speciesCount),
      count: new Int32Array(buffer, (spOff += speciesCount * 4), speciesCount),
      hue: new Float32Array(buffer, spOff + speciesCount * 4, speciesCount),
    };
  }

  const light = new Float32Array(new Int32Array([header[H_LIGHT_BITS]]).buffer)[0];

  return {
    magic: header[H_MAGIC],
    version: header[H_VERSION],
    tick: header[H_TICK],
    light,
    nOrgs: n,
    width,
    height,
    flags,
    selectedSlot,
    terrainDirty: header[H_TERRAIN_DIRTY] === 1,
    byteLength: header[H_BYTE_LENGTH],
    eventsCount,
    achievedTps: header[H_ACHIEVED_TPS_X100] / 100,
    speed: header[H_SPEED_X1000] / 1000,
    orgs,
    terrain,
    plants,
    carcass,
    pher,
    selected,
    events,
    species,
  };
}

/**
 * A small fixed-size pool of reusable snapshot `ArrayBuffer`s (SPEC §6.4:
 * double-buffered), so the sim never allocates a fresh buffer per frame.
 */
export class SnapshotPool {
  /**
   * @param {number} byteLength every buffer's fixed size (from `snapshotByteLength`)
   * @param {number} [n] pool size, default 2 (double-buffered)
   */
  constructor(byteLength, n = 2) {
    this.byteLength = byteLength;
    /** @type {ArrayBuffer[]} */
    this._free = [];
    for (let i = 0; i < n; i++) this._free.push(new ArrayBuffer(byteLength));
  }

  /**
   * @returns {ArrayBuffer|null} a free buffer, or null if none is available.
   */
  acquire() {
    return this._free.length > 0 ? (this._free.pop() ?? null) : null;
  }

  /**
   * Return a buffer to the pool for reuse.
   * @param {ArrayBuffer} buffer
   * @returns {void}
   */
  release(buffer) {
    this._free.push(buffer);
  }
}
