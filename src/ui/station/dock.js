/**
 * The dock (SPEC §4.11, §5.2, mockup `#dock`): tabs over Chronicle,
 * Phylogeny, Charts and Hand of God, exactly one pane visible at a time.
 * This module only builds the tab/pane shell; `#charts` and `#god` start
 * empty for their own modules (`charts.js`, P3-08; Hand of God, P4-xx) to
 * fill in. "Design notes" is mockup-only and is not built here.
 */

/**
 * @param {{ el: HTMLElement }} opts
 * @returns {{ el: HTMLElement, panes: { chron: HTMLElement, phylo: HTMLElement, charts: HTMLElement, god: HTMLElement }, activate: (name: string) => void, onPaneChange: (cb: (name: string) => void) => (() => void) }}
 */
export function createDock({ el }) {
  el.innerHTML = `
    <div class="tabs">
      <button class="on" data-pane="chron">Chronicle</button>
      <button data-pane="phylo">Phylogeny</button>
      <button data-pane="charts">Charts</button>
      <button data-pane="god">Hand of God</button>
      <span class="sp"></span>
    </div>
    <div class="pane on" id="chron"></div>
    <div class="pane" id="phylo"><svg id="phyloSvg" viewBox="0 0 800 140" preserveAspectRatio="none"></svg></div>
    <div class="pane" id="charts"></div>
    <div class="pane" id="god">Hand of God arrives in Phase 4</div>
  `;

  const tabs = /** @type {HTMLButtonElement[]} */ (Array.from(el.querySelectorAll('[data-pane]')));
  const panes = {
    chron: /** @type {HTMLElement} */ (el.querySelector('#chron')),
    phylo: /** @type {HTMLElement} */ (el.querySelector('#phylo')),
    charts: /** @type {HTMLElement} */ (el.querySelector('#charts')),
    god: /** @type {HTMLElement} */ (el.querySelector('#god')),
  };

  /** @type {Set<(name: string) => void>} */
  const listeners = new Set();

  /**
   * @param {string} name
   * @returns {void}
   */
  function activate(name) {
    for (const tab of tabs) tab.classList.toggle('on', tab.dataset.pane === name);
    for (const [key, pane] of Object.entries(panes)) pane.classList.toggle('on', key === name);
    for (const cb of listeners) cb(name);
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(/** @type {string} */ (tab.dataset.pane)));
  }

  return {
    el,
    panes,
    activate,
    /**
     * @param {(name: string) => void} cb
     * @returns {() => void} unsubscribe
     */
    onPaneChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
