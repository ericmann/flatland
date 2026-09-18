// Entry point (P1-14): boots the sim, the renderer and the app state
// machine (idle/station, speed, camera, the input contract and the
// floating cluster). Terrain/organisms arrive via snapshots (P1-13).
import { createSim, SimClient } from './ui/sim-client.js';
import { createApp } from './ui/app.js';
import { Renderer } from './render/renderer.js';
import { fit } from './render/camera.js';
import { decodeSnapshot } from './sim/snapshot.js';
import { FLAG_TERRAIN } from './sim/protocol.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : 1;

const root = document.getElementById('app');
const view = document.createElement('canvas');
view.id = 'view';
if (root) {
  root.replaceChildren(view);
}

const client = new SimClient(createSim());

/** @type {import('./render/renderer.js').Renderer | null} */
let renderer = null;
/** @type {ReturnType<typeof createApp> | null} */
let app = null;
/** The most recently decoded snapshot, redrawn on pan/zoom/resize without a round-trip to the sim. */
/** @type {*} */
let lastSnapshot = null;
let snapshotOutstanding = false;
let needsTerrain = true; // the renderer has no cached terrain until the first FLAG_TERRAIN reply.
let painted = false;

/**
 * Redraw the last known snapshot at the app's current camera, if both exist.
 * @returns {void}
 */
function redraw() {
  if (!renderer || !app || !lastSnapshot) return;
  renderer.draw(lastSnapshot, app.camera(), { night: true });
  if (!painted) {
    document.documentElement.dataset.painted = '1';
    painted = true;
  }
}

client.on('loaded', (msg) => {
  renderer = new Renderer({ width: msg.width, height: msg.height, view });
  const worldW = msg.width * renderer.px;
  const worldH = msg.height * renderer.px;
  renderer.resize();
  const camera = fit({ x: 0, y: 0, z: 1 }, view.width, view.height, worldW, worldH);

  app = root
    ? createApp({ root, sim: client, renderer, camera, doc: document, win: window })
    : null;
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
 * Request the next snapshot, once per animation frame, only when the
 * previous one has already been released and the tab is visible (SPEC
 * §8: the sim itself is paused while hidden, so there is nothing to
 * request until `visibilitychange` fires again).
 * @returns {void}
 */
function requestFrame() {
  if (!document.hidden && !snapshotOutstanding && renderer) {
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
