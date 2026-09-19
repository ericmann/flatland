/**
 * The Hand of God dock pane (SPEC §5.3, mockup `#god`): six tools, one
 * button each. Rain fires immediately (`app.fireGodTool`); the rest arm
 * the map (`app.setGodTool`) so the next tap sends the intervention —
 * `app.js` owns the armed-tool state and intercepts the tap, this module
 * only renders the buttons and reflects that state back onto them.
 */

/** Tool copy, in mockup order (`docs/mockup.html`'s `#god` buttons). */
const TOOLS = Object.freeze([
  { kind: 'fire', label: 'Fire', hint: 'Burns plants and anything standing in them. Regrows.' },
  { kind: 'meteor', label: 'Meteor', hint: 'A crater of bare rock. Permanent.' },
  { kind: 'plague', label: 'Plague', hint: 'Seeds a disease that spreads by contact.' },
  { kind: 'river', label: 'River', hint: "Paint water. Grazers won't cross it." },
  { kind: 'meadow', label: 'Meadow', hint: 'Paint grassland.' },
  { kind: 'rain', label: 'Rain', hint: 'Global: every plant tile gets a drink.' },
]);

/**
 * @param {{ el: HTMLElement, app: { getGodTool: () => string | null, setGodTool: (tool: string | null) => void, fireGodTool: (kind: string) => void, onGodToolChange: (cb: (tool: string | null) => void) => (() => void) } }} opts
 * @returns {{ el: HTMLElement, setVisible: (v: boolean) => void }}
 */
export function createGodPane({ el, app }) {
  el.innerHTML =
    TOOLS.map(
      (t) =>
        `<button class="tool" data-tool="${t.kind}"><b>${t.label}</b><small>${t.hint}</small></button>`,
    ).join('') +
    '<div class="p" id="godHint">Pick a tool, then tap the map. Every intervention is written into the chronicle.</div>';

  const buttons = /** @type {HTMLButtonElement[]} */ (Array.from(el.querySelectorAll('.tool')));

  /** @returns {void} */
  function sync() {
    const armed = app.getGodTool();
    for (const btn of buttons) btn.classList.toggle('on', btn.dataset.tool === armed);
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const kind = /** @type {string} */ (btn.dataset.tool);
      if (kind === 'rain') {
        app.fireGodTool('rain');
        return;
      }
      app.setGodTool(app.getGodTool() === kind ? null : kind);
    });
  }

  app.onGodToolChange(sync);
  sync();

  return {
    el,
    /**
     * Leaving the pane disarms the tool (SPEC §5.4: "the tool stays
     * armed until toggled off or the tab changes").
     * @param {boolean} v
     * @returns {void}
     */
    setVisible(v) {
      if (!v) app.setGodTool(null);
    },
  };
}
