// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createTopBar } from '../../src/ui/station/topbar.js';
import { makeConfig } from '../../src/core/config.js';
import { season, dayFraction } from '../../src/core/light.js';

/** A fake app: records setSpeed/setMode calls. */
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
  };
}

function setup() {
  const el = document.createElement('header');
  const app = fakeApp();
  const cfg = makeConfig({});
  const topbar = createTopBar({ el, app, cfg });
  return { el, app, cfg, topbar };
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
});
