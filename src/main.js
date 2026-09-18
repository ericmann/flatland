// Entry point. For now (P0-07): generate a seeded terrain on the main
// thread and render it with pan/zoom. The Worker, organisms and full UI
// chrome arrive in later Phase 1/2 tasks — see docs/PLAN.md.
import { makeConfig } from './core/config.js';
import { generateTerrain } from './core/terrain.js';
import { Renderer } from './render/renderer.js';
import { clamp, zoomAt, fit, screenToWorld } from './render/camera.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : 1;

const cfg = makeConfig();
const { terrain } = generateTerrain(seed, cfg);

const app = document.getElementById('app');

const view = document.createElement('canvas');
view.id = 'view';
if (app) {
  app.replaceChildren(view);
}

const renderer = new Renderer({ width: cfg.world.width, height: cfg.world.height, view });
const worldW = cfg.world.width * renderer.px;
const worldH = cfg.world.height * renderer.px;

renderer.resize();
renderer.paintTerrain(terrain);

/** @type {import('./render/camera.js').Camera} */
let cam = fit({ x: 0, y: 0, z: 1 }, view.width, view.height, worldW, worldH);

/**
 * Re-clamp the camera and draw one frame.
 * @returns {void}
 */
function draw() {
  cam = clamp(cam, view.width, view.height, worldW, worldH);
  renderer.present(cam);
  // The first painted frame is a signal e2e tests wait on (see P0-08).
  document.documentElement.dataset.painted = '1';
}

window.addEventListener('resize', () => {
  renderer.resize();
  draw();
});

view.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = view.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * renderer.dpr;
    const sy = (e.clientY - rect.top) * renderer.dpr;
    const anchor = screenToWorld(cam, view.width, view.height, sx, sy);
    cam = zoomAt(cam, Math.exp(-e.deltaY * 0.0015), anchor.x, anchor.y);
    draw();
  },
  { passive: false },
);

/** @type {{ x: number, y: number, cx: number, cy: number } | null} */
let drag = null;

view.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
  view.setPointerCapture(e.pointerId);
});

view.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) * renderer.dpr;
  const dy = (e.clientY - drag.y) * renderer.dpr;
  cam = { x: drag.cx - dx / cam.z, y: drag.cy - dy / cam.z, z: cam.z };
  draw();
});

view.addEventListener('pointerup', () => {
  drag = null;
});
view.addEventListener('pointercancel', () => {
  drag = null;
});

draw();
