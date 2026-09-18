// Entry point (P1-13): the simulation runs in a Worker (or the
// main-thread fallback), the main thread only requests snapshots, decodes
// and renders them, and forwards input as intent messages. Terrain is no
// longer generated here — it arrives in the first snapshot.
import { createSim, SimClient } from './ui/sim-client.js';
import { Renderer } from './render/renderer.js';
import { clamp, zoomAt, fit, screenToWorld } from './render/camera.js';
import { decodeSnapshot } from './sim/snapshot.js';
import { FLAG_TERRAIN } from './sim/protocol.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : 1;

const app = document.getElementById('app');
const view = document.createElement('canvas');
view.id = 'view';
if (app) {
  app.replaceChildren(view);
}

const client = new SimClient(createSim());

/** @type {import('./render/renderer.js').Renderer | null} */
let renderer = null;
/** @type {import('./render/camera.js').Camera} */
let cam = { x: 0, y: 0, z: 1 };
let worldW = 0;
let worldH = 0;
/** @type {*} the most recently decoded snapshot, redrawn on pan/zoom/resize without a round-trip to the sim. */
let lastSnapshot = null;
let snapshotOutstanding = false;
let needsTerrain = true; // the renderer has no cached terrain until the first FLAG_TERRAIN reply.
let painted = false;

/**
 * Redraw the last known snapshot at the current camera, if both exist.
 * @returns {void}
 */
function redraw() {
  if (!renderer || !lastSnapshot) return;
  cam = clamp(cam, view.width, view.height, worldW, worldH);
  renderer.draw(lastSnapshot, cam, { night: true });
  if (!painted) {
    document.documentElement.dataset.painted = '1';
    painted = true;
  }
}

client.on('loaded', (msg) => {
  renderer = new Renderer({ width: msg.width, height: msg.height, view });
  worldW = msg.width * renderer.px;
  worldH = msg.height * renderer.px;
  renderer.resize();
  cam = fit({ x: 0, y: 0, z: 1 }, view.width, view.height, worldW, worldH);
});

client.on('status', (msg) => {
  document.documentElement.dataset.tick = String(msg.tick);
});

client.on('snapshot', (msg) => {
  lastSnapshot = decodeSnapshot(msg.buffer);
  if (lastSnapshot.terrain) needsTerrain = false;
  redraw();
  client.send('releaseSnapshot', { buffer: msg.buffer }, [msg.buffer]);
  snapshotOutstanding = false;
});

client.send('load', { seed });

/**
 * Request the next snapshot, once per animation frame and only when the
 * previous one has already been released (SPEC §6.4).
 * @returns {void}
 */
function requestFrame() {
  if (!snapshotOutstanding) {
    snapshotOutstanding = true;
    client.send('requestSnapshot', { flags: needsTerrain ? FLAG_TERRAIN : 0 });
  }
  requestAnimationFrame(requestFrame);
}
requestAnimationFrame(requestFrame);

window.addEventListener('resize', () => {
  if (renderer) renderer.resize();
  redraw();
});

view.addEventListener(
  'wheel',
  (e) => {
    if (!renderer) return;
    e.preventDefault();
    const rect = view.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * renderer.dpr;
    const sy = (e.clientY - rect.top) * renderer.dpr;
    const anchor = screenToWorld(cam, view.width, view.height, sx, sy);
    cam = zoomAt(cam, Math.exp(-e.deltaY * 0.0015), anchor.x, anchor.y);
    redraw();
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
  if (!drag || !renderer) return;
  const dx = (e.clientX - drag.x) * renderer.dpr;
  const dy = (e.clientY - drag.y) * renderer.dpr;
  cam = { x: drag.cx - dx / cam.z, y: drag.cy - dy / cam.z, z: cam.z };
  redraw();
});

view.addEventListener('pointerup', () => {
  drag = null;
});
view.addEventListener('pointercancel', () => {
  drag = null;
});
