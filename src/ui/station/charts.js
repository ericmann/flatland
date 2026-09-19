/**
 * The Charts dock pane (SPEC §5.2, §6.5, P3-08): population-by-lineage
 * and Shannon-diversity-with-light, fed by `stats` protocol events, kept
 * as the last `HISTORY_LENGTH` samples. Redrawn only when the pane is
 * visible and the data actually changed (a new `tick`). `paintPopulation`
 * and `paintDiversity` are pure drawing functions — node-testable with a
 * plain recording fake 2D context — matching the mockup's `chart()`/
 * `renderCharts()` formulas exactly; `createCharts` is the thin stateful
 * wrapper that sizes real canvases (DPR-aware) and calls them.
 */
const HISTORY_LENGTH = 240;
const GRID_LINES = 4;
const GRID_COLOR = '#2b3a30';
const LABEL_COLOR = '#8e9788';
const LABEL_FONT = '10px IBM Plex Mono';
const LIGHT_FILL = 'rgba(227,168,58,.14)';
const DIVERSITY_STROKE = '#7fbb6a';

/** The six trophic-flow ledger keys, stack order bottom-to-top (P4-07, SPEC §5.2). */
const FLOW_KEYS = ['photosynthesis', 'grazing', 'predation', 'scavenging', 'decay', 'metabolism'];
/** @type {Record<string, string>} one distinct colour per flow, for both the stack and the legend. */
const FLOW_COLORS = {
  photosynthesis: '#e3a83a',
  grazing: '#8fd97d',
  predation: '#d8573f',
  scavenging: '#b98b4e',
  decay: '#6b7a5e',
  metabolism: '#5a86a8',
};
/** @type {Record<string, string>} legend label per flow key. */
const FLOW_LABELS = {
  photosynthesis: 'Photosynthesis',
  grazing: 'Grazing',
  predation: 'Predation',
  scavenging: 'Scavenging',
  decay: 'Decay',
  metabolism: 'Metabolism',
};
const LEGEND_SLOT_WIDTH = 76;
const LEGEND_SWATCH = 6;

/**
 * @param {CanvasRenderingContext2D | *} ctx
 * @param {number} w
 * @param {number} h
 * @returns {void}
 */
function drawGrid(ctx, w, h) {
  ctx.strokeStyle = GRID_COLOR;
  for (let i = 0; i < GRID_LINES; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (h * i) / GRID_LINES);
    ctx.lineTo(w, (h * i) / GRID_LINES);
    ctx.stroke();
  }
}

/**
 * One polyline per species ever seen in `history`, y-scaled to the
 * window's max count, coloured by species hue, thinner once extinct
 * (count 0 in the latest sample carrying it).
 * @param {CanvasRenderingContext2D | *} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ species: [number, number][] }[]} history oldest first
 * @param {{ hue: (id: number) => number | undefined }} [speciesStore]
 * @returns {void}
 */
export function paintPopulation(ctx, w, h, history, speciesStore) {
  drawGrid(ctx, w, h);
  if (history.length === 0) return;

  let max = 10;
  for (const pt of history) {
    for (const [, count] of pt.species) if (count > max) max = count;
  }

  /** @type {Map<number, number>} last-seen count per species, in first-seen order. */
  const ids = new Map();
  for (const pt of history) {
    for (const [id, count] of pt.species) ids.set(id, count);
  }

  const denom = history.length - 1 || 1;
  for (const id of ids.keys()) {
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const entry = history[i].species.find((s) => s[0] === id);
      const v = entry ? entry[1] : 0;
      const x = (i / denom) * w;
      const y = h - (v / max) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const hue = speciesStore?.hue(id) ?? 0;
    ctx.strokeStyle = `hsl(${hue} 55% 62%)`;
    ctx.lineWidth = ids.get(id) === 0 ? 1 : 1.6;
    ctx.stroke();
  }

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = LABEL_FONT;
  ctx.fillText(String(max), 3, 10);
}

/**
 * A `light` area fill under a Shannon-`diversity` line, labelled `H = x.xx`.
 * @param {CanvasRenderingContext2D | *} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ light: number, diversity: number }[]} history oldest first
 * @returns {void}
 */
