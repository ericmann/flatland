/**
 * Periodic ecological samples (SPEC §5.2, §6.3, §9.3): population by diet
 * class and species, plants fraction, Shannon diversity, and per-interval
 * trophic-flow deltas (P4-07). A fixed-capacity ring buffer, no allocation
 * after construction (SPEC §3.5).
 *
 * Determinism (SPEC §3.1, §6.3): slot-order/row-major loops, `fmath.log`
 * only.
 */
import { log } from './fmath.js';
import { TRAIT, TRAIT_COUNT, dietClass } from './genome.js';

/** The six trophic-flow ledger keys sampled for the Charts pane's flow chart (P4-07, SPEC §5.2). */
export const FLOW_KEYS = Object.freeze([
  'photosynthesis',
  'grazing',
  'predation',
  'scavenging',
  'decay',
  'metabolism',
]);

export class Stats {
  /**
   * @param {import('./world.js').World} world
   */
  constructor(world) {
    const capacity = world.cfg.stats.historyLength;
    this.capacity = capacity;
    this.tick = new Int32Array(capacity);
    this.light = new Float32Array(capacity);
    this.pop = new Int32Array(capacity);
    this.herb = new Int32Array(capacity);
    this.omni = new Int32Array(capacity);
    this.carn = new Int32Array(capacity);
    this.plantsFraction = new Float32Array(capacity);
    this.diversity = new Float32Array(capacity);
    this.speciesLiving = new Int32Array(capacity);

    /**
     * Per-interval delta of each `world.ledger.flows` key (P4-07), one ring
     * column per key. `prevFlows` holds the ledger's cumulative totals as
     * of the last sample, so `sample()` can record this interval's delta
     * (`current - prevFlows[key]`) rather than the running total.
     * @type {Record<string, Float32Array>}
     */
    this.flows = {};
    /** @type {Record<string, number>} */
    this.prevFlows = {};
    /** @type {Record<string, number>} */
    const ledgerFlows = world.ledger.flows;
    for (const key of FLOW_KEYS) {
      this.flows[key] = new Float32Array(capacity);
      this.prevFlows[key] = ledgerFlows[key];
    }

    /** Per-species-id count scratch, reused every sample; never allocated per-tick. */
    this.speciesCount = new Int32Array(world.cfg.world.maxSpecies);

    this.head = 0;
    /** Number of valid samples so far, capped at `capacity`. */
    this.n = 0;

    /** A reference to `world.counters` (SPEC: same fixed-key object, not a copy). */
    this.counters = world.counters;
  }

  /**
   * Take one sample of `world`'s current ecological state (SPEC §9.3).
   * @param {import('./world.js').World} world
   * @returns {void}
   */
  sample(world) {
    const store = world.store;
    const speciesCount = this.speciesCount;
    speciesCount.fill(0);

    let pop = 0;
    let herb = 0;
    let omni = 0;
    let carn = 0;

    for (let i = 0; i < store.highWater; i++) {
      if (!store.alive[i]) continue;
      pop++;
      const d = store.pheno[i * TRAIT_COUNT + TRAIT.diet];
      const cls = dietClass(d);
      if (cls === 'herbivore') herb++;
      else if (cls === 'carnivore') carn++;
      else omni++;

      const sp = store.species[i];
      if (sp >= 0 && sp < speciesCount.length) speciesCount[sp]++;
    }

    let capSum = 0;
    let plantSum = 0;
    const caps = world.cfg.terrain.plantCap;
    const terrain = world.terrain;
    const plants = world.plants;
    for (let i = 0; i < terrain.length; i++) {
      capSum += caps[terrain[i]];
      plantSum += plants[i];
    }
    const plantsFraction = capSum > 0 ? plantSum / capSum : 0;

    let diversity = 0;
    let speciesLiving = 0;
    if (pop > 0) {
      for (let sp = 0; sp < speciesCount.length; sp++) {
        const c = speciesCount[sp];
        if (c === 0) continue;
        speciesLiving++;
        const p = c / pop;
        diversity -= p * log(p);
      }
    }

    const idx = this.head;
    this.tick[idx] = world.tick;
    this.light[idx] = world.light;
    this.pop[idx] = pop;
    this.herb[idx] = herb;
    this.omni[idx] = omni;
    this.carn[idx] = carn;
    this.plantsFraction[idx] = plantsFraction;
    this.diversity[idx] = diversity;
    this.speciesLiving[idx] = speciesLiving;

    /** @type {Record<string, number>} */
    const ledgerFlows = world.ledger.flows;
    for (const key of FLOW_KEYS) {
      const current = ledgerFlows[key];
      this.flows[key][idx] = current - this.prevFlows[key];
      this.prevFlows[key] = current;
    }

    this.head = (idx + 1) % this.capacity;
    if (this.n < this.capacity) this.n++;
  }
}
