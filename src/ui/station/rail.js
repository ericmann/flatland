/**
 * The lens rail (SPEC §5.2): Night and Energy density chips, the
 * "Color by" radio, and the terrain legend. Chips are a thin view over
 * `app`'s lens state (`app.js`, P2-09): clicking one calls into `app`,
 * and every chip re-renders whenever `app` reports a change (including
 * from the `L`/`E` keyboard shortcuts). Markup/ids from the mockup's
 * `#rail`; the scent chips it also shows arrive in P3-02, not here.
 */

/**
 * @param {{ el: HTMLElement, app: {
 *   getLensState: () => { night: boolean, energy: boolean, colorMode: 'self'|'species'|'energy'|'age' },
 *   toggleLens: (key: 'night'|'energy') => void,
 *   setColorMode: (mode: 'self'|'species'|'energy'|'age') => void,
 *   onLensChange: (cb: (state: *) => void) => (() => void),
 * } }} opts
 * @returns {{ el: HTMLElement, detach: () => void }}
 */
export function createRail({ el, app }) {
  el.innerHTML = `
    <div class="sec">
      <h3>Lenses</h3>
      <div class="chips" id="lensToggles">
        <button class="chip" data-lens="night"><i class="sw" style="background:#0a1630"></i>Night <span class="k">L</span></button>
        <button class="chip" data-lens="energy"><i class="sw" style="background:linear-gradient(90deg,#3a2a2a,#e3a83a)"></i>Energy density <span class="k">E</span></button>
      </div>
    </div>
    <div class="sec">
      <h3>Color by</h3>
      <div class="chips" id="colorModes">
        <button class="chip" data-mode="self"><i class="sw" style="background:linear-gradient(90deg,#e06c4a,#7fbb6a,#48c2d8)"></i>Individual</button>
        <button class="chip" data-mode="species"><i class="sw" style="background:#c7b26a"></i>Lineage</button>
        <button class="chip" data-mode="energy"><i class="sw" style="background:linear-gradient(90deg,#3a2a2a,#e3a83a)"></i>Energy</button>
        <button class="chip" data-mode="age"><i class="sw" style="background:linear-gradient(90deg,#fff,#5f6a60)"></i>Age</button>
      </div>
    </div>
    <div class="sec">
      <h3>Terrain</h3>
      <div class="legend">
        <div><i style="background:#22405a"></i>water</div>
        <div><i style="background:#b7a778"></i>sand</div>
        <div><i style="background:#4a3d2c"></i>mud</div>
        <div><i style="background:#4f8a3a"></i>grass</div>
        <div><i style="background:#6b7a3a"></i>scrub · hides</div>
        <div><i style="background:#6a6a66"></i>rock</div>
        <div><i style="background:#e8e2cc"></i>carcass</div>
      </div>
    </div>
  `;

  const lensChips = /** @type {HTMLButtonElement[]} */ (
    Array.from(el.querySelectorAll('[data-lens]'))
  );
  const modeChips = /** @type {HTMLButtonElement[]} */ (
    Array.from(el.querySelectorAll('[data-mode]'))
  );

  for (const chip of lensChips) {
    chip.addEventListener('click', () =>
      app.toggleLens(/** @type {'night'|'energy'} */ (chip.dataset.lens)),
    );
  }
  for (const chip of modeChips) {
    chip.addEventListener('click', () =>
      app.setColorMode(/** @type {'self'|'species'|'energy'|'age'} */ (chip.dataset.mode)),
    );
  }

  /**
   * @param {{ night: boolean, energy: boolean, colorMode: string }} state
   * @returns {void}
   */
  function render(state) {
    for (const chip of lensChips) {
      chip.classList.toggle('on', !!state[/** @type {'night'|'energy'} */ (chip.dataset.lens)]);
    }
    for (const chip of modeChips) {
      chip.classList.toggle('on', chip.dataset.mode === state.colorMode);
    }
  }

  render(app.getLensState());
  const unsubscribe = app.onLensChange(render);

  return { el, detach: unsubscribe };
}
