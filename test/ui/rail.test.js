// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createRail } from '../../src/ui/station/rail.js';
import { createApp } from '../../src/ui/app.js';

/** A fake app exposing just the lens-state contract rail.js needs. */
function fakeApp(initial = { night: true, energy: false, colorMode: 'self' }) {
  let state = { ...initial };
  const listeners = new Set();
  function notify() {
    for (const cb of listeners) cb(state);
  }
  return {
    getLensState: () => state,
    onLensChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    toggleLens(key) {
      state = { ...state, [key]: !state[key] };
      notify();
    },
    setColorMode(mode) {
      state = { ...state, colorMode: mode };
      notify();
    },
  };
}

describe('createRail', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('chips toggle lens state and reflect it with the on class', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    createRail({ el, app });

    const nightChip = el.querySelector('[data-lens="night"]');
    const energyChip = el.querySelector('[data-lens="energy"]');
    expect(nightChip.classList.contains('on')).toBe(true);
    expect(energyChip.classList.contains('on')).toBe(false);

    energyChip.dispatchEvent(new Event('click', { bubbles: true }));
    expect(energyChip.classList.contains('on')).toBe(true);

    nightChip.dispatchEvent(new Event('click', { bubbles: true }));
    expect(nightChip.classList.contains('on')).toBe(false);
  });

  it('colour-by is a radio: exactly one on', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    createRail({ el, app });

    const modeChips = Array.from(el.querySelectorAll('[data-mode]'));
    expect(modeChips.filter((c) => c.classList.contains('on'))).toHaveLength(1);

    const species = el.querySelector('[data-mode="species"]');
    species.dispatchEvent(new Event('click', { bubbles: true }));

    const onChips = modeChips.filter((c) => c.classList.contains('on'));
    expect(onChips).toHaveLength(1);
    expect(onChips[0]).toBe(species);
  });

  it('keys L and E toggle night and energy', () => {
    const root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);
    const view = document.createElement('canvas');
    view.width = 200;
    view.height = 200;
    document.body.appendChild(view);

    const app = createApp({
      root,
      sim: { send() {} },
      renderer: { view, width: 64, height: 40, px: 4 },
      camera: { x: 0, y: 0, z: 1 },
      doc: document,
      win: window,
    });

    const el = document.createElement('aside');
    createRail({ el, app });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    expect(el.querySelector('[data-lens="energy"]').classList.contains('on')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    expect(el.querySelector('[data-lens="night"]').classList.contains('on')).toBe(false);
  });
});
