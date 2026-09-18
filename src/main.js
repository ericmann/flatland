// Entry point (P1-15): boots the sim, the renderer, the app state machine
// and idle mode (the default experience — SPEC §5.1). Bundled fonts only
// (SPEC §3 rule 9): the per-weight latin css files, never a Google Fonts
// URL.
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';

import { createSim, SimClient } from './ui/sim-client.js';
import { createApp } from './ui/app.js';
import { createIdle, isSnapshotFrame } from './ui/idle.js';
import { Renderer } from './render/renderer.js';
import { fit } from './render/camera.js';
import { decodeSnapshot } from './sim/snapshot.js';
import { FLAG_TERRAIN } from './sim/protocol.js';
import { makeConfig } from './core/config.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : 1;

const root = document.getElementById('app');
const view = document.createElement('canvas');
view.id = 'view';
const vignette = document.createElement('div');
vignette.className = 'vig';
if (root) {
  root.replaceChildren(view, vignette);
}

// Interpretation (P1-15 log): main.js sends `load` with no config override,
// so the sim runs against exactly `makeConfig({})` — computing the same
// object locally is the only way idle.js (UI-side) gets `cfg` without
// changing the protocol/scheduler (out of this task's Files touched). If a
// later task lets the UI choose a config override, that override must be
// applied identically on both sides.
const cfg = makeConfig({});
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const client = new SimClient(createSim());

/** @type {import('./render/renderer.js').Renderer | null} */
let renderer = null;
/** @type {ReturnType<typeof createApp> | null} */
let app = null;
/** @type {ReturnType<typeof createIdle> | null} */
let idle = null;
/** @type {*} the most recently decoded snapshot, redrawn on pan/zoom/resize without a round-trip to the sim. */
let lastSnapshot = null;
let snapshotOutstanding = false;
let needsTerrain = true; // the renderer has no cached terrain until the first FLAG_TERRAIN reply.
let painted = false;
let frameCount = 0;

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
  idle = app ? createIdle({ app, camera, cfg, reduceMotion }) : null;
});

client.on('status', (msg) => {
  document.documentElement.dataset.tick = String(msg.tick);
});

client.on('chronicle', (msg) => {
  idle?.onChronicle(msg.entries);
});

client.on('snapshot', (msg) => {
  lastSnapshot = decodeSnapshot(msg.buffer);
  if (lastSnapshot.terrain) needsTerrain = false;
  if (app?.mode() === 'idle') idle?.tick(lastSnapshot, performance.now());
  redraw();
  client.send('releaseSnapshot', { buffer: msg.buffer }, [msg.buffer]);
  snapshotOutstanding = false;
});

client.send('load', { seed });

/**
 * Request the next snapshot. Once per animation frame in station mode;
 * every other rAF in idle mode (SPEC §8's 30fps idle cadence against a
 * ~60fps rAF driver, via `isSnapshotFrame`). Only when the previous one
 * has already been released and the tab is visible (SPEC §8: the sim
 * itself is paused while hidden, so there is nothing to request until
 * `visibilitychange` fires again).
 * @returns {void}
 */
function requestFrame() {
  const idleThrottled = app?.mode() === 'idle' && !isSnapshotFrame(frameCount);
  if (!document.hidden && !idleThrottled && !snapshotOutstanding && renderer) {
    snapshotOutstanding = true;
    client.send('requestSnapshot', { flags: needsTerrain ? FLAG_TERRAIN : 0 });
  }
  frameCount++;
  requestAnimationFrame(requestFrame);
}
requestAnimationFrame(requestFrame);

window.addEventListener('resize', () => {
  if (renderer) renderer.resize();
  redraw();
});
