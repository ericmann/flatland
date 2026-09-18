/**
 * Organism rendering (SPEC §6.5): a `fillRect` square per living organism,
 * read from a decoded snapshot's compact SoA. Testable in node with a
 * plain recording fake 2D context — no real canvas needed.
 *
 * `colorMode` only supports `'self'` (hue-based) in this task; richer
 * modes (energy/age/species-highlight) arrive in P2-07/P2-09 and will
 * extend this function's `switch`, not replace it.
 */

/** World pixels per tile (matches `Renderer`'s default `px`, SPEC §6.5). */
const PX = 4;

/**
 * Draw every living organism in `snap` as a centred square.
 * @param {CanvasRenderingContext2D | *} ctx
 * @param {*} snap a decoded snapshot (`decodeSnapshot()`'s return value)
 * @param {'self'} colorMode
 * @returns {void}
 */
export function drawOrganisms(ctx, snap, colorMode) {
  void colorMode; // only 'self' exists until P2-07.
  const { orgs } = snap;
  for (let i = 0; i < orgs.n; i++) {
    const side = Math.round(orgs.size[i] * 2);
    const cx = orgs.x[i] * PX;
    const cy = orgs.y[i] * PX;
    const x = Math.round(cx - side / 2);
    const y = Math.round(cy - side / 2);
    ctx.fillStyle = `hsl(${orgs.hue[i]} 55% 62%)`;
    ctx.fillRect(x, y, side, side);
  }
}
