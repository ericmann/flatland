/**
 * Save records and full state snapshots (SPEC §5.6, §6.2).
 *
 * A *record* (`{ seed, configDiff, interventions }`) is the durable,
 * tiny source of truth: a save, a share link and a fixture are all one
 * of these (CLAUDE.md rule 4, "a world is a seed plus its history").
 * `encodeRecord`/`decodeRecord` (de)serialize it as JSON.
 *
 * A *state* (an `ArrayBuffer`) is a cache: everything needed to resume a
 * `World` at its current tick without replaying from genesis, so a
 * restored world hashes identically to its source and stays identical
 * afterwards (SPEC §3.1, §3.4). It intentionally excludes anything that
 * is pure per-tick scratch, cleared and refilled before being read again
 * within the same `step()`: `world.grid` (rebuilt every tick),
 * `inputs`/`outputs`/`hidden` (brain scratch), `dying`, `newlySick`,
 * `attackTarget`, `birthQueue`/`birthQueueLength`, `queryOut`. It also
 * excludes `store.pheno`/`energyMax`/`lifespanTicks`/`maturityTicks`/
 * `breedEnergy`, recomputed on restore via `applyPhenotype` since they
 * are pure functions of `genome` + `cfg` (the same reason `hash()`
 * excludes them, `organisms.js`'s `HASH_ORDER` comment).
 *
 * Determinism (SPEC §3.1, §3.4): every typed-array field a source world
 * could read is copied byte-for-byte, in the same fixed section order
 * every time, so `encodeState`/`restoreState` round-trip exactly and
 * `stateHash` (an FNV-1a hash of the raw bytes, matching `world.hash()`'s
 * algorithm) is a pure function of the buffer's contents.
 */
import { diffConfig, applyDiff } from './config.js';
import { applyPhenotype } from './genome.js';

const MAGIC = 0x464c5354; // 'FLST'
const VERSION = 1;
/** Header layout: `Int32Array(8)`, SPEC §5.6's design constraint. */
const HEADER_INTS = 8;
const HEADER_BYTES = HEADER_INTS * 4;

/** Section id for the fixed-layout scalar block (see `SCALAR_FIELDS`). */
const SEC_SCALARS = 0;
/** Section id for the ledger's doubles (see `LEDGER_FIELDS`). */
const SEC_LEDGER = 100;
/** Section id for `world.counters`, packed in `Object.keys()` order. */
const SEC_COUNTERS = 101;
/** Section id for float64 scalars outside the ledger (see `FLOAT_SCALAR_FIELDS`). */
const SEC_FLOAT_SCALARS = 102;
/** Section id for the UTF-8 JSON blob (chronicle, species names, interventions, pending). */
const SEC_JSON = 200;
/** Typed-array sections start here, one id per field in `typedFields()`. */
const SEC_TYPED_BASE = 1000;

/**
 * Scalar (non-array) `World` fields that round out what `HASH_ORDER`
 * already covers, in a fixed order matching `SEC_SCALARS`'s Int32Array.
 * Values that are conceptually unsigned (`rng.state`, `store.nextId`,
 * counts) are stored as raw 32-bit patterns and read back with `>>> 0`.
 * @type {[string, (w: import('./world.js').World) => number, (w: import('./world.js').World, v: number) => void][]}
 */
const SCALAR_FIELDS = [
  ['rng.state', (w) => w.rng.state, (w, v) => (w.rng.state = v >>> 0)],
  ['famineArmed', (w) => w.famineArmed, (w, v) => (w.famineArmed = v)],
  ['lastImmigrationHerb', (w) => w.lastImmigrationHerb, (w, v) => (w.lastImmigrationHerb = v)],
  ['lastImmigrationCarn', (w) => w.lastImmigrationCarn, (w, v) => (w.lastImmigrationCarn = v)],
  ['firsts', (w) => w.firsts, (w, v) => (w.firsts = v)],
  ['terrainRerolls', (w) => w.terrainRerolls, (w, v) => (w.terrainRerolls = v)],
  ['store.count', (w) => w.store.count, (w, v) => (w.store.count = v)],
  ['store.highWater', (w) => w.store.highWater, (w, v) => (w.store.highWater = v)],
  ['store.nextId', (w) => w.store.nextId, (w, v) => (w.store.nextId = v >>> 0)],
  ['species.n', (w) => w.species.n, (w, v) => (w.species.n = v)],
  ['killRowCount', (w) => w.killRowCount, (w, v) => (w.killRowCount = v)],
  ['killOverflowRowCount', (w) => w.killOverflowRowCount, (w, v) => (w.killOverflowRowCount = v)],
  ['events.head', (w) => w.events.head, (w, v) => (w.events.head = v)],
  ['events.count', (w) => w.events.count, (w, v) => (w.events.count = v)],
  ['stats.head', (w) => w.stats.head, (w, v) => (w.stats.head = v)],
  ['stats.n', (w) => w.stats.n, (w, v) => (w.stats.n = v)],
];

