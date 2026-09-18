/**
 * Terrain rendering: paint a terrain grid into an ImageData at 1 px/tile
 * (SPEC §6.5). Only touches `imageData.data`, so it is testable in node
 * with a plain `{ data: Uint8ClampedArray }` — no real canvas needed.
 * Plant/carcass tinting arrives in P1-13; this is flat palette colour only.
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
 * Paint each tile of `terrain` into `imageData` at its palette colour with
 * full opacity.
 * @param {{ data: Uint8ClampedArray }} imageData
 * @param {Uint8Array} terrain flat w*h grid of TERRAIN values
 * @param {number} w
 * @param {number} h
 * @returns {void}
 */
export function paintTerrain(imageData, terrain, w, h) {
  const data = imageData.data;
  const total = w * h;
  for (let i = 0; i < total; i++) {
    const color = TCOL[terrain[i]];
    const o = i * 4;
    data[o] = color[0];
    data[o + 1] = color[1];
    data[o + 2] = color[2];
    data[o + 3] = 255;
  }
}

// Re-exported so callers don't also need to import terrain.js just for the
// enum this module's palette is indexed by.
export { TERRAIN };