export function paintDiversity(ctx, w, h, history) {
  drawGrid(ctx, w, h);
  if (history.length === 0) return;

  const denom = history.length - 1 || 1;

  ctx.beginPath();
  for (let i = 0; i < history.length; i++) {
    const x = (i / denom) * w;
    const y = h - history[i].light * h * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = LIGHT_FILL;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < history.length; i++) {
    const x = (i / denom) * w;
    const y = h - Math.min(1, history[i].diversity / 2) * h * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = DIVERSITY_STROKE;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  const last = history[history.length - 1];
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = LABEL_FONT;
  ctx.fillText(`H = ${last.diversity.toFixed(2)}`, 3, 10);
}

/**
 * A stacked area of the six `world.ledger.flows` deltas per sample
 * (bottom-to-top in `FLOW_KEYS` order), with a coloured-swatch legend row
 * across the top.
 * @param {CanvasRenderingContext2D | *} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ flows: Record<string, number> }[]} history oldest first
 * @returns {void}
 */
export function paintFlows(ctx, w, h, history) {
  drawGrid(ctx, w, h);
  if (history.length === 0) return;

  /**
   * @param {{ flows?: Record<string, number> }} pt
   * @param {string} key
   * @returns {number}
   */
  function flowAt(pt, key) {
    return Math.max(0, pt.flows?.[key] ?? 0);
  }

  let max = 1e-6;
  for (const pt of history) {
    let sum = 0;
    for (const key of FLOW_KEYS) sum += flowAt(pt, key);
    if (sum > max) max = sum;
  }

  const denom = history.length - 1 || 1;
  const stackTop = new Float64Array(history.length);
  for (const key of FLOW_KEYS) {
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const top = stackTop[i] + flowAt(history[i], key);
      const x = (i / denom) * w;
      const y = h - (top / max) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = history.length - 1; i >= 0; i--) {
      const x = (i / denom) * w;
      const y = h - (stackTop[i] / max) * h;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = FLOW_COLORS[key];
    ctx.fill();

    for (let i = 0; i < history.length; i++) {
      stackTop[i] += flowAt(history[i], key);
    }
  }

  ctx.font = LABEL_FONT;
  let lx = 3;
  for (const key of FLOW_KEYS) {
    ctx.fillStyle = FLOW_COLORS[key];
    ctx.fillRect(lx, 2, LEGEND_SWATCH, LEGEND_SWATCH);
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(FLOW_LABELS[key], lx + LEGEND_SWATCH + 3, 9);
    lx += LEGEND_SLOT_WIDTH;
  }
}

/**
 * @param {{ el: HTMLElement, speciesStore?: { hue: (id: number) => number | undefined } }} opts
 * @returns {{ el: HTMLElement, setVisible: (v: boolean) => void, update: (stat: { tick: number, light: number, diversity: number, species: [number, number][], flows: Record<string, number> }) => void }}
 */
export function createCharts({ el, speciesStore }) {
  el.innerHTML = `
    <div class="c"><h4>Population by lineage</h4><canvas id="chPop"></canvas></div>
    <div class="c"><h4>Diversity (Shannon) · Light</h4><canvas id="chDiv"></canvas></div>
    <div class="c"><h4>Trophic energy flow</h4><canvas id="chFlow"></canvas></div>
  `;
  const popCanvas = /** @type {HTMLCanvasElement} */ (el.querySelector('#chPop'));
  const divCanvas = /** @type {HTMLCanvasElement} */ (el.querySelector('#chDiv'));
  const flowCanvas = /** @type {HTMLCanvasElement} */ (el.querySelector('#chFlow'));

  /** @type {{ light: number, diversity: number, species: [number, number][], flows: Record<string, number> }[]} */
  const history = [];
  let visible = false;
  let lastTick = -1;

  /**
   * @param {HTMLCanvasElement} canvas
   * @returns {{ ctx: CanvasRenderingContext2D, w: number, h: number } | null}
   */
  function sizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null; // jsdom without the optional `canvas` package
    ctx.scale(dpr, dpr);
    return { ctx, w: rect.width, h: rect.height };
  }

  /** @returns {void} */
  function redraw() {
    const pop = sizeCanvas(popCanvas);
    if (pop) paintPopulation(pop.ctx, pop.w, pop.h, history, speciesStore);
    const div = sizeCanvas(divCanvas);
    if (div) paintDiversity(div.ctx, div.w, div.h, history);
    const flow = sizeCanvas(flowCanvas);
    if (flow) paintFlows(flow.ctx, flow.w, flow.h, history);
  }

  /**
   * @param {boolean} v
   * @returns {void}
   */
  function setVisible(v) {
    const becameVisible = v && !visible;
    visible = v;
    if (becameVisible && history.length > 0) redraw();
  }

  /**
   * @param {{ tick: number, light: number, diversity: number, species: [number, number][], flows: Record<string, number> }} stat
   * @returns {void}
   */
  function update(stat) {
    if (stat.tick === lastTick) return; // unchanged since the last call.
    lastTick = stat.tick;
    history.push({
      light: stat.light,
      diversity: stat.diversity,
      species: stat.species,
      flows: stat.flows,
    });
    if (history.length > HISTORY_LENGTH) history.shift();
    if (!visible) return;
    redraw();
  }

  return { el, setVisible, update };
}
