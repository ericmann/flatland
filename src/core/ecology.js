/**
 * Tile-scalar energy stocks: plants, carcasses, soil (SPEC §4.4). Row-major
 * tile loops, `fmath` only, no allocation (SPEC §3.1, §6.3).
 */
import { TERRAIN } from './terrain.js';

/**
 * Fill every tile's plant level to `plants.initialFill` of its cap
 * (SPEC §4.4 "initial plants at genesis"). Called once, from the `World`
 * constructor, before any organism exists.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function fillInitialPlants(world) {
  const caps = world.cfg.terrain.plantCap;
  const fillFrac = world.cfg.plants.initialFill;
  const plants = world.plants;
  const terrain = world.terrain;
  for (let i = 0; i < plants.length; i++) {
    plants[i] = Math.fround(fillFrac * caps[terrain[i]]);
  }
}

/**
 * Grow plants for one tick (SPEC §4.4): `base = growth * L * (1 - p/cap)`,
 * `fromSoil = min(soil*uptake, base*soilBoost*soil)`, `want = base +
 * fromSoil`, scaled down to fit under cap if needed. The realised growth
 * (`applied`) is attributed to `ledger.sunlight`/`flows.photosynthesis`
 * and `flows.uptake` in proportion to the (possibly scaled) base/fromSoil
 * split, so the two attributions always sum to exactly `applied`. The
 * mechanical soil depletion is accounted separately, with any Float32
 * rounding gap against the intended `fromSoil'` going to `dissipated`.
 * Tiles with cap = 0 are skipped; the whole call is a no-op at L = 0.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function growPlants(world) {
  if (!world.cfg.plants.enabled) return;
  const L = world.light;
  if (L <= 0) return;

  const cfg = world.cfg;
  const caps = cfg.terrain.plantCap;
  const growth = cfg.plants.growth;
  const soilBoost = cfg.plants.soilBoost;
  const uptakeRate = cfg.soil.uptake;
  const plants = world.plants;
  const soil = world.soil;
  const terrain = world.terrain;
  const ledger = world.ledger;

  for (let i = 0; i < plants.length; i++) {
    const cap = caps[terrain[i]];
    if (cap <= 0) continue;

    const p = plants[i];
    const s = soil[i];
    const base = growth * L * (1 - p / cap);
    const fromSoil = Math.min(s * uptakeRate, base * soilBoost * s);
    let baseAdj = base;
    let fromSoilAdj = fromSoil;
    let want = base + fromSoil;
    const room = cap - p;
    if (want > room && want > 0) {
      const scale = room / want;
      baseAdj = base * scale;
      fromSoilAdj = fromSoil * scale;
      want = room;
    }
    if (want <= 0) continue;

    const beforeP = p;
    plants[i] = Math.fround(beforeP + want);
    const applied = plants[i] - beforeP;
    if (applied > 0) {
      const sunFrac = baseAdj / want;
      ledger.sunlight += applied * sunFrac;
      ledger.flows.photosynthesis += applied * sunFrac;
      ledger.flows.uptake += applied * (1 - sunFrac);
    }

    if (fromSoilAdj > 0) {
      const beforeS = soil[i];
      soil[i] = Math.fround(beforeS - fromSoilAdj);
      const realisedS = beforeS - soil[i];
      ledger.dissipated += fromSoilAdj - realisedS;
    }
  }
}

/**
 * Decay carcasses into soil for one tick (SPEC §4.4), slower on mud. The
 * realised carcass removal (`Δ`) is credited to `flows.decay`; the gap
 * between `Δ` and soil's own realised addition goes to `dissipated`.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function decayCarcasses(world) {
  if (!world.cfg.carcass.enabled) return;

  const cfg = world.cfg;
  const carcass = world.carcass;
  const soil = world.soil;
  const terrain = world.terrain;
  const ledger = world.ledger;
  const decayRate = cfg.carcass.decay;
  const decayMudRate = cfg.carcass.decayMud;

  for (let i = 0; i < carcass.length; i++) {
    const c = carcass[i];
    if (c <= 0) continue;
    const rate = terrain[i] === TERRAIN.MUD ? decayMudRate : decayRate;
    const intended = c * rate;

    const beforeC = c;
    carcass[i] = Math.fround(beforeC - intended);
    const delta = beforeC - carcass[i]; // realised removal

    const beforeS = soil[i];
    soil[i] = Math.fround(beforeS + delta);
    const realisedS = soil[i] - beforeS;

    ledger.dissipated += delta - realisedS;
    ledger.flows.decay += delta;
  }
}
