// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { attachInput } from '../../src/ui/input.js';

// jsdom (as of the version pinned here) already defines PointerEvent, but
// guard anyway per the design constraint, since a future jsdom bump could
// drop it and this file should keep working.
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends Event {
    constructor(type, opts = {}) {
      super(type, opts);
      this.pointerId = opts.pointerId ?? 0;
      this.clientX = opts.clientX ?? 0;
      this.clientY = opts.clientY ?? 0;
    }
  };
}

/** A 100x100 (1:1 DPR) canvas with a real-looking bounding rect. */
function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  document.body.appendChild(canvas);
  return canvas;
}

function pointer(type, id, x, y) {
  return new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true });
}

describe('attachInput', () => {
  /** @type {HTMLCanvasElement} */
  let canvas;
  beforeEach(() => {
    canvas = makeCanvas();
  });

  it('a drag of > 4 px pans and is not a tap', () => {
    const pans = [];
    const taps = [];
    attachInput(canvas, {
      getCamera: () => ({ x: 50, y: 50, z: 1 }),
      onPan: (dx, dy) => pans.push([dx, dy]),
      onTap: (x, y) => taps.push([x, y]),
      onZoom: () => {},
    });

    canvas.dispatchEvent(pointer('pointerdown', 1, 10, 10));
    canvas.dispatchEvent(pointer('pointermove', 1, 20, 10)); // 10px move > 4px threshold
    canvas.dispatchEvent(pointer('pointerup', 1, 20, 10));

    expect(pans.length).toBeGreaterThan(0);
    expect(taps).toHaveLength(0);
  });

  it('a tap fires onTap with world coordinates', () => {
    const taps = [];
    // camera centred at world (50, 50), zoom 1, view 100x100: screen (50,50) -> world (50,50).
    attachInput(canvas, {
      getCamera: () => ({ x: 50, y: 50, z: 1 }),
      onPan: () => {},
      onTap: (x, y) => taps.push([x, y]),
      onZoom: () => {},
    });

    canvas.dispatchEvent(pointer('pointerdown', 1, 50, 50));
    canvas.dispatchEvent(pointer('pointerup', 1, 51, 51)); // 2px total move, under the 4px tap threshold

    expect(taps).toHaveLength(1);
    expect(taps[0][0]).toBeCloseTo(51, 5);
    expect(taps[0][1]).toBeCloseTo(51, 5);
  });

  it('two pointers pinch and change the zoom', () => {
    const zooms = [];
    attachInput(canvas, {
      getCamera: () => ({ x: 50, y: 50, z: 2 }),
      onPan: () => {},
      onTap: () => {},
      onZoom: (factor, ax, ay) => zooms.push([factor, ax, ay]),
    });

    canvas.dispatchEvent(pointer('pointerdown', 1, 40, 50));
    canvas.dispatchEvent(pointer('pointerdown', 2, 60, 50)); // dist = 20
    canvas.dispatchEvent(pointer('pointermove', 2, 70, 50)); // dist = 30, dist ratio 1.5

    expect(zooms.length).toBeGreaterThan(0);
    expect(zooms[0][0]).toBeCloseTo(1.5, 5);
  });

  it('wheel zooms about the cursor', () => {
    const zooms = [];
    attachInput(canvas, {
      getCamera: () => ({ x: 50, y: 50, z: 1 }),
      onPan: () => {},
      onTap: () => {},
      onZoom: (factor, ax, ay) => zooms.push([factor, ax, ay]),
    });

    const e = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(e, { deltaY: 100, clientX: 60, clientY: 40 });
    canvas.dispatchEvent(e);

    expect(zooms).toHaveLength(1);
    expect(zooms[0][0]).toBeCloseTo(Math.exp(-100 * 0.0015), 6);
    expect(e.defaultPrevented).toBe(true);
  });
});
