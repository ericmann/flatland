// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../src/ui/app.js';

/** A fake SimClient recording every send() call. */
function fakeSim() {
  return {
    sent: /** @type {{ type: string, payload: * }[]} */ ([]),
    send(type, payload = {}) {
      this.sent.push({ type, payload });
    },
  };
}

/** A stub renderer: a real jsdom canvas for input.js to attach to, no 2D context. */
function fakeRenderer() {
  const view = document.createElement('canvas');
  view.width = 200;
  view.height = 200;
  document.body.appendChild(view);
  return { view, width: 64, height: 40, px: 4, dpr: 1 };
}

function setup() {
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
  return { root, sim, renderer, app };
}

describe('createApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('boots into idle', () => {
    const { root } = setup();
    expect(root.classList.contains('idle')).toBe(true);
    expect(root.classList.contains('station')).toBe(false);
    expect(window.__flatland.mode).toBe('idle');
  });

  it('any key opens the station and Escape returns to idle', () => {
    const { root } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(root.classList.contains('station')).toBe(true);
    expect(window.__flatland.mode).toBe('station');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.classList.contains('idle')).toBe(true);
    expect(window.__flatland.mode).toBe('idle');
  });

  it('speed keys and cluster buttons send setSpeed', () => {
    const { sim, root } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(sim.sent.at(-1)).toEqual({ type: 'setSpeed', payload: { speed: 4 } });
    expect(window.__flatland.speed).toBe(4);

    const btn = root.querySelector('[data-sp="16"]');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(sim.sent.at(-1)).toEqual({ type: 'setSpeed', payload: { speed: 16 } });
    expect(window.__flatland.speed).toBe(16);
  });

  it('space toggles pause', () => {
    const { sim } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(sim.sent.at(-1)).toEqual({ type: 'setSpeed', payload: { speed: 0 } });
    expect(window.__flatland.speed).toBe(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(sim.sent.at(-1)).toEqual({ type: 'setSpeed', payload: { speed: 1 } });
    expect(window.__flatland.speed).toBe(1);
  });

  it('keys are ignored while an input has focus', () => {
    const { root } = setup();
    const textInput = document.createElement('input');
    document.body.appendChild(textInput);
    textInput.focus();

    textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(root.classList.contains('idle')).toBe(true);
    expect(window.__flatland.mode).toBe('idle');
  });

  it('hidden document pauses the sim and visible resumes it', () => {
    const { sim } = setup();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sim.sent.at(-1)).toEqual({ type: 'pause', payload: {} });

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sim.sent.at(-1)).toEqual({ type: 'resume', payload: {} });
  });
});
