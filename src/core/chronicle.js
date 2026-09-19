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

/**
 * Death-cause verb, indexed by `world.js`'s `DEATH` codes (duplicated
 * locally, 1-6, matching `null` at 0 — importing `DEATH` from `world.js`
 * would cycle back here, since `world.js` already imports `Chronicle`;
 * same reason `ecology.js` duplicates `OUTPUT.eat`, P1-07's log entry).
 */
const DEATH_VERB = Object.freeze([
  null,
  'starved',
  'died of old age',
  'was taken',
  'burned',
  'was crushed by the meteor',
  'died of the plague',
]);

/**
 * The death-cause verb phrase for an `extinct` sentence's "The last one
 * ${verb} in ${place}." (SPEC §4.10-11).
 * @param {number} cause a `world.js` `DEATH` code
 * @returns {string}
 */
export function deathVerb(cause) {
  return DEATH_VERB[cause] ?? 'died';
}

/**
 * Render a chronicle sentence for a `kind` from its context (SPEC §4.11).
 * Pure: the same `(kind, ctx)` always produces the same text.
 * @param {string} kind a KIND value
 * @param {*} ctx kind-dependent fields (see each case)
 * @returns {string}
 */
export function sentence(kind, ctx) {
  switch (kind) {
    case KIND.SPLIT:
      return `A new lineage, ${ctx.name}, splits from ${ctx.parent} in ${ctx.place}.`;
    case KIND.EXTINCT:
      return `${ctx.name} are extinct. The last one ${ctx.verb} in ${ctx.place}.`;
    case KIND.PLAGUE:
      return `Plague among the ${ctx.name} in ${ctx.place}: ${ctx.n} sick.`;
    default:
      throw new Error(`sentence: unsupported kind "${kind}"`);
  }
}

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
