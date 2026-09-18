/**
 * The only source of randomness in the simulation core (SPEC §3.1, §6.2).
 * Algorithm: mulberry32, a 32-bit state PRNG. State is a single readable and
 * writable uint32 so it can be saved and restored in snapshots (SPEC §3.4)
 * and included byte-for-byte in `World.hash()`.
 */
export class Rng {
  /** @param {number} seed */
  constructor(seed) {
    /** @type {number} */
    this._state = seed >>> 0;
  }

  /** Current 32-bit state. Readable and writable for save/restore. */
  get state() {
    return this._state;
  }

  set state(value) {
    this._state = value >>> 0;
  }

  /**
   * Advance the generator and return the next raw uint32.
   * @returns {number}
   */
  next() {
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /**
   * A float in [0, 1).
   * @returns {number}
   */
  float() {
    return this.next() / 4294967296;
  }

  /**
   * An integer in [0, n).
   * @param {number} n
   * @returns {number}
   */
  int(n) {
    return Math.floor(this.float() * n);
  }

  /**
   * A float in [lo, hi).
   * @param {number} lo
   * @param {number} hi
   * @returns {number}
   */
  range(lo, hi) {
    return lo + this.float() * (hi - lo);
  }

  /**
   * A standard-normal sample via the Irwin–Hall approximation: the sum of 12
   * independent uniforms in [0,1) has mean 6 and variance 1, so subtracting 6
   * gives a distribution close to N(0,1) with no rejection, no cached second
   * value, and no state beyond the 32-bit generator.
   * @returns {number}
   */
  gaussian() {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += this.float();
    }
    return sum - 6;
  }

  /**
   * True with probability p, false otherwise. p <= 0 is always false, p >= 1
   * is always true (and consumes no randomness in either case, but for
   * determinism-testing simplicity we still draw — callers should not rely
   * on chance(0)/chance(1) skipping a draw).
   * @param {number} p
   * @returns {boolean}
   */
  chance(p) {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.float() < p;
  }

  /**
   * A new, independent-looking Rng derived from this one and a salt, for
   * subsystems that need their own deterministic stream (e.g. terrain
   * generation) without disturbing the caller's sequence. Deterministic:
   * the same (seed, salt) pair always produces the same child stream.
   * @param {string|number} salt
   * @returns {Rng}
   */
  fork(salt) {
    const saltStr = String(salt);
    let h = this._state ^ 0x9e3779b9;
    for (let i = 0; i < saltStr.length; i++) {
      h = Math.imul(h ^ saltStr.charCodeAt(i), 0x85ebca6b);
      h ^= h >>> 13;
    }
    return new Rng(h >>> 0);
  }
}