/**
 * `world.ledger`'s doubles, in a fixed order matching `SEC_LEDGER`'s
 * Float64Array. Stored as `Float64`, not `Float32`, so the conservation
 * identity's accumulated doubles round-trip exactly.
 * @type {[string, (w: import('./world.js').World) => number, (w: import('./world.js').World, v: number) => void][]}
 */
const LEDGER_FIELDS = [
  ['genesis', (w) => w.ledger.genesis, (w, v) => (w.ledger.genesis = v)],
  ['sunlight', (w) => w.ledger.sunlight, (w, v) => (w.ledger.sunlight = v)],
  ['hand', (w) => w.ledger.hand, (w, v) => (w.ledger.hand = v)],
  ['immigration', (w) => w.ledger.immigration, (w, v) => (w.ledger.immigration = v)],
  ['dissipated', (w) => w.ledger.dissipated, (w, v) => (w.ledger.dissipated = v)],
  [
    'flows.photosynthesis',
    (w) => w.ledger.flows.photosynthesis,
    (w, v) => (w.ledger.flows.photosynthesis = v),
  ],
  ['flows.uptake', (w) => w.ledger.flows.uptake, (w, v) => (w.ledger.flows.uptake = v)],
  ['flows.decay', (w) => w.ledger.flows.decay, (w, v) => (w.ledger.flows.decay = v)],
  ['flows.grazing', (w) => w.ledger.flows.grazing, (w, v) => (w.ledger.flows.grazing = v)],
  ['flows.scavenging', (w) => w.ledger.flows.scavenging, (w, v) => (w.ledger.flows.scavenging = v)],
  ['flows.predation', (w) => w.ledger.flows.predation, (w, v) => (w.ledger.flows.predation = v)],
  ['flows.metabolism', (w) => w.ledger.flows.metabolism, (w, v) => (w.ledger.flows.metabolism = v)],
  ['flows.births', (w) => w.ledger.flows.births, (w, v) => (w.ledger.flows.births = v)],
  ['flows.deaths', (w) => w.ledger.flows.deaths, (w, v) => (w.ledger.flows.deaths = v)],
  ['flows.fire', (w) => w.ledger.flows.fire, (w, v) => (w.ledger.flows.fire = v)],
];

/**
 * Float64 scalar `World` fields that don't belong to the ledger, in a
 * fixed order matching `SEC_FLOAT_SCALARS`'s Float64Array. `ambient`
 * lives here (not `SCALAR_FIELDS`, whose Int32Array truncates fractional
 * values) since it is a fractional scalar with history a source world
 * could read (P5-01, SPEC §4.3).
 * @type {[string, (w: import('./world.js').World) => number, (w: import('./world.js').World, v: number) => void][]}
 */
const FLOAT_SCALAR_FIELDS = [['ambient', (w) => w.ambient, (w, v) => (w.ambient = v)]];

/**
 * Every typed-array field the state must carry, freshly resolved against
 * a given `world` (so it works both for a live source world at encode
 * time and a just-constructed destination world at restore time). Order
 * is the section id order (`SEC_TYPED_BASE + index`); never reorder
 * without bumping `VERSION`.
 * @param {import('./world.js').World} world
 * @returns {ArrayBufferView[]}
 */
