import { describe, it, expect } from 'vitest';
import { drawNight } from '../../src/render/lens-layer.js';

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
