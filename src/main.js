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
import { createGodPane } from './ui/station/god-pane.js';
import { SpeciesStore } from './ui/species-store.js';
import { Renderer } from './render/renderer.js';
import { fit } from './render/camera.js';
import { decodeSnapshot } from './sim/snapshot.js';
import { FLAG_TERRAIN, FLAG_SELECTED, FLAG_SPECIES, FLAG_PHEROMONE } from './sim/protocol.js';
import { makeConfig, applyDiff } from './core/config.js';
import { decodeShare } from './persist/share.js';
import { decodeRecord } from './core/save.js';
import { openStore } from './persist/db.js';
import { startAutosave } from './persist/autosave.js';

const params = new URLSearchParams(window.location.search);

/**
 * A share link's `?w=` payload (SPEC §5.6), decoded once at boot, or
 * `null` for an ordinary `?seed=`/`?w=`-less load. `?w=` takes
 * precedence over `?seed=`, which takes precedence over a saved
 * auto-save, which takes precedence over a fresh random seed (P4-06's
 * boot order) — see `boot()` below.
 * @type {{ seed: number, configDiff: *, interventions: *[], tick: number } | null}
 */
let sharedWorld = null;
const wParam = params.get('w');
if (wParam) {
  try {
    sharedWorld = decodeShare(wParam);
  } catch (err) {
    console.error('Flatland: could not decode the ?w= share link', err);
  }
}

const seedParam = Number(params.get('seed'));

const db = openStore();

const root = document.getElementById('app');
const layout = createLayout(document);
if (root) mountLayout(root, layout);

const view = document.createElement('canvas');
view.id = 'view';
const vignette = document.createElement('div');
vignette.className = 'vig';
layout.world.append(view, vignette);

// Interpretation (P1-15 log, resolved by P4-05, extended P4-06): main.js
// sends `load` with no config override for an ordinary/random-seed boot,
// so the sim runs against exactly `makeConfig({})` — computing the same
// object locally is the only way idle.js (UI-side) gets `cfg` without
// changing the protocol/scheduler. A `?w=` share link's `configDiff` or a
// resumed auto-save's config is the one case with a real override, so
// it is applied identically on both sides here. `cfg` starts as the
// `makeConfig({})` default and `boot()` (below, once the boot source is
// known — synchronously for `?w=`/`?seed=`, after one IndexedDB read for
// an auto-save resume) reassigns it before sending `load`; every reader
// of `cfg` (idle, topbar, the station panes) is created later, inside the
// `loaded` handler, so it always sees the final value.
let cfg = makeConfig({});
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
/** @type {ReturnType<typeof createGodPane> | null} */
let godPane = null;
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
  // `renderer.resize()` reads `view.parentElement`'s box (SPEC §6.5): the
  // `#world` grid cell, whose size also changes on a mode switch (idle's
  // collapsed rail/dock grid rows vs station's) and a dock tab switch (a
  // taller Hand of God pane vs Chronicle's), neither of which fires a
  // `window` `resize` event — only a real viewport resize does. Without
  // this, the canvas's backing-store resolution goes stale relative to
  // its CSS box after either change, throwing off every screen-to-world
  // conversion (taps land on the wrong tile) until the next real window
  // resize. `ResizeObserver` catches both, and any other CSS-only cause.
  new ResizeObserver(() => {
    if (renderer) renderer.resize();
    redraw();
  }).observe(layout.world);
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
  topbar = app ? createTopBar({ el: layout.top, app, cfg, db }) : null;
  topbar?.setSeed(msg.seed);
  startAutosave({ sim: client, db, cfg });
  if (app) {
    createRail({ el: layout.rail, app });
    inspector = createInspector({ el: layout.insp, app, cfg, speciesStore });
    const dock = createDock({ el: layout.dock });
    chroniclePane = createChroniclePane({ el: dock.panes.chron, cfg });
    phylogenyPane = createPhylogenyPane({ el: dock.panes.phylo, app, speciesStore });
    charts = createCharts({ el: dock.panes.charts, speciesStore });
    godPane = createGodPane({ el: dock.panes.god, app });
    dock.onPaneChange((name) => {
      phylogenyPane?.setVisible(name === 'phylo');
      charts?.setVisible(name === 'charts');
      godPane?.setVisible(name === 'god');
    });
    app.onLensChange(redraw); // instant feedback for the L/E keys and rail chips.
    app.onSelectionChange(redraw); // the selection ring appears without waiting for the next snapshot.
    app.onHighlightChange(redraw); // the phylogeny highlight rings appear immediately too.
  }
});

