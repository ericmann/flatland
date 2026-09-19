// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createIdle, isSnapshotFrame } from '../../src/ui/idle.js';
import { makeConfig } from '../../src/core/config.js';
import { regionName } from '../../src/core/names.js';
import { TERRAIN } from '../../src/core/terrain.js';

const cfg = makeConfig({ world: { width: 20, height: 20 } });

/** A fake app: a real DOM root, an in-memory camera, and interaction tracking. */
function fakeApp() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  let cam = { x: 40, y: 40, z: 3.2 };
  let lastInteractionAt = -Infinity;
  return {
    root,
    world: root,
    modeChanges: [],
    camera: () => cam,
    setCamera: (next) => {
      cam = next;
    },
    getLastInteractionAt: () => lastInteractionAt,
    setInteractionAt(t) {
      lastInteractionAt = t;
    },
    setMode(m) {
      this.modeChanges.push(m);
    },
  };
}

/** A flat all-grass terrain, so regionName is deterministic and simple. */
function flatTerrain(w, h) {
  return new Uint8Array(w * h).fill(TERRAIN.GRASS);
}

/**
 * A minimal decoded-snapshot stand-in with just the fields idle.js reads.
 */
function fakeSnapshot({
  tick = 1000,
  light = 0.5,
  terrain = flatTerrain(cfg.world.width, cfg.world.height),
  orgs = { n: 0, x: [], y: [], id: [], species: [], flagsByte: [] },
  events = [],
} = {}) {
  const eventsCount = events.length;
  const flat = new Int32Array(eventsCount * 6);
  events.forEach((e, i) => {
    flat.set([e.kind, e.tick, e.x, e.y, e.a, e.b ?? 0], i * 6);
  });
  return {
    tick,
    light,
    terrain,
    eventsCount,
    events: flat,
    orgs: {
      n: orgs.n,
      x: Float32Array.from(orgs.x),
      y: Float32Array.from(orgs.y),
      id: Uint32Array.from(orgs.id),
      species: Int32Array.from(orgs.species),
      flagsByte: Uint8Array.from(orgs.flagsByte),
    },
  };
}

const EV_HUNT = 1;

describe('isSnapshotFrame', () => {
  it('is true on every other frame (idle runs at half the rAF rate)', () => {
    expect([0, 1, 2, 3, 4].map(isSnapshotFrame)).toEqual([true, false, true, false, true]);
  });
});

describe('createIdle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('picks a hunt POI when a recent hunt event exists (random stubbed)', () => {
    const app = fakeApp();
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: false,
      random: () => 0,
    });

    const snap = fakeSnapshot({
      tick: 1000,
      events: [{ kind: EV_HUNT, tick: 900, x: 5, y: 5, a: 2 }],
    });
    idle.tick(snap, 0);

    expect(idle.caption().kind).toBe('A hunt');
  });

  it('caption contains the region name', () => {
    const app = fakeApp();
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: false,
      random: () => 0,
    });

    const snap = fakeSnapshot({
      tick: 1000,
      events: [{ kind: EV_HUNT, tick: 900, x: 5, y: 5, a: 2 }],
    });
    idle.tick(snap, 0);

    const expectedRegion = regionName(5, 5, snap.terrain, cfg.world.width, cfg.world.height);
    expect(idle.caption().text).toContain(expectedRegion);
  });

  it('a user pan suspends the auto-camera for the override window', () => {
    const app = fakeApp();
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: false,
      random: () => 0,
    });
    const before = app.camera();

    app.setInteractionAt(1000);
    const snap = fakeSnapshot({
      tick: 1000,
      events: [{ kind: EV_HUNT, tick: 900, x: 5, y: 5, a: 2 }],
    });
    idle.tick(snap, 1000 + 5000); // 5s into the 10s override window

    expect(app.camera()).toEqual(before); // untouched while suspended

    idle.tick(snap, 1000 + 10001); // just past the override window
    expect(app.camera()).not.toEqual(before);
  });

  it('reduced motion cuts to the target in one frame', () => {
    const app = fakeApp();
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: true,
      random: () => 0,
    });

    const snap = fakeSnapshot({
      tick: 1000,
      events: [{ kind: EV_HUNT, tick: 900, x: 5, y: 5, a: 2 }],
    });
    idle.tick(snap, 0);

    expect(app.camera()).toEqual({ x: 5 * 4, y: 5 * 4, z: 3.2 });
  });

  it('ticker shows the newest chronicle entry', () => {
    const app = fakeApp();
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: false,
      random: () => 0,
    });

    idle.onChronicle([
      {
        tick: 10,
        kind: 'genesis',
        text: 'Genesis. 4 organisms.',
        place: 'the plains',
        subjects: [],
      },
      { tick: 20, kind: 'first', text: 'First hunt recorded.', place: 'the marsh', subjects: [] },
    ]);

    expect(idle.ui.tickE.textContent).toBe('First hunt recorded.');
  });
});
