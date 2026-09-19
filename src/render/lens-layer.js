/**
 * Lens overlay passes (SPEC §5.2, §6.5): Night (a tinted fill scaled by
 * `(1 - L)`, plus a dawn/dusk warm band), Energy density (a heat map of
 * organism energy, P2-09 — SPEC §5.2 names the lens but doesn't define
 * it; PLAN.md's spec-issues resolution picks this reading), and the 4
 * Scent lenses (P3-02: each pheromone channel as heat, strongest-channel-
 * wins per tile). All three are testable in node: `drawNight` against a
 * recording fake 2D context, `paintEnergy`/`paintScent` against a plain
 * `{ width, height, data }` ImageData-alike.
 */

/** Sun accent colour (SPEC §5.5 palette) used to paint the energy heat map. */
const SUN_R = 227;
const SUN_G = 168;
const SUN_B = 58;
/** Per-organism alpha contribution at full energy (PLAN.md P2-09). */
const STAMP_ALPHA_AT_FULL_ENERGY = 0.6;

/** Scent channel swatches (PLAN.md P3-02), RGB. */
const SCENT_COLORS = Object.freeze([
  [0x48, 0xc2, 0xd8],
  [0xd8, 0x5c, 0xb5],
  [0xe3, 0xd2, 0x4a],
  [0x7f, 0xbb, 0x6a],
]);
/** Alpha-per-unit-concentration scale (PLAN.md P3-02: `v × 420`, capped at 255). */
const SCENT_ALPHA_SCALE = 420;

/**
 * Darken (and, near dawn/dusk, warm) the `w x h` rect at `(0, 0)`.
 * @param {CanvasRenderingContext2D | *} ctx
 * @param {number} L current light, in [0, 1]
 * @param {number} w
 * @param {number} h
 * @returns {void}
 */
export function drawNight(ctx, L, w, h) {
  const nightAlpha = (1 - L) * 0.72;
  ctx.fillStyle = `rgba(8,14,34,${nightAlpha})`;
  ctx.fillRect(0, 0, w, h);

  const warm = Math.max(0, 1 - Math.abs(L - 0.18) / 0.18) * 0.18;
  if (warm > 0) {
    ctx.fillStyle = `rgba(227,140,58,${warm})`;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Paint the energy-density heat map into a 1-px-per-tile ImageData: for
 * each living organism, add `energyFrac/255 * 0.6` alpha to the 3×3-tile
 * stamp centred on its (rounded) tile, clamped to 1 and combined additively
 * where stamps overlap. Every painted pixel is the sun colour; unpainted
 * pixels stay fully transparent. The caller composites the result at
 * `globalAlpha 0.7` (SPEC §6.5).
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @param {{ orgs: { n: number, x: Float32Array, y: Float32Array, energyFrac: Uint8Array } }} snap
 * @returns {void}
 */
export function paintEnergy(imageData, snap) {
  const { width, height, data } = imageData;
  const alpha = new Float32Array(width * height);
  const { n, x, y, energyFrac } = snap.orgs;

  for (let i = 0; i < n; i++) {
    const cx = Math.round(x[i]);
    const cy = Math.round(y[i]);
    const add = (energyFrac[i] / 255) * STAMP_ALPHA_AT_FULL_ENERGY;
    for (let dy = -1; dy <= 1; dy++) {
      const ty = cy + dy;
      if (ty < 0 || ty >= height) continue;
      const row = ty * width;
      for (let dx = -1; dx <= 1; dx++) {
        const tx = cx + dx;
        if (tx < 0 || tx >= width) continue;
        const idx = row + tx;
        alpha[idx] = Math.min(1, alpha[idx] + add);
      }
    }
  }

  for (let idx = 0; idx < alpha.length; idx++) {
    const o = idx * 4;
    data[o] = SUN_R;
    data[o + 1] = SUN_G;
    data[o + 2] = SUN_B;
    data[o + 3] = Math.round(alpha[idx] * 255);
  }
}

/**
 * Paint the scent heat map into a 1-px-per-tile ImageData (PLAN.md
 * P3-02): per tile, take the strongest of the *enabled* channels; its
 * colour is that channel's swatch, alpha `min(255, v × 420)`. A tile
 * with no enabled channel active (or value 0) stays fully transparent.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} imageData
 * @param {{ pher?: Float32Array[] }} snap a decoded snapshot; `pher` is present only with FLAG_PHEROMONE
 * @param {{ scent?: boolean[] }} lensState which of the 4 channels are enabled
 * @returns {void}
 */
export function paintScent(imageData, snap, lensState) {
  const { width, height, data } = imageData;
  const scent = lensState.scent ?? [false, false, false, false];
  const pher = snap.pher;
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    let bestC = -1;
    let bestV = 0;
    if (pher) {
      for (let c = 0; c < 4; c++) {
        if (!scent[c]) continue;
        const v = pher[c][i];
        if (v > bestV) {
          bestV = v;
          bestC = c;
        }
      }
    }
    if (bestC === -1) {
      data[o + 3] = 0;
      continue;
    }
    const [r, g, b] = SCENT_COLORS[bestC];
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = Math.min(255, Math.round(bestV * SCENT_ALPHA_SCALE));
  }
}
