/**
 * Terrain rendering: paint a terrain grid into an ImageData at 1 px/tile,
 * tinted by plants (grass/scrub/mud) and whitened by a carcass, exactly as
 * `docs/mockup.html`'s `renderTerrain` (SPEC §6.5). Water gets no
 * animation, unlike the mockup — the renderer must produce identical
 * pixels for identical snapshot data (SPEC §3.1: deterministic frames).
 * Only touches `imageData.data`, so it is testable in node with a plain
 * `{ data: Uint8ClampedArray }` — no real canvas needed.
 */
import { TERRAIN } from '../core/terrain.js';

/** Palette colour per TERRAIN type, from the reference mockup. */
export const TCOL = Object.freeze([
  Object.freeze([34, 64, 90]), // water
  Object.freeze([183, 167, 120]), // sand
  Object.freeze([74, 61, 44]), // mud
  Object.freeze([58, 72, 40]), // grass
  Object.freeze([88, 92, 52]), // scrub
  Object.freeze([106, 106, 102]), // rock
]);

/**
 * Paint each tile of `snapshot` into `imageData`, full opacity.
 * @param {{ data: Uint8ClampedArray }} imageData
 * @param {{ terrain: Uint8Array, plants: Float32Array, carcass: Float32Array, width: number, height: number, plantCap?: number[] }} snapshot
 *   `plantCap` (P6-02) is the per-TERRAIN-type cap (SPEC §4.4's `cap(terrain)`) that `plants[i]` is a
 *   raw energy-unit stock against; tinting is by `plants[i] / plantCap[terrain[i]]` (a 0..1 fraction),
 *   not by the raw value, since a full tile is no longer assumed to hold exactly `1`. Defaults to
 *   all-1s (a no-op division) so a caller that already hands in a 0..1 fraction is unaffected.
 * @returns {void}
 */
export function paintTerrain(imageData, snapshot) {
  const { terrain, plants, carcass, width, height, plantCap = [1, 1, 1, 1, 1, 1] } = snapshot;
  const data = imageData.data;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const t = terrain[i];
    let [r, g, b] = TCOL[t];
    const cap = plantCap[t];
    const p = cap > 0 ? plants[i] / cap : 0;
    if (t === TERRAIN.GRASS) {
      r = 62 + (92 - 62) * p;
      g = 78 + (150 - 78) * p;
      b = 42 + (62 - 42) * p;
    } else if (t === TERRAIN.SCRUB) {
      r = 88 + (107 - 88) * p;
      g = 92 + (122 - 92) * p;
      b = 52 + (58 - 52) * p;
    } else if (t === TERRAIN.MUD) {
      g = 61 + 30 * p;
    }
    const cc = carcass[i];
    if (cc > 0) {
      r = r + (232 - r) * cc;
      g = g + (226 - g) * cc;
      b = b + (204 - b) * cc;
    }
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
}

// Re-exported so callers don't also need to import terrain.js just for the
// enum this module's palette is indexed by.
export { TERRAIN };
