/**
 * Deterministic replacements for the transcendental Math.* functions (SPEC
 * §3.1, §6.2): `src/core` may not call `Math.sin/cos/exp/tanh/atan2/log`
 * directly, because engines are not required to agree on the last bit of
 * those results, which would make share links and replays diverge across
 * browsers. Everything here is built from `+ − × ÷`, `Math.sqrt`,
 * `Math.floor`, `Math.abs` and numeric literals, all of which are exact,
 * correctly-rounded IEEE-754 double operations mandated identically by
 * every conforming engine.
 *
 * PI and LN2 below are written out as the exact nearest-double literals
 * (the same bit patterns `Math.PI` / `Math.LN2` are defined to hold); they
 * are parsed once, deterministically, by the standard string-to-double
 * conversion, not computed by a transcendental call.
 */

const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const LN2 = 0.6931471805599453;

/**
 * 2^k for an integer k, computed by exponentiation by squaring using only
 * multiplication and division (no Math.pow).
 * @param {number} k
 * @returns {number}
 */
function pow2Int(k) {
  let n = k < 0 ? -k : k;
  let base = 2;
  let result = 1;
  while (n > 0) {
    if (n % 2 === 1) result *= base;
    base *= base;
    n = Math.floor(n / 2);
  }
  return k < 0 ? 1 / result : result;
}

/**
 * exp(r) for |r| <= LN2/2 via its Taylor series. Convergence is fast enough
 * at this range that 12 terms give far better than double-precision
 * relative accuracy.
 * @param {number} r
 * @returns {number}
 */
function expSmall(r) {
  let term = 1;
  let sum = 1;
  for (let i = 1; i <= 12; i++) {
    term *= r / i;
    sum += term;
  }
  return sum;
}

/**
 * Deterministic exp(x), accurate to within 1e-6 relative error on
 * [-20, 20] (tested well beyond that in practice). Range-reduces to
 * x = k*ln2 + r with |r| <= ln2/2, then exp(x) = exp(r) * 2^k.
 * @param {number} x
 * @returns {number}
 */
export function exp(x) {
  const k = Math.floor(x / LN2 + 0.5);
  const r = x - k * LN2;
  return expSmall(r) * pow2Int(k);
}

/**
 * Deterministic natural log, accurate to within 1e-6 relative error on
 * [1e-6, 1e6]. Uses frexp-style range reduction (x = m * 2^e, 1 <= m < 2)
 * via repeated halving/doubling, then ln(m) via the fast-converging series
 * ln(m) = 2*atanh((m-1)/(m+1)) = 2*(t + t^3/3 + t^5/5 + ...), and
 * ln(x) = ln(m) + e*ln2.
 * @param {number} x
 * @returns {number}
 */
export function log(x) {
  if (!(x > 0)) {
    return x === 0 ? -Infinity : NaN;
  }
  let m = x;
  let e = 0;
  while (m >= 2) {
    m /= 2;
    e += 1;
  }
  while (m < 1) {
    m *= 2;
    e -= 1;
  }
  const t = (m - 1) / (m + 1);
  const t2 = t * t;
  let term = t;
  let sum = t;
  for (let i = 1; i <= 20; i++) {
    term *= t2;
    sum += term / (2 * i + 1);
  }
  return 2 * sum + e * LN2;
}

/**
 * Deterministic tanh, accurate to within 1e-6 absolute error on [-10, 10],
 * built from `exp` above: tanh(x) = (exp(2x) - 1) / (exp(2x) + 1).
 * @param {number} x
 * @returns {number}
 */
export function tanh(x) {
  const e2x = exp(2 * x);
  return (e2x - 1) / (e2x + 1);
}

/**
 * sin(r) for r in [-π, π] via Taylor series. 12 terms comfortably clears
 * 1e-6 accuracy across the whole reduced range (the worst case, r = π,
 * converges to well under 1e-9).
 * @param {number} r
 * @returns {number}
 */
function sinReduced(r) {
  const r2 = r * r;
  let term = r;
  let sum = r;
  for (let i = 1; i <= 12; i++) {
    term *= -r2 / (2 * i * (2 * i + 1));
    sum += term;
  }
  return sum;
}

/**
 * cos(r) for r in [-π, π] via Taylor series, same margin as sinReduced.
 * @param {number} r
 * @returns {number}
 */
function cosReduced(r) {
  const r2 = r * r;
  let term = 1;
  let sum = 1;
  for (let i = 1; i <= 12; i++) {
    term *= -r2 / ((2 * i - 1) * (2 * i));
    sum += term;
  }
  return sum;
}

/**
 * Reduce any real x to r = x - k*TAU with r in [-π, π].
 * @param {number} x
 * @returns {number}
 */
function reduceToPi(x) {
  const k = Math.floor(x / TAU + 0.5);
  return x - k * TAU;
}

/**
 * Deterministic sin, accurate to within 1e-6 of Math.sin on [-8π, 8π] (and
 * well beyond, since range reduction handles any finite input).
 * @param {number} x
 * @returns {number}
 */
export function sin(x) {
  return sinReduced(reduceToPi(x));
}

/**
 * Deterministic cos, same accuracy and domain as `sin`.
 * @param {number} x
 * @returns {number}
 */
export function cos(x) {
  return cosReduced(reduceToPi(x));
}

/**
 * atan(t) for t in [0, 1], via four half-angle reductions
 * (tan(θ/2) = t / (1 + sqrt(1 + t²))) followed by a short Taylor series near
 * zero. Uses only `+ − × ÷` and `Math.sqrt`.
 * @param {number} t
 * @returns {number}
 */
function atanUnit(t) {
  let u = t;
  const REDUCTIONS = 4;
  for (let i = 0; i < REDUCTIONS; i++) {
    u = u / (1 + Math.sqrt(1 + u * u));
  }
  const u2 = u * u;
  const series = u * (1 - u2 / 3 + (u2 * u2) / 5 - (u2 * u2 * u2) / 7 + (u2 * u2 * u2 * u2) / 9);
  return series * pow2Int(REDUCTIONS);
}

/**
 * Deterministic atan2(y, x), accurate to within 1e-6 on the unit circle and
 * axes (and generally, since the reduction to atanUnit(t) with t in [0,1]
 * holds for every quadrant).
 * @param {number} y
 * @param {number} x
 * @returns {number}
 */
export function atan2(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let angle;
  if (ax >= ay) {
    angle = atanUnit(ay / ax);
  } else {
    angle = PI / 2 - atanUnit(ax / ay);
  }
  if (x < 0) angle = PI - angle;
  if (y < 0) angle = -angle;
  return angle;
}

/**
 * Clamp v to [lo, hi].
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Linear interpolation between a and b at t.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Wrap an angle (radians) into (-π, π]. Both +π and -π map to +π, so the
 * range is half-open on the negative side.
 * @param {number} a
 * @returns {number}
 */
export function wrapAngle(a) {
  const y = (a - PI) / TAU;
  const k = -Math.floor(-y);
  return a - k * TAU;
}
