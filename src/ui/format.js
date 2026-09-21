/**
 * UI-only text formatting for the idle clock and ticker (SPEC §5.1). Pure
 * functions over `src/core/light.js`'s `clock`/`season` (both allowed
 * imports for UI code per CLAUDE.md's Sim/UI boundaries — pure helpers,
 * never a `World`).
 */
import { clock, season } from '../core/light.js';

/**
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * The ticker's compact time prefix: `Y<year> D<day> HH:MM`.
 * @param {number} tick
 * @param {typeof import('../core/config.js').DEFAULTS} cfg
 * @returns {string}
 */
export function tag(tick, cfg) {
  const c = clock(tick, cfg);
  return `Y${c.year} D${c.day} ${pad2(c.hour)}:${pad2(c.minute)}`;
}

/**
 * The idle clock block's parts: big `HH:MM` plus `Year · Day · Season`.
 * @param {number} tick
 * @param {typeof import('../core/config.js').DEFAULTS} cfg
 * @returns {{ year: number, day: number, time: string, season: string }}
 */
export function clockParts(tick, cfg) {
  const c = clock(tick, cfg);
  return {
    year: c.year,
    day: c.day,
    time: `${pad2(c.hour)}:${pad2(c.minute)}`,
    season: season(tick, cfg),
  };
}

/**
 * A tile's raw plant-stock value (SPEC §4.4: energy units, `p ∈ [0,
 * cap(terrain)]`) as a 0..1 fraction of its terrain type's cap, for the
 * tile tooltip (P6-02: a full tile is no longer assumed to hold exactly
 * `1`). A cap-0 terrain (water, sand, rock) never holds plants, so it is
 * always 0 rather than a division by zero.
 * @param {number} raw the tile's raw plant value
 * @param {number} terrainType a `TERRAIN` enum value, indexing `plantCap`
 * @param {number[]} plantCap per-TERRAIN-type cap, e.g. from the `loaded`
 *   event's `world.cfg.terrain.plantCap`
 * @returns {number}
 */
export function plantsFractionOfCap(raw, terrainType, plantCap) {
  const cap = plantCap[terrainType];
  return cap > 0 ? raw / cap : 0;
}
