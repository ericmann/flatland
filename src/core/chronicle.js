/**
 * The append-only chronicle (SPEC §4.11): world events in plain language
 * with a place name. Determinism (SPEC §3.1): every entry's text is a
 * pure function of world state at the moment it is logged; nothing here
 * touches the wall clock.
 */

/** Chronicle entry kinds (SPEC §4.11). */
export const KIND = Object.freeze({
  GENESIS: 'genesis',
  SPLIT: 'split',
  EXTINCT: 'extinct',
  MIGRATION: 'migration',
  HUNT_SUMMARY: 'hunt-summary',
  FAMINE: 'famine',
  PLAGUE: 'plague',
  INTERVENTION: 'intervention',
  NAMING: 'naming',
  FIRST: 'first',
  WEATHER: 'weather',
});

/**
 * @typedef {Object} ChronicleEntry
 * @property {number} tick
 * @property {string} kind
 * @property {string} text
 * @property {string} place
 * @property {number[]} subjects
 */

export class Chronicle {
  constructor() {
    /** @type {ChronicleEntry[]} */
    this.entries = [];
    /** Index of the first entry not yet returned by `flush()`. */
    this.pendingFrom = 0;
  }

  /**
   * Append one entry (SPEC §4.11).
   * @param {number} tick
   * @param {string} kind a KIND value
   * @param {string} text
   * @param {string} place
   * @param {number[]} [subjects]
   * @returns {void}
   */
  add(tick, kind, text, place, subjects = []) {
    this.entries.push({ tick, kind, text, place, subjects });
  }

  /**
   * Every entry added since the last `flush()`, or `null` if there are
   * none. This is the one place allowed to allocate — and only when
   * something actually happened.
   * @returns {ChronicleEntry[]|null}
   */
  flush() {
    if (this.pendingFrom >= this.entries.length) return null;
    const out = this.entries.slice(this.pendingFrom);
    this.pendingFrom = this.entries.length;
    return out;
  }
}
