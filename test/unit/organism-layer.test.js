import { describe, it, expect } from 'vitest';
import { drawOrganisms } from '../../src/render/organism-layer.js';

/** A recording fake 2D context: only the calls organism-layer.js needs. */
function fakeCtx() {
  return {
    fillStyle: null,
    calls: /** @type {{ fillStyle: string, x: number, y: number, w: number, h: number }[]} */ ([]),
    fillRect(x, y, w, h) {
      this.calls.push({ fillStyle: this.fillStyle, x, y, w, h });
    },
  };
}

function fakeSnapshot(orgs) {
  return {
    orgs: {
      n: orgs.length,
      x: Float32Array.from(orgs.map((o) => o.x)),
      y: Float32Array.from(orgs.map((o) => o.y)),
      size: Float32Array.from(orgs.map((o) => o.size)),
      hue: Float32Array.from(orgs.map((o) => o.hue)),
    },
  };
}

describe('organism-layer', () => {
  it('one fillRect per living organism at x·4, y·4 with side round(size·2)', () => {
    const ctx = fakeCtx();
    const snap = fakeSnapshot([
      { x: 10, y: 5, size: 1.3, hue: 90 },
      { x: 2, y: 8, size: 0.7, hue: 200 },
    ]);
    drawOrganisms(ctx, snap, 'self');

    expect(ctx.calls).toHaveLength(2);
    const side0 = Math.round(1.3 * 2);
    expect(ctx.calls[0]).toMatchObject({
      w: side0,
      h: side0,
      x: Math.round(10 * 4 - side0 / 2),
      y: Math.round(5 * 4 - side0 / 2),
    });
    const side1 = Math.round(0.7 * 2);
    expect(ctx.calls[1]).toMatchObject({
      w: side1,
      h: side1,
      x: Math.round(2 * 4 - side1 / 2),
      y: Math.round(8 * 4 - side1 / 2),
    });
  });

  it('colour is derived from hue', () => {
    const ctx = fakeCtx();
    const snap = fakeSnapshot([{ x: 0, y: 0, size: 1, hue: 137 }]);
    drawOrganisms(ctx, snap, 'self');
    expect(ctx.calls[0].fillStyle).toBe('hsl(137 55% 62%)');
  });
});
