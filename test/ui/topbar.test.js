// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createTopBar } from '../../src/ui/station/topbar.js';
import { makeConfig } from '../../src/core/config.js';
import { season, dayFraction } from '../../src/core/light.js';

/** A fake app: records setSpeed/setMode calls, and replies to requestRecord with a fixed record. */
function fakeApp() {
  return {
    speedCalls: [],
    modeCalls: [],
    setSpeed(n) {
      this.speedCalls.push(n);
    },
    setMode(m) {
      this.modeCalls.push(m);
    },
    requestRecord(cb) {
      cb({
        record: JSON.stringify({ seed: 7, configDiff: {}, interventions: [] }),
        tick: 1234,
      });
    },
  };
}

/** A fake platform adapter: records share() calls, resolves with `result`. */
function fakePlatform(result = 'copied') {
  return {
    calls: [],
    share(opts) {
      this.calls.push(opts);
      return Promise.resolve(result);
    },
  };
}

/** A fake db: records del() calls, resolves immediately. */
function fakeDb() {
  return {
    delCalls: [],
    del(key) {
      this.delCalls.push(key);
      return Promise.resolve();
    },
  };
}

function setup(platform = fakePlatform(), db = fakeDb()) {
  const el = document.createElement('header');
  const app = fakeApp();
  const cfg = makeConfig({});
  const win = {
    location: { origin: 'https://flatland.test', pathname: '/' },
    setTimeout: (...a) => globalThis.setTimeout(...a),
    clearTimeout: (...a) => globalThis.clearTimeout(...a),
  };
  const topbar = createTopBar({ el, app, cfg, db, platform, win });
  return { el, app, cfg, db, win, platform, topbar };
}

function statusAt(tick, cfg, overrides = {}) {
  return {
    tick,
    speed: 1,
    light: 0.5,
    season: season(tick, cfg),
    dayFraction: dayFraction(tick, cfg),
    herb: 10,
    omni: 3,
    carn: 4,
    plantsFraction: 0.6,
    speciesLiving: 2,
    speciesTotal: 5,
    ...overrides,
  };
}

describe('createTopBar', () => {
  it('renders the clock, season and light % from a status event', () => {
    const { el, cfg, topbar } = setup();
    topbar.update(statusAt(0, cfg, { light: 0.42 }));

    expect(el.querySelector('#clock').textContent).toMatch(/Year 1 · Day 1 · \d{2}:\d{2}/);
    expect(el.querySelector('#season').textContent).toMatch(/light 42%/);
  });

  it('speed buttons reflect app speed', () => {
    const { el, cfg, topbar } = setup();
    topbar.update(statusAt(0, cfg, { speed: 4 }));

    const on = el.querySelector('[data-sp="4"]');
    expect(on.classList.contains('on')).toBe(true);
    expect(el.querySelector('[data-sp="1"]').classList.contains('on')).toBe(false);
  });

  it('Idle button returns to idle', () => {
    const { el, app } = setup();
    el.querySelector('#toIdle').dispatchEvent(new Event('click', { bubbles: true }));
    expect(app.modeCalls).toEqual(['idle']);
  });

  it('population summary shows plants %, grazers, hunters and lineages', () => {
    const { el, cfg, topbar } = setup();
    topbar.update(
      statusAt(0, cfg, {
        herb: 12,
        carn: 7,
        plantsFraction: 0.35,
        speciesLiving: 3,
        speciesTotal: 9,
      }),
    );

    expect(el.querySelector('#pPlants').textContent).toBe('35%');
    expect(el.querySelector('#pHerb').textContent).toBe('12');
    expect(el.querySelector('#pCarn').textContent).toBe('7');
    expect(el.querySelector('#pSpec').textContent).toBe('3/9');
  });

  it('speed cluster buttons send setSpeed', () => {
    const { el, app } = setup();
    el.querySelector('[data-sp="16"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(app.speedCalls).toEqual([16]);
  });

  it('setSeed renders the seed as hex', () => {
    const { el, topbar } = setup();
    topbar.setSeed(255);
    expect(el.querySelector('#seed').textContent).toBe('#FF');
  });

  it('Share builds a ?w= URL and calls the platform adapter', async () => {
    const platform = fakePlatform('copied');
    const { el } = setup(platform);

    el.querySelector('#shareBtn').dispatchEvent(new Event('click', { bubbles: true }));
    await Promise.resolve(); // requestRecord's callback runs synchronously; platform.share resolves on the next microtask.
    await Promise.resolve();

    expect(platform.calls).toHaveLength(1);
    expect(platform.calls[0].url).toMatch(/^https:\/\/flatland\.test\/\?w=[^&]+$/);
    expect(platform.calls[0].title).toBeTruthy();
  });

  it('New world deletes the auto-save and reloads with the query string stripped', async () => {
    const { el, db, win } = setup();

    el.querySelector('#newWorldBtn').dispatchEvent(new Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(db.delCalls).toEqual(['world']);
    expect(win.location.href).toBe('/');
  });

  it('Share shows a toast reflecting the platform adapter result', async () => {
    const platform = fakePlatform('shared');
    const { el } = setup(platform);

    el.querySelector('#shareBtn').dispatchEvent(new Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const toast = el.querySelector('#toast');
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('Shared');
  });
});
