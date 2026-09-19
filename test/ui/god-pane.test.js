// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createGodPane } from '../../src/ui/station/god-pane.js';
import { createApp } from '../../src/ui/app.js';

// jsdom (as of the version pinned here) already defines PointerEvent, but
// guard anyway (same reason as input.test.js): a future jsdom bump could
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

/** A fake SimClient recording every send() call (matches app.test.js's). */
function fakeSim() {
  return {
    sent: [],
    send(type, payload = {}) {
      this.sent.push({ type, payload });
    },
  };
}

/** A stub renderer: a real jsdom canvas for input.js to attach to (matches app.test.js's). */
function fakeRenderer() {
  const view = document.createElement('canvas');
  view.width = 200;
  view.height = 200;
  document.body.appendChild(view);
  return { view, width: 64, height: 40, px: 4, dpr: 1 };
}

function tap(canvas, x, y) {
  canvas.dispatchEvent(
    new PointerEvent('pointerdown', { pointerId: 1, clientX: x, clientY: y, bubbles: true }),
  );
  canvas.dispatchEvent(
    new PointerEvent('pointerup', { pointerId: 1, clientX: x, clientY: y, bubbles: true }),
  );
}

/** A fake `app` recording arm/fire calls, matching app.js's god-tool API surface. */
function fakeApp() {
  let tool = null;
  const listeners = new Set();
  return {
    fired: [],
    getGodTool: () => tool,
    setGodTool(t) {
      tool = t;
      for (const cb of listeners) cb(tool);
    },
    fireGodTool(kind) {
      this.fired.push(kind);
    },
    onGodToolChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

describe('createGodPane', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('selecting a tool arms it and a tap sends intervene with tile coordinates', () => {
    const root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);
    const sim = fakeSim();
    const renderer = fakeRenderer();
    const app = createApp({
      root,
      sim,
      renderer,
      camera: { x: 0, y: 0, z: 1 },
      doc: document,
      win: window,
    });

    const el = document.createElement('div');
    document.body.appendChild(el);
    createGodPane({ el, app });

    const fireBtn = /** @type {HTMLButtonElement} */ (el.querySelector('[data-tool="fire"]'));
    fireBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(app.getGodTool()).toBe('fire');
    expect(fireBtn.classList.contains('on')).toBe(true);
    expect(renderer.view.classList.contains('god')).toBe(true);

    // view is 200x200 (centre at 100,100); tap at (140,100) -> world (40,0)
    // -> tile (10,0) at renderer.px=4.
    tap(renderer.view, 140, 100);

    expect(sim.sent.at(-1)).toEqual({
      type: 'intervene',
      payload: { event: { kind: 'fire', x: 10, y: 0 } },
    });
    expect(app.getGodTool()).toBe('fire'); // stays armed after a tap.

    // Clicking the same tool again toggles it off.
    fireBtn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(app.getGodTool()).toBe(null);
    expect(fireBtn.classList.contains('on')).toBe(false);
    expect(renderer.view.classList.contains('god')).toBe(false);
  });

  it('rain sends immediately without a tap', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = fakeApp();
    createGodPane({ el, app });

    el.querySelector('[data-tool="rain"]').dispatchEvent(new Event('click', { bubbles: true }));

    expect(app.fired).toEqual(['rain']);
    expect(app.getGodTool()).toBe(null); // rain never arms the map.
  });

  it('switching tabs disarms the tool', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = fakeApp();
    const pane = createGodPane({ el, app });

    el.querySelector('[data-tool="meteor"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(app.getGodTool()).toBe('meteor');

    pane.setVisible(false); // dock.onPaneChange calls this when another tab is selected.
    expect(app.getGodTool()).toBe(null);
  });
});
