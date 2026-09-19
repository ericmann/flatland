import { describe, it, expect } from 'vitest';
import { drawNight, paintEnergy } from '../../src/render/lens-layer.js';

function fakeCtx() {
  return {
    fillStyle: null,
    calls: /** @type {{ fillStyle: string }[]} */ ([]),
    fillRect() {
      this.calls.push({ fillStyle: this.fillStyle });
    },
  };
}

/** Parse the alpha out of an `rgba(r,g,b,a)` string. */
function alphaOf(rgba) {
  return Number(rgba.slice(rgba.lastIndexOf(',') + 1, -1));
}

describe('lens-layer: drawNight', () => {
  it('night alpha is 0 at L = 1 and 0.72 at L = 0', () => {
    const ctxFull = fakeCtx();
    drawNight(ctxFull, 1, 10, 10);
    expect(alphaOf(ctxFull.calls[0].fillStyle)).toBeCloseTo(0, 6);

    const ctxDark = fakeCtx();
    drawNight(ctxDark, 0, 10, 10);
    expect(alphaOf(ctxDark.calls[0].fillStyle)).toBeCloseTo(0.72, 6);
  });

  it('the warm band peaks at L = 0.18 and is 0 at L >= 0.36', () => {
    const ctxPeak = fakeCtx();
    drawNight(ctxPeak, 0.18, 10, 10);
    expect(ctxPeak.calls).toHaveLength(2); // night fill + warm band
    expect(alphaOf(ctxPeak.calls[1].fillStyle)).toBeCloseTo(0.18, 6);

    const ctxNoWarm = fakeCtx();
    drawNight(ctxNoWarm, 0.36, 10, 10);
    expect(ctxNoWarm.calls).toHaveLength(1); // night fill only, warm band is 0 so skipped
  });
});

/** A plain `{ width, height, data }` ImageData-alike, node-testable. */
function fakeImageData(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function pixel(imageData, x, y) {
  const o = (y * imageData.width + x) * 4;
  return Array.from(imageData.data.subarray(o, o + 4));
}

describe('lens-layer: paintEnergy', () => {
  it('paintEnergy stamps 3×3 around each organism scaled by energyFrac and clamps alpha', () => {
    const img = fakeImageData(5, 5);
    const snap = {
      orgs: {
        n: 1,
        x: Float32Array.from([2]),
        y: Float32Array.from([2]),
        energyFrac: Uint8Array.from([255]),
      },
    };
    paintEnergy(img, snap);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const [r, g, b, a] = pixel(img, 2 + dx, 2 + dy);
        expect([r, g, b]).toEqual([227, 168, 58]);
        expect(a).toBe(Math.round(255 * 0.6));
      }
    }
    // Outside the 3x3 stamp, nothing is painted.
    expect(pixel(img, 0, 0)[3]).toBe(0);
  });

  it('overlapping stamps add alpha but clamp to full opacity', () => {
    const img = fakeImageData(5, 5);
    const snap = {
      orgs: {
        n: 2,
        x: Float32Array.from([2, 2]),
        y: Float32Array.from([2, 2]),
        energyFrac: Uint8Array.from([255, 255]),
      },
    };
    paintEnergy(img, snap);
    expect(pixel(img, 2, 2)[3]).toBe(255);
  });

  it('lower energyFrac produces proportionally lower alpha', () => {
    const img = fakeImageData(5, 5);
    const snap = {
      orgs: {
        n: 1,
        x: Float32Array.from([2]),
        y: Float32Array.from([2]),
        energyFrac: Uint8Array.from([128]),
      },
    };
    paintEnergy(img, snap);
    expect(pixel(img, 2, 2)[3]).toBe(Math.round((128 / 255) * 0.6 * 255));
  });
});
