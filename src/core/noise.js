/**
 * Seeded multi-octave value noise for terrain generation (SPEC §4.2).
 *
 * Determinism (SPEC §3.1): the lattice is filled entirely from the `Rng`
 * passed in by the caller; nothing here reaches for any other randomness
 * source.
 */

/**
 * Smoothstep: t²(3 − 2t).
 * @param {number} t
 * @returns {number}
 */
function smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Positive-safe modulo (JS `%` can return negative results for negative
 * operands, which would break lattice-index wrapping).
 * @param {number} n
 * @param {number} m
 * @returns {number}
 */
function wrapIndex(n, m) {
  return ((n % m) + m) % m;
}

/**
 * @typedef {Object} NoiseField
 * @property {(x: number, y: number) => number} at
 */

/**
 * Build a `size × size` seeded value-noise lattice with bilinear +
 * smoothstep interpolation and wrapping lattice indices, as the mockup
 * does. The lattice tiles seamlessly at every multiple of `size` in either
 * axis, so callers may sample at any real (x, y).
 * @param {import('./rng.js').Rng} rng
 * @param {number} size
 * @returns {NoiseField}
 */
export function makeNoise(rng, size) {
  const lattice = new Float32Array(size * size);
  for (let i = 0; i < lattice.length; i++) {
    lattice[i] = rng.float();
  }

  return {
    at(x, y) {
      const xi = wrapIndex(Math.floor(x), size);
      const yi = wrapIndex(Math.floor(y), size);
      const xi1 = wrapIndex(xi + 1, size);
      const yi1 = wrapIndex(yi + 1, size);
      const xf = smooth(x - Math.floor(x));
      const yf = smooth(y - Math.floor(y));

      const a = lattice[yi * size + xi];
      const b = lattice[yi * size + xi1];
      const c = lattice[yi1 * size + xi];
      const d = lattice[yi1 * size + xi1];

      const top = a + (b - a) * xf;
      const bottom = c + (d - c) * xf;
      return Math.fround(top + (bottom - top) * yf);
    },
  };
}

/**
 * @typedef {Object} NoiseLayer
 * @property {NoiseField} noise
 * @property {number} scale
 * @property {number} weight
 */

/**
 * Fractal Brownian motion: the weighted sum of several noise layers sampled
 * at different scales, `Σ weight · noise.at(x/scale, y/scale)`. When the
 * layer weights sum to 1 (as the default terrain config does), the result
 * stays in [0, 1].
 * @param {NoiseLayer[]} layers
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function fbm(layers, x, y) {
  let sum = 0;
  for (const layer of layers) {
    sum += layer.weight * layer.noise.at(x / layer.scale, y / layer.scale);
  }
  return Math.fround(sum);
}
