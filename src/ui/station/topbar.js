/**
 * The station top bar (SPEC §5.1, §5.2): brand, seed, clock/sun-arc,
 * season/light/day, the speed cluster (mirrors the floating one in
 * `render/hud.js`), a population summary, and the Idle button. Markup
 * and ids from `docs/mockup.html`'s `#top`.
 *
 * Interpretation: the mockup's `.pop` row shows only two population
 * classes ("grazers", "hunters"), but the `status` protocol event (P2-06)
 * reports three (`herb`, `omni`, `carn`). Kept the mockup's two-category
 * display — herbivores as grazers, carnivores as hunters — and left
 * omnivores out of this summary, matching SPEC §5.2's visual language
 * (herbivore/carnivore are the two poles the summary contrasts).
 */
import { clock, sunArc } from '../../core/light.js';

const SUN_ARC_CX = 20;
const SUN_ARC_CY = 20;
const SUN_ARC_R = 17;

/**
 * @param {{ el: HTMLElement, app: { setSpeed: (n: number) => void, setMode: (m: 'idle'|'station') => void }, cfg: typeof import('../../core/config.js').DEFAULTS }} opts
 * @returns {{ el: HTMLElement, update: (status: *) => void, setSeed: (seed: number) => void }}
 */
export function createTopBar({ el, app, cfg }) {
  el.innerHTML = `
    <span class="brand">FLATLAND</span>
    <span class="seed">world <span id="seed">#0000</span></span>
    <div class="clock">
      <svg viewBox="0 0 40 22" aria-hidden="true">
        <path d="M3 20 A17 17 0 0 1 37 20" fill="none" stroke="#3a4d40" stroke-width="1.5"/>
        <circle id="sundot" cx="20" cy="3" r="3" fill="#e3a83a"/>
      </svg>
      <span id="clock">Year 1 · Day 1 · 06:00</span>
      <span class="season" id="season">Spring · light 0% · day 0%</span>
    </div>
    <div class="speed" role="group" aria-label="Simulation speed">
      <button data-sp="0">⏸</button><button data-sp="1" class="on">1×</button><button data-sp="4">4×</button><button data-sp="16">16×</button>
    </div>
    <div class="pop">
      <span>plants <b id="pPlants">–</b></span>
      <span>grazers <b id="pHerb">–</b></span>
      <span>hunters <b id="pCarn">–</b></span>
      <span>lineages <b id="pSpec">–</b></span>
    </div>
    <button class="tbtn" id="toIdle">Idle ⤢</button>
  `;

  const seedEl = /** @type {HTMLElement} */ (el.querySelector('#seed'));
  const sundot = /** @type {SVGCircleElement} */ (el.querySelector('#sundot'));
  const clockEl = /** @type {HTMLElement} */ (el.querySelector('#clock'));
  const seasonEl = /** @type {HTMLElement} */ (el.querySelector('#season'));
  const speedButtons = /** @type {HTMLButtonElement[]} */ (
    Array.from(el.querySelectorAll('[data-sp]'))
  );
  const pPlants = /** @type {HTMLElement} */ (el.querySelector('#pPlants'));
  const pHerb = /** @type {HTMLElement} */ (el.querySelector('#pHerb'));
  const pCarn = /** @type {HTMLElement} */ (el.querySelector('#pCarn'));
  const pSpec = /** @type {HTMLElement} */ (el.querySelector('#pSpec'));
  const toIdle = /** @type {HTMLButtonElement} */ (el.querySelector('#toIdle'));

  for (const btn of speedButtons) {
    btn.addEventListener('click', () => app.setSpeed(Number(btn.dataset.sp)));
  }
  toIdle.addEventListener('click', () => app.setMode('idle'));

  /**
   * @param {number} speed
   * @returns {void}
   */
  function setActiveSpeed(speed) {
    for (const btn of speedButtons) {
      btn.classList.toggle('on', Number(btn.dataset.sp) === speed);
    }
  }

  /**
   * @param {number} seed
   * @returns {void}
   */
  function setSeed(seed) {
    seedEl.textContent = `#${seed.toString(16).toUpperCase()}`;
  }

  /**
   * @param {{ tick: number, speed: number, light: number, season: string, dayFraction: number, herb: number, carn: number, plantsFraction: number, speciesLiving: number, speciesTotal: number }} status
   * @returns {void}
   */
  function update(status) {
    clockEl.textContent = clock(status.tick, cfg).text;
    const lightPct = Math.round(status.light * 100);
    const dayPct = Math.round(status.dayFraction * 100);
    seasonEl.textContent = `${status.season} · light ${lightPct}% · day ${dayPct}%`;

    const arc = sunArc(status.tick, cfg);
    sundot.style.display = arc.up ? '' : 'none';
    sundot.setAttribute('cx', String(SUN_ARC_CX - SUN_ARC_R * Math.cos(arc.angle)));
    sundot.setAttribute('cy', String(SUN_ARC_CY - SUN_ARC_R * Math.sin(arc.angle)));

    pPlants.textContent = `${Math.round(status.plantsFraction * 100)}%`;
    pHerb.textContent = String(status.herb);
    pCarn.textContent = String(status.carn);
    pSpec.textContent = `${status.speciesLiving}/${status.speciesTotal}`;

    setActiveSpeed(status.speed);
  }

  return { el, update, setSeed };
}
