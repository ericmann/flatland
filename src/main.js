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
import { createLayout, mountLayout } from './ui/station/layout.js';
import { createTopBar } from './ui/station/topbar.js';
import { createRail } from './ui/station/rail.js';
import { createInspector } from './ui/station/inspector.js';
import { createDock } from './ui/station/dock.js';
import { createChroniclePane } from './ui/station/chronicle-pane.js';
import { createPhylogenyPane } from './ui/station/phylogeny-pane.js';
import { createCharts } from './ui/station/charts.js';
import { SpeciesStore } from './ui/species-store.js';
import { Renderer } from './render/renderer.js';
import { fit } from './render/camera.js';
import { decodeSnapshot } from './sim/snapshot.js';
import { FLAG_TERRAIN, FLAG_SELECTED, FLAG_SPECIES, FLAG_PHEROMONE } from './sim/protocol.js';
import { makeConfig } from './core/config.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : 1;

const root = document.getElementById('app');
const layout = createLayout(document);
if (root) mountLayout(root, layout);

const view = document.createElement('canvas');
view.id = 'view';
const vignette = document.createElement('div');
vignette.className = 'vig';
layout.world.append(view, vignette);

// Interpretation (P1-15 log): main.js sends `load` with no config override,
// so the sim runs against exactly `makeConfig({})` — computing the same
// object locally is the only way idle.js (UI-side) gets `cfg` without
// changing the protocol/scheduler (out of this task's Files touched). If a
// later task lets the UI choose a config override, that override must be
// applied identically on both sides.
const cfg = makeConfig({});
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const client = new SimClient(createSim());
const speciesStore = new SpeciesStore();

/** @type {import('./render/renderer.js').Renderer | null} */
let renderer = null;
/** @type {ReturnType<typeof createApp> | null} */
let app = null;
/** @type {ReturnType<typeof createIdle> | null} */
let idle = null;
/** @type {ReturnType<typeof createTopBar> | null} */
let topbar = null;
/** @type {ReturnType<typeof createInspector> | null} */
let inspector = null;
/** @type {ReturnType<typeof createChroniclePane> | null} */
let chroniclePane = null;
/** @type {ReturnType<typeof createPhylogenyPane> | null} */
let phylogenyPane = null;
/** @type {ReturnType<typeof createCharts> | null} */
let charts = null;
/** @type {*} the most recently decoded snapshot, redrawn on pan/zoom/resize without a round-trip to the sim. */
let lastSnapshot = null;
/**
 * `lastSnapshot`'s own backing buffer, held (not released) until the next
 * snapshot arrives (P2-10 finding): releasing it transfers it back to the
 * worker, which detaches it in this thread. Every access to `lastSnapshot`
 * that isn't inside the `snapshot` handler itself — resize, a lens
 * toggle, tap-to-pick, hover — happens later, after that handler has
 * already returned, so releasing eagerly left `lastSnapshot` pointing at
 * detached memory for nearly its entire lifetime. Only ever safe because
 * earlier passes (terrain/organisms) degraded to silent NaNs on a
 * detached view instead of throwing; P2-10's `pick()`/`Array.indexOf`
 * calls throw outright, which is what surfaced this.
 * @type {ArrayBuffer | null}
 */
let heldBuffer = null;
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
  renderer.draw(lastSnapshot, app.camera(), {
    ...app.getLensState(),
    speciesStore,
    selectedId: app.getSelectedId() ?? undefined,
    highlightSpecies: app.getHighlightSpecies() ?? undefined,
  });
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
    ? createApp({
        root,
        world: layout.world,
        sim: client,
        renderer,
        camera,
        doc: document,
        win: window,
        getSnapshot: () => lastSnapshot,
        speciesStore,
      })
    : null;
  idle = app ? createIdle({ app, camera, cfg, reduceMotion }) : null;
  topbar = app ? createTopBar({ el: layout.top, app, cfg }) : null;
  topbar?.setSeed(msg.seed);
  if (app) {
    createRail({ el: layout.rail, app });
    inspector = createInspector({ el: layout.insp, app, cfg, speciesStore });
    const dock = createDock({ el: layout.dock });
    chroniclePane = createChroniclePane({ el: dock.panes.chron, cfg });
    phylogenyPane = createPhylogenyPane({ el: dock.panes.phylo, app, speciesStore });
    charts = createCharts({ el: dock.panes.charts, speciesStore });
    dock.onPaneChange((name) => {
      phylogenyPane?.setVisible(name === 'phylo');
      charts?.setVisible(name === 'charts');
    });
    app.onLensChange(redraw); // instant feedback for the L/E keys and rail chips.
    app.onSelectionChange(redraw); // the selection ring appears without waiting for the next snapshot.
    app.onHighlightChange(redraw); // the phylogeny highlight rings appear immediately too.
  }
});

client.on('status', (msg) => {
  document.documentElement.dataset.tick = String(msg.tick);
  topbar?.update(msg);
});

client.on('chronicle', (msg) => {
  idle?.onChronicle(msg.entries);
  chroniclePane?.addEntries(msg.entries);
});

client.on('phylogeny', (msg) => {
  speciesStore.apply(msg);
});

client.on('stats', (msg) => {
  charts?.update(msg);
});

client.on('snapshot', (msg) => {
  // Release the *previous* buffer now that a new one has replaced it as
  // `lastSnapshot` — never the one we're about to start reading from.
  if (heldBuffer) {
    client.send('releaseSnapshot', { buffer: heldBuffer }, [heldBuffer]);
  }
  heldBuffer = msg.buffer;
  lastSnapshot = decodeSnapshot(msg.buffer);
  if (lastSnapshot.terrain) needsTerrain = false;
  if (app?.mode() === 'idle') idle?.tick(lastSnapshot, performance.now());
  inspector?.update(lastSnapshot);
  phylogenyPane?.update(lastSnapshot);
  redraw();
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
    const selectedId = app?.getSelectedId();
    let flags = (needsTerrain ? FLAG_TERRAIN : 0) | FLAG_SPECIES;
    if (selectedId != null) flags |= FLAG_SELECTED;
    if (app?.getLensState().scent.some(Boolean)) flags |= FLAG_PHEROMONE;
    client.send('requestSnapshot', { flags });
  }
  frameCount++;
  requestAnimationFrame(requestFrame);
}
requestAnimationFrame(requestFrame);

window.addEventListener('resize', () => {
  if (renderer) renderer.resize();
  redraw();
});
