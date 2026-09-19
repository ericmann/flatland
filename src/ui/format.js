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
