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
const EV_IMMIGRATION = 4;

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

  it("a repeated organism target on a later day says 'second night running'", () => {
    const app = fakeApp();
    // A single carnivore: with random() = 0.99, the weighted pick always
    // lands on 'Following' (weight 2) over 'A herd' (weight 1) — see the
    // comment in the next test for the arithmetic.
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: false,
      random: () => 0.99,
    });
    const carnivoreOrgs = { n: 1, x: [5], y: [5], id: [7], species: [3], flagsByte: [0b0100] };

    const day0 = fakeSnapshot({ tick: 1000, orgs: carnivoreOrgs });
    idle.tick(day0, 0);
    expect(idle.caption().kind).toBe('Following');
    expect(idle.caption().text).not.toContain('running');

    // Advance past poiUntil (HOLD_MS_MAX = 12000) and past a day boundary
    // (ticksPerDay = 1800) so the next pick both re-triggers and reads as
    // a later world day.
    const day1 = fakeSnapshot({ tick: 1000 + cfg.time.ticksPerDay, orgs: carnivoreOrgs });
    idle.tick(day1, 13000);

    expect(idle.caption().kind).toBe('Following');
    expect(idle.caption().text).toBe('the same hunter, second night running.');
  });

  it("a repeated species hunt says 'again'", () => {
    const app = fakeApp();
    // Hunt events are pushed to `opts` before any organism-derived option,
    // so random() = 0 always lands on the hunt (weight doesn't matter for
    // the first-pushed candidate when r starts at 0).
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: false,
      random: () => 0,
    });

    const first = fakeSnapshot({
      tick: 1000,
      events: [{ kind: EV_HUNT, tick: 900, x: 5, y: 5, a: 42 }],
    });
    idle.tick(first, 0);
    expect(idle.caption().kind).toBe('A hunt');
    expect(idle.caption().text).not.toContain('again');

    const second = fakeSnapshot({
      tick: 2000,
      events: [{ kind: EV_HUNT, tick: 1990, x: 6, y: 6, a: 42 }],
    });
    idle.tick(second, 9000); // past poiUntil (HOLD_MS_MIN = 8000)

    expect(idle.caption().kind).toBe('A hunt');
    expect(idle.caption().text).toBe('lineage 42 again.');
  });

  it('the ring never exceeds 16', () => {
    const app = fakeApp();
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: false,
      random: () => 0,
    });

    let now = 0;
    let tick = 1000;
    function huntFrom(speciesId) {
      now += 9000;
      tick += 100;
      idle.tick(
        fakeSnapshot({
          tick,
          events: [{ kind: EV_HUNT, tick: tick - 10, x: 5, y: 5, a: speciesId }],
        }),
        now,
      );
    }

    huntFrom(99); // remembered first.
    for (let s = 1; s <= 16; s++) huntFrom(s); // 16 more: fills the ring past capacity.

    // Species 99's memory should have been evicted by now (16 newer
    // entries have since displaced it in the 16-slot ring), so it reads
    // as a first-time sighting again, not "again".
    huntFrom(99);
    expect(idle.caption().text).not.toContain('again');
  });

  it('an immigration event yields an Arrivals POI', () => {
    const app = fakeApp();
    const idle = createIdle({
      app,
      camera: app.camera(),
      cfg,
      reduceMotion: false,
      random: () => 0,
    });

    // Landed on the west edge (x = 0) of the 20x20 test world.
    const snap = fakeSnapshot({
      tick: 1000,
      events: [{ kind: EV_IMMIGRATION, tick: 950, x: 0, y: 10, a: 5 }],
    });
    idle.tick(snap, 0);

    expect(idle.caption().kind).toBe('Arrivals');
    expect(idle.caption().text).toContain('west');
  });
});
