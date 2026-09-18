/**
 * The fixed-capacity structure-of-arrays organism store (SPEC §3.5, §4.5).
 * Every field is a typed array indexed by slot; there is never a
 * per-organism JS object in the hot path.
 *
 * Determinism (SPEC §3.1, §6.3): `alloc()` always returns the lowest free
 * slot, so a given sequence of allocations and frees always produces the
 * same slot assignments regardless of when this code runs. Iteration over
 * organisms elsewhere in the codebase must go `0..highWater` in slot
 * order, skipping dead slots.
 *
 * `TRAIT_COUNT` lives here rather than in genome.js (P1-02) because the
 * constructor must size `pheno` and the derived per-slot arrays at
 * allocation time, and P1-01 cannot depend on P1-02 (the dependency runs
 * the other way). genome.js imports `TRAIT_COUNT` from this module.
 */

/** Number of trait genes in the trait block of the genome (SPEC §4.6). */
export const TRAIT_COUNT = 24;

/**
 * The store's typed-array fields, in the exact order `World.hash()`
 * (P1-03) must consume them. `pheno` and the derived per-slot arrays
 * (energyMax, lifespanTicks, maturityTicks, breedEnergy) are excluded:
 * they are pure functions of `genome`, so hashing the genome already
 * covers them.
 */
export const HASH_ORDER = Object.freeze([
  'alive',
  'id',
  'x',
  'y',
  'heading',
  'energy',
  'body',
  'age',
  'species',
  'parent',
  'generation',
  'sick',
  'flags',
  'genome',
]);

export class OrganismStore {
  /**
   * @param {number} capacity fixed maximum number of live slots
   * @param {number} genomeLength total genome length (trait block + brain weights)
   */
  constructor(capacity, genomeLength) {
    this.capacity = capacity;
    this.genomeLength = genomeLength;

    this.alive = new Uint8Array(capacity);
    /** Stable id, monotonic from 1. 0 means "no organism" (used by `parent`). */
    this.id = new Uint32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.heading = new Float32Array(capacity);
    this.energy = new Float32Array(capacity);
    /** Body mass, paid by the parent at birth and returned to the carcass at death. */
    this.body = new Float32Array(capacity);
    this.age = new Uint32Array(capacity);
    this.species = new Int32Array(capacity);
    /** Parent id (0 = genesis). */
    this.parent = new Uint32Array(capacity);
    this.generation = new Uint16Array(capacity);
    /** Disease timer in ticks; 0 = healthy. */
    this.sick = new Uint16Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.genome = new Float32Array(capacity * genomeLength);

    // Filled by P1-02 (applyPhenotype); allocated here because the store
    // owns the per-slot layout.
    this.pheno = new Float32Array(capacity * TRAIT_COUNT);
    this.energyMax = new Float32Array(capacity);
    this.lifespanTicks = new Float32Array(capacity);
    this.maturityTicks = new Float32Array(capacity);
    this.breedEnergy = new Float32Array(capacity);

    this.count = 0;
    /** One past the highest slot ever used; the bound for slot-order iteration. */
    this.highWater = 0;
    this.nextId = 1;

    /** Lowest slot index not yet known to be occupied (an allocation cursor). */
    this._freeHint = 0;

    /**
     * id -> slot, for UI lookups only (e.g. `select(id)`). Never read or
     * written from the per-tick simulation path.
     * @type {Map<number, number>}
     */
    this._idToSlot = new Map();
  }

  /**
   * Allocate the lowest free slot, or -1 if the store is at capacity.
   * Does not clear any field except `alive` and `id`; the caller is
   * responsible for fully initializing every other field of a newly
   * allocated slot before using it (mirrors `free`, which also zeroes
   * nothing but `alive`).
   * @returns {number}
   */
  alloc() {
    let i = this._freeHint;
    while (i < this.capacity && this.alive[i]) {
      i++;
    }
    if (i >= this.capacity) {
      return -1;
    }
    this.alive[i] = 1;
    this.id[i] = this.nextId++;
    this._idToSlot.set(this.id[i], i);
    if (i + 1 > this.highWater) {
      this.highWater = i + 1;
    }
    this.count++;
    this._freeHint = i + 1;
    return i;
  }

  /**
   * Free a slot. Clears `alive` (and removes the id->slot mapping); zeroes
   * nothing else, so stale data is only ever read by a caller that failed
   * to fully initialize a newly allocated slot.
   * @param {number} slot
   * @returns {void}
   */
  free(slot) {
    if (!this.alive[slot]) {
      return;
    }
    this._idToSlot.delete(this.id[slot]);
    this.alive[slot] = 0;
    this.count--;
    if (slot < this._freeHint) {
      this._freeHint = slot;
    }
  }

  /**
   * A view (not a copy) of the genome for `slot`.
   * @param {number} slot
   * @returns {Float32Array}
   */
  genomeOf(slot) {
    const start = slot * this.genomeLength;
    return this.genome.subarray(start, start + this.genomeLength);
  }

  /**
   * The slot currently holding the living organism with this id, or -1 if
   * there is none (never dead or never allocated). UI-only; never called
   * from the per-tick simulation path.
   * @param {number} id
   * @returns {number}
   */
  slotOfId(id) {
    const slot = this._idToSlot.get(id);
    return slot === undefined ? -1 : slot;
  }
}