function typedFields(world) {
  const s = world.store;
  const sp = world.species;
  const st = world.stats;
  const ev = world.events;
  return [
    world.terrain,
    world.plants,
    world.carcass,
    world.soil,
    world.debt,
    world.pher[0],
    world.pher[1],
    world.pher[2],
    world.pher[3],
    s.alive,
    s.id,
    s.x,
    s.y,
    s.heading,
    s.energy,
    s.body,
    s.age,
    s.species,
    s.parent,
    s.generation,
    s.sick,
    s.flags,
    s.offspring,
    s.genome,
    sp.ancestor,
    sp.born,
    sp.died,
    sp.hue,
    sp.count,
    sp.centroid,
    sp.originX,
    sp.originY,
    sp.dietClassAtBirth,
    sp.dirty,
    sp.sick,
    sp.lastPlagueAt,
    st.tick,
    st.light,
    st.pop,
    st.herb,
    st.omni,
    st.carn,
    st.plantsFraction,
    st.diversity,
    st.speciesLiving,
    ev.kind,
    ev.tick,
    ev.x,
    ev.y,
    ev.a,
    ev.b,
    world.killPrey,
    world.killPred,
    world.killCount,
    world.killLastX,
    world.killLastY,
    world.killOverflowPrey,
    world.killOverflowCount,
  ];
}

/**
 * A byte-level view over a typed array's backing buffer (matching
 * `world.js`'s own `bytesOf`, duplicated here since it isn't exported).
 * @param {ArrayBufferView} view
 * @returns {Uint8Array}
 */
function bytesOf(view) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/**
 * Round a byte count up to the next multiple of 4 (SPEC §5.6: sections
 * are 4-byte aligned).
 * @param {number} n
 * @returns {number}
 */
function align4(n) {
  return (n + 3) & ~3;
}

/**
 * The JSON-serializable, variable-length parts of `world`'s state (SPEC
 * §5.6): the chronicle, species names and the intervention queues.
 * @param {import('./world.js').World} world
 * @returns {*}
 */
function jsonBlob(world) {
  return {
    chronicleEntries: world.chronicle.entries,
    chroniclePendingFrom: world.chronicle.pendingFrom,
    speciesNames: world.species.names,
    interventions: world.interventions,
    pending: world.pending,
  };
}

/**
 * The exact byte length `encodeState(world)` will produce.
 * @param {import('./world.js').World} world
 * @returns {number}
 */
export function stateByteLength(world) {
  let total = HEADER_BYTES;
  total += 8 + align4(SCALAR_FIELDS.length * 4);
  total += 8 + align4(LEDGER_FIELDS.length * 8);
  total += 8 + align4(FLOAT_SCALAR_FIELDS.length * 8);
  total += 8 + align4(Object.keys(world.counters).length * 4);
  total += 8 + align4(new TextEncoder().encode(JSON.stringify(jsonBlob(world))).byteLength);
  for (const field of typedFields(world)) {
    total += 8 + align4(field.byteLength);
  }
  return total;
}

/**
 * Encode `world`'s full simulation state (SPEC §5.6) into a transferable
 * `ArrayBuffer`. Writes into `buffer` in place when given and large
 * enough (the scheduler preallocates two, alternating, so a snapshot
 * never allocates on the hot path); otherwise allocates a new one sized
 * exactly by `stateByteLength`.
 * @param {import('./world.js').World} world
 * @param {ArrayBuffer} [buffer]
 * @returns {ArrayBuffer}
 */
