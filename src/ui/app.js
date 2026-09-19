/**
 * The app state machine (SPEC §5.4): idle <-> station mode, speed, the
 * camera, and the floating cluster. Every DOM/global is injectable so
 * jsdom tests can stub the renderer — `getContext` isn't available there.
 * `world` (the station grid's `#world` container, P2-08's `layout.js`)
 * is where the floating cluster and, later, the idle overlay mount — both
 * are `position: absolute` against it, not against `#app` itself, since
 * `#app` is now a grid with its own top/rail/insp/dock cells.
 * Selection (P2-10): a tap picks the nearest organism (SPEC §5.4) within
 * `PICK_RADIUS_TILES` of the tap in the caller's `getSnapshot()` (main.js
 * supplies its latest decoded snapshot); a hit both opens the station (if
 * idle) and selects, a miss from idle still opens the station alone.
 */
import { attachInput } from './input.js';
import { zoomAt, fit, clamp } from '../render/camera.js';
import { createHud, setActiveSpeed, setZoomLabel } from '../render/hud.js';
import { pick } from '../render/renderer.js';
import { createTooltip, tileTooltipText, organismTooltipText } from './station/tooltip.js';

const ZOOM_KEY_FACTOR = 1.4;
/** Picking radius, in tiles (PLAN.md P2-10). */
const PICK_RADIUS_TILES = 2.5;

/**
 * @param {{
 *   root: HTMLElement,
 *   world?: HTMLElement,
 *   sim: { send: (type: string, payload?: *) => void },
 *   renderer: { view: HTMLCanvasElement, width: number, height: number, px: number },
 *   camera: import('../render/camera.js').Camera,
 *   doc?: Document,
 *   win?: Window & typeof globalThis,
 *   getSnapshot?: () => * | null,
 *   speciesStore?: { name: (id: number) => string|undefined } | null,
 * }} opts
 * @returns {{ root: HTMLElement, world: HTMLElement, setMode: (mode: 'idle'|'station') => void, setSpeed: (n: number) => void, zoomBy: (f: number, anchor?: {x:number,y:number}) => void, fitWorld: () => void, camera: () => import('../render/camera.js').Camera, mode: () => 'idle'|'station', setCamera: (next: import('../render/camera.js').Camera) => void, getLastInteractionAt: () => number, getSelectedId: () => number | null, select: (id: number | null) => void, deselect: () => void, onSelectionChange: (cb: (id: number | null) => void) => (() => void), getHighlightSpecies: () => number | null, setHighlightSpecies: (id: number | null) => void, onHighlightChange: (cb: (id: number | null) => void) => (() => void), getLensState: () => { night: boolean, energy: boolean, scent: boolean[], colorMode: 'self'|'species'|'energy'|'age' }, toggleLens: (key: 'night'|'energy') => void, toggleScent: (channel: number) => void, setColorMode: (mode: 'self'|'species'|'energy'|'age') => void, onLensChange: (cb: (state: *) => void) => (() => void), detach: () => void }}
 */
