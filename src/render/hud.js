/**
 * The floating zoom/speed cluster (SPEC §5.4, §10): markup and hit
 * targets from `docs/mockup.html`'s `#hud`. Pure DOM construction — no
 * sim/camera logic here, `app.js` owns the state and wires clicks.
 */

/**
 * Build the `#hud` element (not yet attached to any parent) plus handles
 * to the pieces `app.js` needs to read/update.
 * @param {Document} [doc]
 * @returns {{ el: HTMLElement, zoomLabel: HTMLButtonElement, zoomOutBtn: HTMLButtonElement, zoomInBtn: HTMLButtonElement, speedButtons: HTMLButtonElement[] }}
 */
export function createHud(doc = document) {
  const el = doc.createElement('div');
  el.id = 'hud';
  el.innerHTML = `
    <div class="hgrp" role="group" aria-label="Zoom">
      <span class="lbl">zoom</span>
      <button id="zOut" title="Zoom out (−)">−</button>
      <button id="zoomv" title="Fit world (0)">1.0×</button>
      <button id="zIn" title="Zoom in (+)">+</button>
    </div>
    <div class="hgrp" role="group" aria-label="Speed">
      <span class="lbl">speed</span>
      <button data-sp="0" title="Pause (space)">⏸</button>
      <button data-sp="1" class="on" title="1× (1)">1×</button>
      <button data-sp="4" title="4× (2)">4×</button>
      <button data-sp="16" title="16× (3)">16×</button>
    </div>
  `;
  return {
    el,
    zoomLabel: /** @type {HTMLButtonElement} */ (el.querySelector('#zoomv')),
    zoomOutBtn: /** @type {HTMLButtonElement} */ (el.querySelector('#zOut')),
    zoomInBtn: /** @type {HTMLButtonElement} */ (el.querySelector('#zIn')),
    speedButtons: /** @type {HTMLButtonElement[]} */ (Array.from(el.querySelectorAll('[data-sp]'))),
  };
}

/**
 * Highlight the button matching `speed`, per SPEC §5.5's `.on` state.
 * @param {ReturnType<typeof createHud>} hud
 * @param {number} speed
 * @returns {void}
 */
export function setActiveSpeed(hud, speed) {
  for (const btn of hud.speedButtons) {
    btn.classList.toggle('on', Number(btn.dataset.sp) === speed);
  }
}

/**
 * @param {ReturnType<typeof createHud>} hud
 * @param {number} zoom
 * @returns {void}
 */
export function setZoomLabel(hud, zoom) {
  hud.zoomLabel.textContent = `${zoom.toFixed(1)}×`;
}
