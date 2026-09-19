/**
 * The chronicle pane (SPEC §4.11, mockup `#chron`): world events in plain
 * language, newest first, capped at 500 rows in the DOM. Filter chips
 * arrive in P3-07 — every entry from `chronicle` events is shown here.
 */
import { tag } from '../format.js';

/** DOM row cap (PLAN.md P2-11). */
const MAX_ROWS = 500;

/** `chronicle.js`'s `KIND` values that get a CSS class on their row. */
const KIND_CLASS = Object.freeze({
  intervention: 'god',
  extinct: 'ext',
  split: 'spl',
});

/**
 * @param {{ el: HTMLElement, cfg: typeof import('../../core/config.js').DEFAULTS }} opts
 * @returns {{ el: HTMLElement, addEntries: (entries: { tick: number, kind: string, text: string }[]) => void }}
 */
export function createChroniclePane({ el, cfg }) {
  /**
   * @param {{ tick: number, kind: string, text: string }[]} entries oldest first, as delivered by the `chronicle` event.
   * @returns {void}
   */
  function addEntries(entries) {
    for (const entry of entries) {
      const row = document.createElement('div');
      const cls = KIND_CLASS[/** @type {keyof typeof KIND_CLASS} */ (entry.kind)];
      if (cls) row.classList.add(cls);

      const time = document.createElement('span');
      time.className = 't';
      time.textContent = tag(entry.tick, cfg);

      const text = document.createElement('span');
      text.textContent = entry.text;

      row.append(time, text);
      el.insertBefore(row, el.firstChild); // newest first.
    }
    while (el.children.length > MAX_ROWS) {
      el.removeChild(/** @type {Node} */ (el.lastChild));
    }
  }

  return { el, addEntries };
}
