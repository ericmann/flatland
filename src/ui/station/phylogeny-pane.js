/**
 * The live phylogeny time-tree (SPEC §4.11, §5.2, mockup `renderPhylo`):
 * one horizontal row per species, a line from birth to death (or now),
 * width by population, a dashed link from the ancestor's row, labelled
 * `name · count` (or `name †` once extinct). Hover (mouse) or tap
 * (touch) a branch to ring its living members on the map via `app`'s
 * `highlightSpecies`. Redrawn at most every 10 `update()` calls, and
 * only while the pane is visible (dock.js calls `setVisible`), per this
 * task's design constraint.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Redraw throttle, in `update()` calls (PLAN.md P2-11). */
const REDRAW_EVERY = 10;
const VIEW_W = 800;
const VIEW_H = 140;

/**
 * @param {{ el: HTMLElement, app: {
 *   getHighlightSpecies: () => number | null,
 *   setHighlightSpecies: (id: number | null) => void,
 * }, speciesStore?: { name: (id: number) => string | undefined } }} opts
 * @returns {{ el: HTMLElement, setVisible: (v: boolean) => void, update: (snap: *) => void, render: (snap: *) => void }}
 */
export function createPhylogenyPane({ el, app, speciesStore }) {
  let svg = /** @type {SVGSVGElement | null} */ (el.querySelector('svg'));
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    el.appendChild(svg);
  }
  const svgEl = svg;

  let visible = false;
  let frame = 0;

  /**
   * @param {boolean} v
   * @returns {void}
   */
  function setVisible(v) {
    visible = v;
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  function toggleHighlight(id) {
    app.setHighlightSpecies(app.getHighlightSpecies() === id ? null : id);
  }

  /**
   * @param {*} snap a decoded snapshot with a `species` section (FLAG_SPECIES, P2-06)
   * @returns {void}
   */
  function render(snap) {
    svgEl.replaceChildren();
    const species = snap.species;
    if (!species || species.n === 0) return;

    const maxTick = Math.max(snap.tick, 1);
    const rowH = VIEW_H / species.n;
    const xScale = VIEW_W / maxTick;
    const highlight = app.getHighlightSpecies();

    for (let i = 0; i < species.n; i++) {
      const y = (i + 0.5) * rowH;
      const born = species.born[i];
      const died = species.died[i] === -1 ? snap.tick : species.died[i];
      const x1 = born * xScale;
      const x2 = died * xScale;

      const ancestor = species.ancestor[i];
      if (ancestor !== -1 && ancestor < species.n) {
        const ay = (ancestor + 0.5) * rowH;
        const link = document.createElementNS(SVG_NS, 'line');
        link.setAttribute('class', 'link');
        link.setAttribute('x1', String(x1));
        link.setAttribute('y1', String(ay));
        link.setAttribute('x2', String(x1));
        link.setAttribute('y2', String(y));
        link.setAttribute('stroke-dasharray', '2,2');
        svgEl.appendChild(link);
      }

      const branch = document.createElementNS(SVG_NS, 'line');
      branch.setAttribute('class', i === highlight ? 'branch hi' : 'branch');
      branch.dataset.speciesId = String(i);
      branch.setAttribute('x1', String(x1));
      branch.setAttribute('y1', String(y));
      branch.setAttribute('x2', String(x2));
      branch.setAttribute('y2', String(y));
      branch.setAttribute('stroke-width', String(Math.max(1, Math.sqrt(species.count[i]))));
      branch.addEventListener('click', () => toggleHighlight(i));
      branch.addEventListener('pointerenter', (e) => {
        if (/** @type {PointerEvent} */ (e).pointerType === 'mouse') app.setHighlightSpecies(i);
      });
      branch.addEventListener('pointerleave', (e) => {
        if (
          /** @type {PointerEvent} */ (e).pointerType === 'mouse' &&
          app.getHighlightSpecies() === i
        ) {
          app.setHighlightSpecies(null);
        }
      });
      svgEl.appendChild(branch);

      const name = speciesStore?.name?.(i) ?? `lineage ${i}`;
      const label = document.createElementNS(SVG_NS, 'text');
      label.textContent = species.died[i] === -1 ? `${name} · ${species.count[i]}` : `${name} †`;
      label.setAttribute('x', String(x2 + 4));
      label.setAttribute('y', String(y));
      svgEl.appendChild(label);
    }
  }

  /**
   * @param {*} snap
   * @returns {void}
   */
  function update(snap) {
    if (!visible) return;
    if (frame % REDRAW_EVERY === 0) render(snap);
    frame++;
  }

  return { el, setVisible, update, render };
}