export function encodeState(world, buffer) {
  const byteLength = stateByteLength(world);
  const buf = buffer && buffer.byteLength >= byteLength ? buffer : new ArrayBuffer(byteLength);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  view.setInt32(0, MAGIC, true);
  view.setInt32(4, VERSION, true);
  view.setInt32(8, world.tick, true);
  view.setInt32(12, byteLength, true);

  let offset = HEADER_BYTES;
  let sectionCount = 0;

  // Scalars.
  {
    const scratch = new Int32Array(SCALAR_FIELDS.length);
    for (let i = 0; i < SCALAR_FIELDS.length; i++) scratch[i] = SCALAR_FIELDS[i][1](world) | 0;
    const payload = bytesOf(scratch);
    view.setInt32(offset, SEC_SCALARS, true);
    view.setInt32(offset + 4, payload.byteLength, true);
    bytes.set(payload, offset + 8);
    offset += align4(8 + payload.byteLength);
    sectionCount++;
  }

  // Ledger.
  {
    const scratch = new Float64Array(LEDGER_FIELDS.length);
    for (let i = 0; i < LEDGER_FIELDS.length; i++) scratch[i] = LEDGER_FIELDS[i][1](world);
    const payload = bytesOf(scratch);
    view.setInt32(offset, SEC_LEDGER, true);
    view.setInt32(offset + 4, payload.byteLength, true);
    bytes.set(payload, offset + 8);
    offset += align4(8 + payload.byteLength);
    sectionCount++;
  }

  // Float scalars outside the ledger (currently just `ambient`, P5-01).
  {
    const scratch = new Float64Array(FLOAT_SCALAR_FIELDS.length);
    for (let i = 0; i < FLOAT_SCALAR_FIELDS.length; i++)
      scratch[i] = FLOAT_SCALAR_FIELDS[i][1](world);
    const payload = bytesOf(scratch);
    view.setInt32(offset, SEC_FLOAT_SCALARS, true);
    view.setInt32(offset + 4, payload.byteLength, true);
    bytes.set(payload, offset + 8);
    offset += align4(8 + payload.byteLength);
    sectionCount++;
  }

  // Counters, in this world's own key order.
  {
    const keys = Object.keys(world.counters);
    const scratch = new Int32Array(keys.length);
    for (let i = 0; i < keys.length; i++) scratch[i] = world.counters[keys[i]] | 0;
    const payload = bytesOf(scratch);
    view.setInt32(offset, SEC_COUNTERS, true);
    view.setInt32(offset + 4, payload.byteLength, true);
    bytes.set(payload, offset + 8);
    offset += align4(8 + payload.byteLength);
    sectionCount++;
  }

  // JSON blob.
  {
    const payload = new TextEncoder().encode(JSON.stringify(jsonBlob(world)));
    view.setInt32(offset, SEC_JSON, true);
    view.setInt32(offset + 4, payload.byteLength, true);
    bytes.set(payload, offset + 8);
    offset += align4(8 + payload.byteLength);
    sectionCount++;
  }

  // Typed-array fields, one section per field.
  const fields = typedFields(world);
  for (let i = 0; i < fields.length; i++) {
    const payload = bytesOf(fields[i]);
    view.setInt32(offset, SEC_TYPED_BASE + i, true);
    view.setInt32(offset + 4, payload.byteLength, true);
    bytes.set(payload, offset + 8);
    offset += align4(8 + payload.byteLength);
    sectionCount++;
  }

  view.setInt32(16, sectionCount, true);
  view.setInt32(20, world.width, true);
  view.setInt32(24, world.height, true);
  view.setInt32(28, 0, true); // reserved.

  // A caller-supplied buffer keeps its own identity/size (so the
  // scheduler's pooled buffers stay poolable); only a freshly allocated
  // one is already exactly `byteLength`. Either way, the true content
  // length is in the header (offset 12) for `stateHash`/`restoreState`.
  return buf;
}

/**
 * Read one `{ id, payload }` section starting at `offset`, and return the
 * offset of the section that follows.
 * @param {DataView} view
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {{ id: number, payload: Uint8Array, next: number }}
 */
function readSection(view, bytes, offset) {
  const id = view.getInt32(offset, true);
  const byteLength = view.getInt32(offset + 4, true);
  const payload = bytes.subarray(offset + 8, offset + 8 + byteLength);
  const next = offset + align4(8 + byteLength);
  return { id, payload, next };
}

/**
 * Restore `world` in place from a state buffer produced by `encodeState`
 * (SPEC §3.1, §3.4: the result hashes identically to the source at the
 * same tick and steps identically afterwards). `world` must already be
 * constructed from the same `cfg` (same array capacities) the state was
 * encoded from — `World.fromState` does this for you.
 * @param {import('./world.js').World} world
 * @param {ArrayBuffer} buffer
 * @returns {void}
 */
