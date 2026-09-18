import { describe, it, expect } from 'vitest';
import { paintTerrain, TCOL } from '../../src/render/terrain-layer.js';
import { TERRAIN } from '../../src/core/terrain.js';

/**
 * A minimal ImageData stand-in that works in node (no real DOM needed),
 * per the design constraint that paintTerrain only touches `.data`.
 * @param {number} w
 * @param {number} h
 */
function makeImageData(w, h) {
  return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
}

describe('paintTerrain', () => {
  it('paints each tile with its palette colour and alpha 255', () => {
    const w = 3;
    const h = 2;
    const terrain = new Uint8Array([
      TERRAIN.WATER,
      TERRAIN.SAND,
      TERRAIN.MUD,
      TERRAIN.GRASS,
      TERRAIN.SCRUB,
      TERRAIN.ROCK,
    ]);
    const img = makeImageData(w, h);
    paintTerrain(img, terrain, w, h);
    for (let i = 0; i < terrain.length; i++) {
      const [r, g, b] = TCOL[terrain[i]];
      expect(img.data[i * 4]).toBe(r);
      expect(img.data[i * 4 + 1]).toBe(g);
      expect(img.data[i * 4 + 2]).toBe(b);
      expect(img.data[i * 4 + 3]).toBe(255);
    }
  });

  it('TCOL has one colour per terrain type', () => {
    expect(TCOL.length).toBe(6);
    for (const c of TCOL) {
      expect(c.length).toBe(3);
    }
  });
});
