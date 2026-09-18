/**
 * The night lens (SPEC §6.5): a tinted fill scaled by `(1 - L)`, plus a
 * dawn/dusk warm band, composited over the world canvas. Formulas match
 * `docs/mockup.html`'s `renderWorld` night block exactly. Testable in
 * node with a plain recording fake 2D context.
 */

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