export function restoreState(world, buffer) {
  const view = new DataView(buffer);
  if (view.getInt32(0, true) !== MAGIC) {
    throw new Error('save.restoreState: bad magic (not a Flatland state buffer)');
  }
  const version = view.getInt32(4, true);
  if (version !== VERSION) {
    throw new Error(`save.restoreState: unsupported version ${version} (expected ${VERSION})`);
  }
  const tick = view.getInt32(8, true);
  const sectionCount = view.getInt32(16, true);
  const width = view.getInt32(20, true);
  const height = view.getInt32(24, true);
  if (width !== world.width || height !== world.height) {
    throw new Error(
      `save.restoreState: world size ${world.width}x${world.height} does not match state ${width}x${height}`,
    );
  }

  world.tick = tick;

  const fields = typedFields(world);
  const bytes = new Uint8Array(buffer);
  let offset = HEADER_BYTES;
  for (let s = 0; s < sectionCount; s++) {
    const { id, payload, next } = readSection(view, bytes, offset);
    offset = next;

    if (id === SEC_SCALARS) {
      const scratch = new Int32Array(payload.buffer, payload.byteOffset, payload.byteLength / 4);
      for (let i = 0; i < SCALAR_FIELDS.length; i++) SCALAR_FIELDS[i][2](world, scratch[i]);
    } else if (id === SEC_LEDGER) {
      const scratch = new Float64Array(payload.buffer, payload.byteOffset, payload.byteLength / 8);
      for (let i = 0; i < LEDGER_FIELDS.length; i++) LEDGER_FIELDS[i][2](world, scratch[i]);
    } else if (id === SEC_FLOAT_SCALARS) {
      const scratch = new Float64Array(payload.buffer, payload.byteOffset, payload.byteLength / 8);
      for (let i = 0; i < FLOAT_SCALAR_FIELDS.length; i++)
        FLOAT_SCALAR_FIELDS[i][2](world, scratch[i]);
    } else if (id === SEC_COUNTERS) {
      const keys = Object.keys(world.counters);
      const scratch = new Int32Array(payload.buffer, payload.byteOffset, payload.byteLength / 4);
      for (let i = 0; i < keys.length; i++) world.counters[keys[i]] = scratch[i];
    } else if (id === SEC_JSON) {
      const text = new TextDecoder().decode(payload);
      const blob = JSON.parse(text);
      world.chronicle.entries = blob.chronicleEntries;
      world.chronicle.pendingFrom = blob.chroniclePendingFrom;
      world.species.names = blob.speciesNames;
      world.interventions = blob.interventions;
      world.pending = blob.pending;
    } else {
      const i = id - SEC_TYPED_BASE;
      const dest = fields[i];
      const destBytes = bytesOf(dest);
      if (destBytes.byteLength !== payload.byteLength) {
        throw new Error(
          `save.restoreState: field ${i} byte length mismatch (state has ${payload.byteLength}, world expects ${destBytes.byteLength})`,
        );
      }
      destBytes.set(payload);
    }
  }

  // pheno/energyMax/lifespanTicks/maturityTicks/breedEnergy are pure
  // functions of genome + cfg (see this module's header comment) —
  // recompute rather than store.
  const store = world.store;
  store._idToSlot.clear();
  store._freeHint = 0;
  for (let i = 0; i < store.highWater; i++) {
    if (!store.alive[i]) continue;
    applyPhenotype(world.cfg, store, i);
    store._idToSlot.set(store.id[i], i);
  }
}

/**
 * An FNV-1a hash of a state buffer's raw bytes, matching `World.hash()`'s
 * algorithm — a pure function of the buffer's contents, so two encodes of
 * the same world (or two buffers meant to represent the same state)
 * agree iff their bytes agree.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function stateHash(buffer) {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  // Hash only the true content (header offset 12), not a caller-supplied
  // buffer's possibly-larger, stale-tailed length (see `encodeState`).
  const byteLength = new DataView(buffer).getInt32(12, true);
  const bytes = new Uint8Array(buffer, 0, byteLength);
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i++) {
    h = Math.imul(h ^ bytes[i], FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * A save/share record (SPEC §5.6): a seed, a config diff (never the full
 * config) and the ordered intervention log. `encodeRecord` -> JSON
 * string; `decodeRecord` -> the plain object, with `config` already a
 * full `makeConfig()` result.
 * @param {{ seed: number, config: typeof import('./config.js').DEFAULTS, interventions: import('./interventions.js').InterventionEvent[] }} record
 * @returns {string}
 */
export function encodeRecord({ seed, config, interventions }) {
  return JSON.stringify({ seed, configDiff: diffConfig(config), interventions });
}

/**
 * @param {string} json
 * @returns {{ seed: number, config: typeof import('./config.js').DEFAULTS, interventions: import('./interventions.js').InterventionEvent[] }}
 */
export function decodeRecord(json) {
  const obj = JSON.parse(json);
  return {
    seed: obj.seed,
    config: applyDiff(obj.configDiff),
    interventions: obj.interventions,
  };
}
