/**
 * The chronicle pane (SPEC §4.11, mockup `#chron`): world events in plain
 * language, newest first, capped at 500 rows in the DOM. Filter chips
 * (P3-07) narrow the visible rows by kind; the choice is remembered per
 * session in `localStorage` (UI only — never affects the sim).
 */
import { tag } from '../format.js';
import { KIND } from '../../core/chronicle.js';

/** DOM row cap (PLAN.md P2-11). */
const MAX_ROWS = 500;

/** `chronicle.js`'s `KIND` values that get a CSS class on their row. */
const KIND_CLASS = Object.freeze({
  intervention: 'god',
  extinct: 'ext',
  split: 'spl',
});

/** Filter chip -> the `KIND` set it shows; `null` (for `all`) means every kind. */
const FILTERS = Object.freeze({
  all: null,
  lineages: new Set([KIND.SPLIT, KIND.EXTINCT, KIND.FIRST]),
  hunts: new Set([KIND.HUNT_SUMMARY]),
  world: new Set([KIND.FAMINE, KIND.PLAGUE, KIND.MIGRATION, KIND.WEATHER]),
  hand: new Set([KIND.INTERVENTION]),
});

const STORAGE_KEY = 'flatland.chronicleFilter';

/**
 * @param {{ el: HTMLElement, cfg: typeof import('../../core/config.js').DEFAULTS }} opts
 * @returns {{ el: HTMLElement, rows: HTMLElement, addEntries: (entries: { tick: number, kind: string, text: string }[]) => void }}
 */
export function createChroniclePane({ el, cfg }) {
  el.innerHTML = `
    <div class="chron-filters" role="group" aria-label="Filter chronicle">
      <button class="chip on" data-filter="all">All</button>
      <button class="chip" data-filter="lineages">Lineages</button>
      <button class="chip" data-filter="hunts">Hunts</button>
      <button class="chip" data-filter="world">World</button>
      <button class="chip" data-filter="hand">⚡ Hand</button>
    </div>
    <div class="chron-rows"></div>
  `;
  const rowsEl = /** @type {HTMLElement} */ (el.querySelector('.chron-rows'));
  const filterChips = /** @type {HTMLButtonElement[]} */ (
    Array.from(el.querySelectorAll('[data-filter]'))
  );

  let filter = 'all';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in FILTERS) filter = saved;
  } catch {
    // Private browsing / blocked storage: fall back to the "all" default.
  }

  /** @returns {void} */
  function applyFilter() {
    for (const chip of filterChips) {
      chip.classList.toggle('on', chip.dataset.filter === filter);
    }
    const allowed = /** @type {Set<string> | null} */ (
      FILTERS[/** @type {keyof typeof FILTERS} */ (filter)]
    );
    for (const row of /** @type {HTMLElement[]} */ (Array.from(rowsEl.children))) {
      row.style.display = !allowed || allowed.has(row.dataset.kind ?? '') ? '' : 'none';
    }
  }

  for (const chip of filterChips) {
    chip.addEventListener('click', () => {
      filter = /** @type {string} */ (chip.dataset.filter);
      try {
        localStorage.setItem(STORAGE_KEY, filter);
      } catch {
        // Ignore: the filter just won't persist across sessions.
      }
      applyFilter();
    });
  }

  /**
   * @param {{ tick: number, kind: string, text: string }[]} entries oldest first, as delivered by the `chronicle` event.
   * @returns {void}
   */
  function addEntries(entries) {
    for (const entry of entries) {
      const row = document.createElement('div');
      row.dataset.kind = entry.kind;
      const cls = KIND_CLASS[/** @type {keyof typeof KIND_CLASS} */ (entry.kind)];
      if (cls) row.classList.add(cls);

      const time = document.createElement('span');
      time.className = 't';
      time.textContent = tag(entry.tick, cfg);

      const text = document.createElement('span');
      text.textContent = entry.text;

      row.append(time, text);
      rowsEl.insertBefore(row, rowsEl.firstChild); // newest first.
    }
    while (rowsEl.children.length > MAX_ROWS) {
      rowsEl.removeChild(/** @type {Node} */ (rowsEl.lastChild));
    }
    applyFilter(); // new rows must respect whatever filter is active.
  }

  applyFilter();

  return { el, rows: rowsEl, addEntries };
}
