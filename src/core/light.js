/**
 * Tick → global light, season, clock (SPEC §4.3). Time advances in integer
 * ticks; light is one global scalar L computed from the tick — nothing else
 * about the sky is modeled here (temperature and weather are Phase 5).
 *
 * Determinism (SPEC §3.1): every export here is a pure function of
 * (tick, cfg), using only `fmath.sin/cos` (never `Math.sin/cos`) and
 * `Math.floor` for integer day/year indices.
 */
import { sin, cos, TAU } from './fmath.js';

/**
 * The fraction of the day already elapsed, 0 at dawn (06:00), wrapping at
 * DAY ticks.
 * @param {number} tick
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {number}
 */
function u(tick, cfg) {
  const DAY = cfg.time.ticksPerDay;
  const modTick = ((tick % DAY) + DAY) % DAY;
  return modTick / DAY;
}

/**
 * The fraction of the year already elapsed (0 = start of Spring).
 * @param {number} tick
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {number}
 */
function yearFracOf(tick, cfg) {
  const DAY = cfg.time.ticksPerDay;
  const YEAR = cfg.time.daysPerYear;
  const dayIndex = Math.floor(tick / DAY);
  const modDay = ((dayIndex % YEAR) + YEAR) % YEAR;
  return modDay / YEAR;
}

/**
 * The seasonal phase shared by `dayFraction` (light) and `ambient`
 * (temperature, SPEC §4.3, Phase 5): `sin(2π·(yearFrac − 0.125))`, in
 * [-1, 1], peaking at mid-summer (yearFrac = 0.375) and bottoming at
 * mid-winter (yearFrac = 0.875) — pulled out so temperature's seasonal
 * swing stays exactly in phase with day length rather than a
 * re-derivation that could drift out of sync.
 * @param {number} tick
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {number}
 */
export function seasonOffset(tick, cfg) {
  const yf = yearFracOf(tick, cfg);
  return sin(TAU * (yf - 0.125));
}

/**
 * The lit fraction of the day (SPEC §4.3: `f`), peaking at 0.72 at
 * mid-summer (yearFrac = 0.375) and bottoming at 0.28 at mid-winter
 * (yearFrac = 0.875).
 * @param {number} tick
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {number}
 */
export function dayFraction(tick, cfg) {
  return 0.5 + 0.22 * seasonOffset(tick, cfg);
}

/**
 * The global light scalar L in [0, 1] for this tick (SPEC §4.3).
 * @param {number} tick
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {number}
 */
export function lightAt(tick, cfg) {
  const uu = u(tick, cfg);
  const f = dayFraction(tick, cfg);
  if (uu >= f) return 0;
  return 0.5 * (1 - cos((TAU * uu) / f));
}

/**
 * The season name for this tick: a named quarter of the year (SPEC §4.3),
 * with the longest day at mid-summer and the shortest at mid-winter.
 * @param {number} tick
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {'Spring'|'Summer'|'Autumn'|'Winter'}
 */
export function season(tick, cfg) {
  const yf = yearFracOf(tick, cfg);
  if (yf < 0.25) return 'Spring';
  if (yf < 0.5) return 'Summer';
  if (yf < 0.75) return 'Autumn';
  return 'Winter';
}

/**
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * The world's own clock (SPEC §4.3, §5.2): `Year Y · Day D · HH:MM`, where
 * 06:00 is dawn. A day is always 24 world-hours regardless of `f`; only the
 * lit fraction changes.
 * @param {number} tick
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {{ year: number, day: number, hour: number, minute: number, text: string }}
 */
export function clock(tick, cfg) {
  const DAY = cfg.time.ticksPerDay;
  const YEAR = cfg.time.daysPerYear;
  const dayIndex = Math.floor(tick / DAY);
  const year = Math.floor(dayIndex / YEAR) + 1;
  const day = (((dayIndex % YEAR) + YEAR) % YEAR) + 1;
  const uu = u(tick, cfg);
  const hourFloat = (6 + 24 * uu) % 24;
  const hour = Math.floor(hourFloat);
  const minute = Math.floor((hourFloat - hour) * 60);
  const text = `Year ${year} · Day ${day} · ${pad2(hour)}:${pad2(minute)}`;
  return { year, day, hour, minute, text };
}

/**
 * The sun-arc glyph state for the top bar (SPEC §5.2): `angle` is π at
 * dawn (u = 0) and falls to 0 at dusk (u -> f), matching an arc glyph that
 * sweeps left (dawn) to right (dusk); it holds at π through the night.
 * `up` is whether the sun is currently above the horizon (u < f).
 * @param {number} tick
 * @param {typeof import('./config.js').DEFAULTS} cfg
 * @returns {{ angle: number, up: boolean }}
 */
export function sunArc(tick, cfg) {
  const uu = u(tick, cfg);
  const f = dayFraction(tick, cfg);
  if (uu < f) {
    return { angle: Math.PI * (1 - uu / f), up: true };
  }
  return { angle: Math.PI, up: false };
}