client.on('status', (msg) => {
  // A share link's replay (P4-05) posts a distinct, partial `status`
  // shape (`{replaying, progress}` only, SPEC §5.6) while fast-forwarding
  // to the link's tick — forwarding that to `topbar.update` (which reads
  // `tick`/`light`/`season`/…) would render garbage, so it's handled
  // separately until the replay finishes and regular status events resume.
  if (msg.replaying !== undefined) {
    document.documentElement.dataset.replaying = msg.replaying ? '1' : '0';
    return;
  }
  // A resume-verification replay's result (P4-06, Decisions §12.4): its
  // own distinct partial `status` shape (`{verify, at}` only), surfaced
  // to the console on a mismatch (a determinism bug), never silently
  // ignored, and otherwise not shown in the UI.
  if (msg.verify !== undefined) {
    if (msg.verify === 'mismatch') {
      console.error('[flatland] determinism mismatch after resume', { at: msg.at });
    }
    return;
  }
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

/**
 * A fresh positive seed via `crypto.getRandomValues` (SPEC §5.6, P4-06:
 * "fresh with a random seed... UI side" — never `world.rng`, which is
 * `src/core`-only and doesn't exist yet at boot time anyway).
 * @returns {number}
 */
function randomSeed() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 0x7fffffff) + 1; // 1..0x7fffffff, never 0 (the "no seed given" sentinel elsewhere).
}

/**
 * Decide what to `load` (SPEC §5.6, P4-06's boot order): a `?w=` share
 * link, else a `?seed=` param, else a resumable auto-save from
 * IndexedDB (with a resume-verification checkpoint attached), else a
 * fresh random seed recorded into the URL via `history.replaceState` so
 * a reload doesn't roll a new one. Sets the module-level `cfg` before
 * sending `load`, so every reader created in the `loaded` handler above
 * sees the config the sim is actually running.
 * @returns {Promise<void>}
 */
async function boot() {
  if (sharedWorld) {
    cfg = applyDiff(sharedWorld.configDiff);
    client.send('load', {
      seed: sharedWorld.seed,
      config: cfg,
      interventions: sharedWorld.interventions,
      replayTo: sharedWorld.tick,
      speed: 0, // loads paused, so the viewer sees the exact replayed state before it resumes ticking.
    });
    return;
  }

  if (Number.isFinite(seedParam) && seedParam > 0) {
    cfg = makeConfig({});
    client.send('load', { seed: Math.floor(seedParam) });
    return;
  }

  /** @type {*} */
  let saved = null;
  try {
    saved = await db.get('world');
  } catch (err) {
    console.error('Flatland: could not read the auto-saved world', err);
  }
  if (saved) {
    const decoded = decodeRecord(saved.record);
    cfg = decoded.config;
    client.send('load', {
      seed: decoded.seed,
      config: decoded.config,
      interventions: decoded.interventions,
      state: saved.state,
      verify:
        saved.checkpoint != null
          ? {
              checkpoint: saved.checkpoint,
              checkpointTick: saved.checkpointTick,
              expectedHash: saved.hash,
            }
          : undefined,
    });
    return;
  }

  const fresh = randomSeed();
  window.history.replaceState(null, '', `?seed=${fresh}`);
  cfg = makeConfig({});
  client.send('load', { seed: fresh });
}
boot();

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