export function createApp({
  root,
  world = root,
  sim,
  renderer,
  camera,
  doc = document,
  win = window,
  getSnapshot = () => null,
  speciesStore = null,
}) {
  let mode = /** @type {'idle'|'station'} */ ('idle');
  let speed = 1;
  let cam = { ...camera };
  /** Wall-clock ms of the last *user* pan/pinch/wheel gesture (SPEC §5.1: suspends the idle auto-camera for 10s). */
  let lastInteractionAt = -Infinity;

  /** @type {number | null} */
  let selectedId = null;
  /** @type {Set<(id: number | null) => void>} */
  const selectionListeners = new Set();

  /**
   * @param {number | null} id
   * @returns {void}
   */
  function select(id) {
    selectedId = id;
    sim.send('select', { id });
    for (const cb of selectionListeners) cb(selectedId);
  }

  /** @returns {void} */
  function deselect() {
    select(null);
  }

  /**
   * The phylogeny pane's hover/tap highlight (SPEC §5.2, P2-11): rings the
   * living members of one species on the map. Independent of `selectedId`.
   * @type {number | null}
   */
  let highlightSpecies = null;
  /** @type {Set<(id: number | null) => void>} */
  const highlightListeners = new Set();

  /**
   * @param {number | null} id
   * @returns {void}
   */
  function setHighlightSpecies(id) {
    highlightSpecies = id;
    for (const cb of highlightListeners) cb(highlightSpecies);
  }

  /**
   * Lens rail state (SPEC §5.2, P2-09/P3-02): Night defaults on, Energy
   * density and every scent channel off. `colorMode` is the separate
   * "Color by" radio (P2-07's four modes).
   * @type {{ night: boolean, energy: boolean, scent: boolean[], colorMode: 'self'|'species'|'energy'|'age' }}
   */
  let lensState = {
    night: true,
    energy: false,
    scent: [false, false, false, false],
    colorMode: 'self',
  };
  /** @type {Set<(state: typeof lensState) => void>} */
  const lensListeners = new Set();

  /** @returns {void} */
  function notifyLensChange() {
    for (const cb of lensListeners) cb(lensState);
  }

  /**
   * @param {'night'|'energy'} key
   * @returns {void}
   */
  function toggleLens(key) {
    lensState = { ...lensState, [key]: !lensState[key] };
    notifyLensChange();
  }

  /**
   * @param {number} channel 0-3 (SPEC §4.8's 4 channels; keys T/A/M/K)
   * @returns {void}
   */
  function toggleScent(channel) {
    const scent = lensState.scent.slice();
    scent[channel] = !scent[channel];
    lensState = { ...lensState, scent };
    notifyLensChange();
  }

  /**
   * @param {'self'|'species'|'energy'|'age'} mode_
   * @returns {void}
   */
  function setColorMode(mode_) {
    lensState = { ...lensState, colorMode: mode_ };
    notifyLensChange();
  }

  const hud = createHud(doc);
  world.appendChild(hud.el);

  const tooltip = createTooltip(doc);
  world.appendChild(tooltip.el);
  /** Terrain grid, cached across snapshots that omit it (same pattern as idle.js's).
   * @type {Uint8Array | null} */
  let cachedTerrain = null;

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
    onTap: (wx, wy) => {
      const snap = getSnapshot();
      const id = snap ? pick(snap, wx / renderer.px, wy / renderer.px, PICK_RADIUS_TILES) : -1;
      if (id !== -1) {
        if (mode === 'idle') setMode('station');
        select(id);
        return;
      }
      if (mode === 'idle') setMode('station');
    },
    onHover: (wx, wy, pointerType, localX, localY) => {
      if (pointerType !== 'mouse') return;
      const snap = getSnapshot();
      if (!snap) {
        tooltip.hide();
        return;
      }
      if (snap.terrain) cachedTerrain = snap.terrain.slice();
      tooltip.move(localX + 12, localY + 12);

      const tileX = wx / renderer.px;
      const tileY = wy / renderer.px;
      const id = pick(snap, tileX, tileY, PICK_RADIUS_TILES);
      if (id !== -1) {
        const idx = snap.orgs.id.indexOf(id);
        const name =
          speciesStore?.name?.(snap.orgs.species[idx]) ?? `lineage ${snap.orgs.species[idx]}`;
        tooltip.show(organismTooltipText(name, snap.orgs.energyFrac[idx]));
        return;
      }
      if (!cachedTerrain) {
        tooltip.hide();
        return;
      }
      const tx = Math.max(0, Math.min(renderer.width - 1, Math.floor(tileX)));
      const ty = Math.max(0, Math.min(renderer.height - 1, Math.floor(tileY)));
      const terrainType = cachedTerrain[ty * renderer.width + tx];
      const plantsFraction = snap.plants ? snap.plants[ty * renderer.width + tx] : 0;
      const tileIdx = ty * renderer.width + tx;
      const scentFractions = snap.pher
        ? snap.pher.map(/** @param {Float32Array} p */ (p) => p[tileIdx])
        : undefined;
      tooltip.show(tileTooltipText(terrainType, plantsFraction, scentFractions));
    },
    onLeave: () => tooltip.hide(),
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
      case 'l':
      case 'L':
        toggleLens('night');
        return;
      case 'e':
      case 'E':
        toggleLens('energy');
        return;
      case 't':
      case 'T':
        toggleScent(0);
        return;
      case 'a':
      case 'A':
        toggleScent(1);
        return;
      case 'm':
      case 'M':
        toggleScent(2);
        return;
      case 'k':
      case 'K':
        toggleScent(3);
        return;
      default:
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
    get selectedId() {
      return selectedId;
    },
  };

  return {
    root,
    world,
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
    getSelectedId: () => selectedId,
    select,
    deselect,
    /**
     * Subscribe to selection changes (rail.js-style: inspector.js's view
     * over `app`'s state).
     * @param {(id: number | null) => void} cb
     * @returns {() => void} unsubscribe
     */
    onSelectionChange(cb) {
      selectionListeners.add(cb);
      return () => selectionListeners.delete(cb);
    },
    getHighlightSpecies: () => highlightSpecies,
    setHighlightSpecies,
    /**
     * Subscribe to phylogeny highlight changes (phylogeny-pane.js and the
     * renderer's ring).
     * @param {(id: number | null) => void} cb
     * @returns {() => void} unsubscribe
     */
    onHighlightChange(cb) {
      highlightListeners.add(cb);
      return () => highlightListeners.delete(cb);
    },
    getLensState: () => lensState,
    toggleLens,
    toggleScent,
    setColorMode,
    /**
     * Subscribe to lens/colour-mode changes (rail.js's chips).
     * @param {(state: typeof lensState) => void} cb
     * @returns {() => void} unsubscribe
     */
    onLensChange(cb) {
      lensListeners.add(cb);
      return () => lensListeners.delete(cb);
    },
    detach() {
      detachInput();
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
