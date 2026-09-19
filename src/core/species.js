/**
 * The species (phylogeny) table (SPEC §4.9-4.10): measures speciation by
 * trait-block drift, tracks who descended from whom, and names every
 * lineage. Determinism (SPEC §3.1, §6.3): species ids are allocated in
 * creation order; assignment happens in slot/queue order from
 * `resolveBirths` (ecology.js).
 */
import { TRAIT, TRAIT_COUNT, traitValue, dietClass, distanceTo } from './genome.js';
import { regionName, speciesName } from './names.js';
import { KIND, sentence, deathVerb } from './chronicle.js';

/** `dietClassAtBirth` codes (local, matching the same 0/1/2 order the P1-13 snapshot encoder's flagsByte uses). */
const DIET_CODE = Object.freeze({ herbivore: 0, omnivore: 1, carnivore: 2 });

/** Sentinel for `SpeciesTable.lastPlagueAt`: "no plague chronicled yet" (P3-03). */
const NEVER_PLAGUED = -1_000_000_000;

export class SpeciesTable {
  /**
   * @param {typeof import('./config.js').DEFAULTS} cfg
   */
  constructor(cfg) {
    const capacity = cfg.world.maxSpecies;
    this.capacity = capacity;
    /** Number of species ever created; also the next id to allocate. */
    this.n = 0;

    /** -1 for a founder (genesis), else the parent species id. */
    this.ancestor = new Int32Array(capacity).fill(-1);
    this.born = new Int32Array(capacity);
    /** -1 while the species is alive. */
    this.died = new Int32Array(capacity).fill(-1);
    this.hue = new Float32Array(capacity);
    this.count = new Int32Array(capacity);
    /** Trait-block centroid in gene space, `capacity x TRAIT_COUNT`. */
    this.centroid = new Float32Array(capacity * TRAIT_COUNT);
    this.originX = new Float32Array(capacity);
    this.originY = new Float32Array(capacity);
    this.dietClassAtBirth = new Uint8Array(capacity);
    /** @type {string[]} */
    this.names = [];
    /** 1 = created/extinct/renamed since the sim last posted a phylogeny event (P2-06); the scheduler clears bits after posting. */
    this.dirty = new Uint8Array(capacity);
    /** Currently-sick member count, maintained incrementally (P3-03: disease.js infects/recovers/kills). */
    this.sick = new Int32Array(capacity);
    /** Tick of this species' last plague chronicle entry, or `NEVER_PLAGUED` (a large negative sentinel, since 0 is a real tick) until its first one. */
    this.lastPlagueAt = new Int32Array(capacity).fill(NEVER_PLAGUED);
  }

  /**
   * Found a new species, seeded from the trait block at `traitsOff` in
   * `world.store.genome`.
   * @param {import('./world.js').World} world
   * @param {number} traitsOff genome offset of the founding member's trait block
   * @param {number} ancestor -1 for a genesis founder, else the parent species id
   * @param {number} x world x of the founding member/event
   * @param {number} y world y of the founding member/event
   * @returns {number} the new species id, or -1 if the table is full
   */
  create(world, traitsOff, ancestor, x, y) {
    if (this.n >= this.capacity) return -1;
    const id = this.n++;
    const genome = world.store.genome;

    this.ancestor[id] = ancestor;
    this.born[id] = world.tick;
    this.died[id] = -1;
    this.count[id] = 0;
    for (let t = 0; t < TRAIT_COUNT; t++) {
      this.centroid[id * TRAIT_COUNT + t] = genome[traitsOff + t];
    }
    this.originX[id] = x;
    this.originY[id] = y;

    const cfg = world.cfg;
    const cls = dietClass(traitValue(cfg, genome[traitsOff + TRAIT.diet], TRAIT.diet));
    this.dietClassAtBirth[id] = DIET_CODE[cls];
    this.hue[id] = traitValue(cfg, genome[traitsOff + TRAIT.hue], TRAIT.hue);

    const ix = Math.min(world.width - 1, Math.max(0, Math.floor(x)));
    const iy = Math.min(world.height - 1, Math.max(0, Math.floor(y)));
    const terrainType = world.terrain[iy * world.width + ix];
    this.names[id] = speciesName(this, cls, terrainType, id);

    this.dirty[id] = 1;
    return id;
  }

  /**
   * Assign a newborn at `slot` to a species (SPEC §4.9): `store.species[slot]`
   * must already be inherited from the parent before this call. Measures
   * the child's trait-block distance from that species' centroid; beyond
   * `species.theta`, founds a new species (chronicled as a `split`);
   * otherwise keeps the parent's species and drifts its centroid toward
   * the child by `species.centroidRate` (an EMA).
   * @param {import('./world.js').World} world
   * @param {number} slot
   * @returns {void}
   */
  assignNewborn(world, slot) {
    const store = world.store;
    const cfg = world.cfg;
    const parentSpecies = store.species[slot];
    const gLen = store.genomeLength;
    const childOff = slot * gLen;
    const centroidOff = parentSpecies * TRAIT_COUNT;

    const d = distanceTo(store.genome, childOff, this.centroid, centroidOff);
    if (d > cfg.species.theta) {
      const newId = this.create(world, childOff, parentSpecies, store.x[slot], store.y[slot]);
      if (newId === -1) {
        world.counters.speciesRefused++;
        this.count[parentSpecies]++;
        return;
      }
      store.species[slot] = newId;
      this.count[newId] = 1;
      world.counters.splits++;

      const place = regionName(
        store.x[slot],
        store.y[slot],
        world.terrain,
        world.width,
        world.height,
      );
      const text = sentence(KIND.SPLIT, {
        name: this.names[newId],
        parent: this.names[parentSpecies],
        place,
      });
      world.chronicle.add(world.tick, KIND.SPLIT, text, place, [newId, parentSpecies]);
    } else {
      this.count[parentSpecies]++;
      const rate = cfg.species.centroidRate;
      for (let t = 0; t < TRAIT_COUNT; t++) {
        const idx = centroidOff + t;
        this.centroid[idx] += (store.genome[childOff + t] - this.centroid[idx]) * rate;
      }
    }
  }

  /**
   * Record one death of a member of `world.store.species[slot]` (SPEC
   * §4.9). At zero remaining members, the species is marked extinct
   * (never deleted) and chronicled.
   * @param {import('./world.js').World} world
   * @param {number} slot
   * @param {number} cause a `world.js` `DEATH` code
   * @returns {void}
   */
  onDeath(world, slot, cause) {
    const store = world.store;
    const id = store.species[slot];
    this.count[id]--;
    // A death from disease itself already zeroed `store.sick[slot]` and
    // decremented this species' `sick` count when the timer expired
    // (disease.js, before `resolve()` runs); this only covers dying sick
    // from some other cause (starved, hunted, ...) mid-illness, timer
    // still running.
    if (store.sick[slot] > 0) {
      this.sick[id]--;
    }
    if (this.count[id] > 0) return;

    this.died[id] = world.tick;
    this.dirty[id] = 1;
    world.counters.extinctions++;
    const place = regionName(
      store.x[slot],
      store.y[slot],
      world.terrain,
      world.width,
      world.height,
    );
    const text = sentence(KIND.EXTINCT, { name: this.names[id], verb: deathVerb(cause), place });
    world.chronicle.add(world.tick, KIND.EXTINCT, text, place, [id]);
  }
}
