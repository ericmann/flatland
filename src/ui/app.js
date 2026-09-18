/**
 * The app state machine (SPEC §5.4): idle <-> station mode, speed, the
 * camera, and the floating cluster. Every DOM/global is injectable so
 * jsdom tests can stub the renderer — `getContext` isn't available there.
 * Station chrome beyond the cluster arrives in P2-08; here it's just the
 * mode class, per this task's Out of scope.
 */
import { attachInput } from './input.js';
import { zoomAt, fit, clamp } from '../render/camera.js';
import { createHud, setActiveSpeed, setZoomLabel } from '../render/hud.js';

const ZOOM_KEY_FACTOR = 1.4;

/**
 * @param {{
 *   root: HTMLElement,
 *   sim: { send: (type: string, payload?: *) => void },
 *   renderer: { view: HTMLCanvasElement, width: number, height: number, px: number },
 *   camera: import('../render/camera.js').Camera,
 *   doc?: Document,
 *   win?: Window & typeof globalThis,
 * }} opts
 * @returns {{ root: HTMLElement, setMode: (mode: 'idle'|'station') => void, setSpeed: (n: number) => void, zoomBy: (f: number, anchor?: {x:number,y:number}) => void, fitWorld: () => void, camera: () => import('../render/camera.js').Camera, mode: () => 'idle'|'station', setCamera: (next: import('../render/camera.js').Camera) => void, getLastInteractionAt: () => number, detach: () => void }}
 */
export function createApp({ root, sim, renderer, camera, doc = document, win = window }) {
  let mode = /** @type {'idle'|'station'} */ ('idle');
  let speed = 1;
  let cam = { ...camera };
  /** Wall-clock ms of the last *user* pan/pinch/wheel gesture (SPEC §5.1: suspends the idle auto-camera for 10s). */
  let lastInteractionAt = -Infinity;

  const hud = createHud(doc);
  root.appendChild(hud.el);

  /** @returns {void} */
  function applyModeClass() {
    root.classList.remove('idle', 'station');
    root.classList.add(mode);
  }

  /**
   * @param {'idle'|'station'} next
   * @returns {void}
   */
  function setMode(next) {
    mode = next;
    applyModeClass();
  }

  /**
   * @param {number} n
   * @returns {void}
   */
  function setSpeed(n) {
    speed = n;
    sim.send('setSpeed', { speed: n });
    setActiveSpeed(hud, speed);
  }

  /**
   * World bounds in world pixels, for `fit`/`clamp`.
   * @returns {{ w: number, h: number }}
   */
  function worldSize() {
    return { w: renderer.width * renderer.px, h: renderer.height * renderer.px };
  }

  /**
   * @param {number} f
   * @param {{ x: number, y: number }} [anchor] defaults to the camera's current centre.
   * @returns {void}
   */
  function zoomBy(f, anchor) {
    const ax = anchor ? anchor.x : cam.x;
    const ay = anchor ? anchor.y : cam.y;
    cam = zoomAt(cam, f, ax, ay);
    const { w, h } = worldSize();
    cam = clamp(cam, renderer.view.width, renderer.view.height, w, h);
    setZoomLabel(hud, cam.z);
  }

  /** @returns {void} */
  function fitWorld() {
    const { w, h } = worldSize();
    cam = fit(cam, renderer.view.width, renderer.view.height, w, h);
    setZoomLabel(hud, cam.z);
  }

  hud.zoomOutBtn.addEventListener('click', () => zoomBy(1 / ZOOM_KEY_FACTOR));
  hud.zoomInBtn.addEventListener('click', () => zoomBy(ZOOM_KEY_FACTOR));
  hud.zoomLabel.addEventListener('click', fitWorld);
  for (const btn of hud.speedButtons) {
    btn.addEventListener('click', () => setSpeed(Number(btn.dataset.sp)));
  }

  const detachInput = attachInput(renderer.view, {
    getCamera: () => cam,
    onPan: (dx, dy) => {
      lastInteractionAt = performance.now();
      cam = { x: cam.x + dx, y: cam.y + dy, z: cam.z };
      const { w, h } = worldSize();
      cam = clamp(cam, renderer.view.width, renderer.view.height, w, h);
    },
    onZoom: (f, ax, ay) => {
      lastInteractionAt = performance.now();
      zoomBy(f, { x: ax, y: ay });
    },
    onTap: () => {
      // Selecting an organism arrives with the inspector (P2-10); for now
      // a tap on the map, like any other input, opens the station.
      if (mode === 'idle') setMode('station');
    },
  });

  /**
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  function onKeyDown(e) {
    const target = /** @type {HTMLElement | null} */ (e.target);
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
      return;
    }
    if (e.ctrlKey || e.metaKey) return;

    switch (e.key) {
      case ' ':
        setSpeed(speed === 0 ? 1 : 0);
        return;
      case '1':
        setSpeed(1);
        return;
      case '2':
        setSpeed(4);
        return;
      case '3':
        setSpeed(16);
        return;
      case '+':
      case '=':
        zoomBy(ZOOM_KEY_FACTOR);
        return;
      case '-':
        zoomBy(1 / ZOOM_KEY_FACTOR);
        return;
      case '0':
        fitWorld();
        return;
      case 'Escape':
        setMode('idle');
        return;
      default:
        // L, T/A/M/K, E are reserved for lenses (P2-09/P3-02); do nothing yet.
        if (mode === 'idle') setMode('station');
    }
  }
  doc.addEventListener('keydown', onKeyDown);

  /** @returns {void} */
  function onVisibilityChange() {
    if (doc.hidden) {
      sim.send('pause');
    } else {
      sim.send('resume');
    }
  }
  doc.addEventListener('visibilitychange', onVisibilityChange);

  applyModeClass();
  setActiveSpeed(hud, speed);

  /** @type {*} */ (win).__flatland = {
    get mode() {
      return mode;
    },
    get camera() {
      return cam;
    },
    get speed() {
      return speed;
    },
  };

  return {
    root,
    setMode,
    setSpeed,
    zoomBy,
    fitWorld,
    camera: () => cam,
    mode: () => mode,
    /**
     * Set the camera directly (idle.js's auto-camera glide), clamped to
     * the world. Does not count as a user interaction.
     * @param {import('../render/camera.js').Camera} next
     * @returns {void}
     */
    setCamera(next) {
      const { w, h } = worldSize();
      cam = clamp(next, renderer.view.width, renderer.view.height, w, h);
      setZoomLabel(hud, cam.z);
    },
    getLastInteractionAt: () => lastInteractionAt,
    detach() {
      detachInput();
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
