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
  it('untinted types (water, sand, rock) keep their exact palette colour, alpha 255', () => {
    const w = 3;
    const h = 1;
    const terrain = new Uint8Array([TERRAIN.WATER, TERRAIN.SAND, TERRAIN.ROCK]);
    const img = makeImageData(w, h);
    paintTerrain(img, {
      terrain,
      plants: new Float32Array(w * h),
      carcass: new Float32Array(w * h),
      width: w,
      height: h,
    });
    for (let i = 0; i < terrain.length; i++) {
      const [r, g, b] = TCOL[terrain[i]];
      expect(img.data[i * 4]).toBe(r);
      expect(img.data[i * 4 + 1]).toBe(g);
      expect(img.data[i * 4 + 2]).toBe(b);
      expect(img.data[i * 4 + 3]).toBe(255);
    }
  });

  it('grass and scrub are tinted greener as plants rise', () => {
    const w = 2;
    const h = 1;
    const terrain = new Uint8Array([TERRAIN.GRASS, TERRAIN.GRASS]);
    const barren = makeImageData(w, h);
    paintTerrain(barren, {
      terrain,
      plants: new Float32Array([0, 0]),
      carcass: new Float32Array(w * h),
      width: w,
      height: h,
    });
    const lush = makeImageData(w, h);
    paintTerrain(lush, {
      terrain,
      plants: new Float32Array([1, 1]),
      carcass: new Float32Array(w * h),
      width: w,
      height: h,
    });
    // Formula from docs/mockup.html: r=62+(92-62)*p, g=78+(150-78)*p, b=42+(62-42)*p.
    expect(barren.data[0]).toBe(62);
    expect(barren.data[1]).toBe(78);
    expect(barren.data[2]).toBe(42);
    expect(lush.data[0]).toBe(92);
    expect(lush.data[1]).toBe(150);
    expect(lush.data[2]).toBe(62);
  });

  it('mud only shifts green with plants; a carcass whitens any tile', () => {
    const w = 1;
    const h = 1;
    const mud = makeImageData(w, h);
    paintTerrain(mud, {
      terrain: new Uint8Array([TERRAIN.MUD]),
      plants: new Float32Array([1]),
      carcass: new Float32Array([0]),
      width: w,
      height: h,
    });
    const [mr, , mb] = TCOL[TERRAIN.MUD];
    expect(mud.data[0]).toBe(mr); // red untouched by mud's formula
    expect(mud.data[1]).toBe(61 + 30 * 1);
    expect(mud.data[2]).toBe(mb); // blue untouched

    const carcassImg = makeImageData(w, h);
    paintTerrain(carcassImg, {
      terrain: new Uint8Array([TERRAIN.SAND]),
      plants: new Float32Array([0]),
      carcass: new Float32Array([1]),
      width: w,
      height: h,
    });
    // At carcass = 1, the tile is fully whitened toward (232, 226, 204).
    expect(carcassImg.data[0]).toBe(232);
    expect(carcassImg.data[1]).toBe(226);
    expect(carcassImg.data[2]).toBe(204);
  });

  it('TCOL has one colour per terrain type', () => {
    expect(TCOL.length).toBe(6);
    for (const c of TCOL) {
      expect(c.length).toBe(3);
    }
  });
});
