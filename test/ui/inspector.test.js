// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInspector } from '../../src/ui/station/inspector.js';
import { makeConfig } from '../../src/core/config.js';
import { TRAIT, genomeLength } from '../../src/core/genome.js';

const cfg = makeConfig({});
const gLen = genomeLength(cfg);

/** A fake app: mirrors app.js's selection/camera contract without any DOM/sim. */
function fakeApp() {
  let selectedId = null;
  let cam = { x: 0, y: 0, z: 1 };
  let lastInteractionAt = -Infinity;
  const sent = [];
  const listeners = new Set();
  return {
    sent,
    setCameraCalls: [],
    getSelectedId: () => selectedId,
    select(id) {
      selectedId = id;
      sent.push({ type: 'select', payload: { id } });
      for (const cb of listeners) cb(id);
    },
    deselect() {
      this.select(null);
    },
    onSelectionChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    camera: () => cam,
    setCamera(next) {
      cam = next;
      this.setCameraCalls.push(next);
    },
    getLastInteractionAt: () => lastInteractionAt,
    setLastInteractionAt(t) {
      lastInteractionAt = t;
    },
  };
}

/** Build a fake `snap.selected` record matching snapshot.js's layout exactly. */
function buildRec(overrides = {}) {
  const rec = new Float32Array(gLen + 17 + 8 + 12 + 5);
  for (let i = 0; i < gLen; i++) rec[i] = 0.5;
  for (const [trait, v] of Object.entries(overrides.genome ?? {})) {
    rec[Number(trait)] = v;
  }
  let k = gLen;
  const inputs = overrides.inputs ?? [];
  for (let i = 0; i < 17; i++) rec[k++] = inputs[i] ?? 0;
  const outputs = overrides.outputs ?? [];
  for (let i = 0; i < 8; i++) rec[k++] = outputs[i] ?? 0;
  rec[k++] = overrides.energy ?? 80;
  rec[k++] = overrides.energyMax ?? 100;
  rec[k++] = overrides.age ?? 500;
  rec[k++] = overrides.lifespanTicks ?? 2000;
  rec[k++] = overrides.x ?? 10;
  rec[k++] = overrides.y ?? 10;
  rec[k++] = overrides.heading ?? 0;
  rec[k++] = overrides.species ?? 1;
  rec[k++] = overrides.generation ?? 2;
  rec[k++] = overrides.parent ?? 3;
  rec[k++] = overrides.sick ?? 0;
  rec[k++] = overrides.body ?? 1;
  rec[k++] = overrides.offspring ?? 0;
  rec[k++] = overrides.livingSiblings ?? 0;
  rec[k++] = overrides.speciesCount ?? 5;
  rec[k++] = overrides.speciesBorn ?? 0;
  rec[k] = overrides.speciesAncestor ?? -1;
  return rec;
}

describe('createInspector', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders name, diet, generation, energy and age bars', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    const inspector = createInspector({ el, app, cfg });
    app.select(7);

    const rec = buildRec({
      genome: { [TRAIT.diet]: 0.8 },
      energy: 60,
      energyMax: 100,
      age: 400,
      lifespanTicks: 2000,
      generation: 3,
    });
    inspector.update({ selectedSlot: 0, selected: rec, light: 0.5 });

    expect(el.querySelector('#specName')).toBeTruthy();
    expect(el.querySelector('#specName').disabled).toBe(true);
    expect(el.querySelector('#diet').textContent).toBe('hunter');
    expect(el.querySelector('#gen').textContent).toBe('gen 3');
    expect(el.querySelector('#bEnergy').style.width).toBe('60%');
    expect(el.querySelector('#bAge').style.width).toBe('20%');
  });

  it('renders 17 brain input bars', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    createInspector({ el, app, cfg });
    expect(el.querySelectorAll('#brain .bar')).toHaveLength(17);
  });

  it('derives the goal from outputs', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    const inspector = createInspector({ el, app, cfg });
    app.select(1);

    // eat >= 0.5, herbivore -> grazing.
    inspector.update({
      selectedSlot: 0,
      selected: buildRec({ genome: { [TRAIT.diet]: 0.1 }, outputs: [0, 0, 0.6] }),
    });
    expect(el.querySelector('#goal').textContent).toBe('grazing');

    // eat >= 0.5, carnivore -> feeding.
    inspector.update({
      selectedSlot: 0,
      selected: buildRec({ genome: { [TRAIT.diet]: 0.9 }, outputs: [0, 0, 0.6] }),
    });
    expect(el.querySelector('#goal').textContent).toBe('feeding');

    // throttle > 0.7 and threatProx > 0 -> fleeing.
    inspector.update({
      selectedSlot: 0,
      selected: buildRec({
        outputs: [0, 0.8, 0],
        inputs: Array(17)
          .fill(0)
          .map((_, i) => (i === 5 ? 1 : 0)), // INPUT.threatProx = 5
      }),
    });
    expect(el.querySelector('#goal').textContent).toBe('fleeing');

    // throttle > 0.3 only -> foraging.
    inspector.update({
      selectedSlot: 0,
      selected: buildRec({ outputs: [0, 0.4, 0] }),
    });
    expect(el.querySelector('#goal').textContent).toBe('foraging');

    // nothing firing -> resting.
    inspector.update({
      selectedSlot: 0,
      selected: buildRec({ outputs: [0, 0, 0] }),
    });
    expect(el.querySelector('#goal').textContent).toBe('resting');
  });

  it('Close clears the selection and sends select null', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    createInspector({ el, app, cfg });
    app.select(5);

    el.querySelector('#unsel').dispatchEvent(new Event('click', { bubbles: true }));

    expect(app.getSelectedId()).toBe(null);
    expect(app.sent.at(-1)).toEqual({ type: 'select', payload: { id: null } });
  });

  it('Follow moves the camera to the organism', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    const inspector = createInspector({ el, app, cfg });
    app.select(2);
    inspector.update({ selectedSlot: 0, selected: buildRec({ x: 20, y: 30 }) });

    el.querySelector('#follow').dispatchEvent(new Event('click', { bubbles: true }));

    expect(app.setCameraCalls.at(-1)).toEqual({ x: 80, y: 120, z: 4 });
  });

  it('the sheet opens on phone width and closes with Close', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    createInspector({ el, app, cfg });

    app.select(3);
    expect(el.classList.contains('open')).toBe(true);

    el.querySelector('#unsel').dispatchEvent(new Event('click', { bubbles: true }));
    expect(el.classList.contains('open')).toBe(false);
  });

  it('a dead selection empties the inspector', () => {
    const el = document.createElement('aside');
    const app = fakeApp();
    const inspector = createInspector({ el, app, cfg });
    app.select(9);

    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    inspector.update({ selectedSlot: -1, selected: undefined });
    expect(el.querySelector('#inspEmpty').textContent).toMatch(/died/);
    expect(el.querySelector('#inspEmpty').hidden).toBe(false);
    expect(app.getSelectedId()).toBe(9); // still selected during the death-message window

    now += 3001;
    inspector.update({ selectedSlot: -1, selected: undefined });
    expect(app.getSelectedId()).toBe(null);
    expect(el.querySelector('#inspEmpty').textContent).not.toMatch(/died/);
  });
});
