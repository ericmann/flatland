/**
 * The energy ledger (SPEC §4.4). Tracks, in double precision, everything
 * needed to check the conservation identity:
 *
 *   Σ plants + Σ organism energy + Σ carcass + Σ soil + dissipated
 *     == genesis + Σ sunlight input + hand
 *
 * Rule for every task that touches a Float32 stock (plants, carcass, soil,
 * organism energy): account the realised change (`after - before`), never
 * the intended amount. Any gap between an intended change and its realised
 * Float32 counterpart goes to `dissipated`.
 */

export class Ledger {
  constructor() {
    this.genesis = 0;
    this.sunlight = 0;
    this.hand = 0;
    this.dissipated = 0;
    /** Itemized per-mechanism totals, for the trophic-flow chart (P4-07). */
    this.flows = {
      photosynthesis: 0,
      uptake: 0,
      decay: 0,
      grazing: 0,
      scavenging: 0,
      predation: 0,
      metabolism: 0,
      births: 0,
      deaths: 0,
    };
  }
}

/**
 * Sum of every energy stock in the world, in double precision, summed in
 * row-major (tiles) / slot order (organisms) — SPEC §3.1.
 * @param {import('./world.js').World} world
 * @returns {{ plants: number, organisms: number, carcass: number, soil: number, total: number }}
 */
export function stocks(world) {
  const total = world.width * world.height;
  let plants = 0;
  let carcass = 0;
  let soil = 0;
  for (let i = 0; i < total; i++) {
    plants += world.plants[i];
    carcass += world.carcass[i];
    soil += world.soil[i];
  }

  let organisms = 0;
  const store = world.store;
  for (let i = 0; i < store.highWater; i++) {
    if (!store.alive[i]) continue;
    organisms += store.energy[i] + store.body[i];
  }

  return { plants, organisms, carcass, soil, total: plants + organisms + carcass + soil };
}

/**
 * The relative error of the SPEC §4.4 conservation identity:
 * `|stocks.total + dissipated - (genesis + sunlight + hand)| / max(1, genesis + sunlight + hand)`.
 * @param {import('./world.js').World} world
 * @returns {number}
 */
export function relativeError(world) {
  const s = stocks(world);
  const ledger = world.ledger;
  const input = ledger.genesis + ledger.sunlight + ledger.hand;
  const denom = Math.max(1, input);
  return Math.abs(s.total + ledger.dissipated - input) / denom;
}

/**
 * Set `world.ledger.genesis` to the total of every stock currently in the
 * world (plants, organisms, carcass, soil). Call this once, after the
 * world's terrain/plants and its starting population are both in place
 * (whether from `runGenesis` or hand-built test organisms), to establish
 * the conservation identity's baseline.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function initGenesisLedger(world) {
  world.ledger.genesis = stocks(world).total;
}
