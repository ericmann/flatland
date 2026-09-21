/**
 * Canvas layer composition and presentation (SPEC §6.5). Owns the visible
 * `<canvas>`, an offscreen world canvas at `tiles * px`, and the 1px/tile
 * terrain canvas painted from an ImageData. Never imports `src/core` state
 * mutators — it only reads the plain typed arrays it is handed.
 */
import { paintTerrain as paintTerrainImageData } from './terrain-layer.js';
import { drawOrganisms } from './organism-layer.js';
import { drawNight, paintEnergy, paintScent } from './lens-layer.js';

/** Re-paint the terrain ImageData at most this often, in frames (SPEC §6.5). */
const TERRAIN_REPAINT_EVERY = 6;
/** Energy-density lens compositing alpha (SPEC §6.5, PLAN.md P2-09). */
const ENERGY_LENS_ALPHA = 0.7;

/**
 * Nearest living organism to `(wx, wy)` (tile-space, the same units as a
 * snapshot's `orgs.x`/`orgs.y`) within radius `r` tiles, ties broken by
 * lowest id (SPEC §5.4, PLAN.md P2-10). Pure function of the decoded
 * snapshot, so it is node-testable without a canvas.
 * @param {*} snap a decoded snapshot (`decodeSnapshot()`'s return value)
 * @param {number} wx
 * @param {number} wy
 * @param {number} r
 * @returns {number} the organism's id, or -1 if none is within `r`.
 */
export function pick(snap, wx, wy, r) {
  const { n, x, y, id } = snap.orgs;
  const r2 = r * r;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - wx;
    const dy = y[i] - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    if (bestIdx === -1 || d2 < bestDist || (d2 === bestDist && id[i] < id[bestIdx])) {
      bestIdx = i;
      bestDist = d2;
    }
  }
  return bestIdx === -1 ? -1 : id[bestIdx];
}

export class Renderer {
  /**
   * @param {{ width: number, height: number, view: HTMLCanvasElement, px?: number, plantCap?: number[] }} opts
   *   `plantCap` (P6-02, from the `loaded` event's `world.cfg.terrain.plantCap`) turns a tile's raw
   *   plant-stock value (energy units, SPEC §4.4) into the 0..1 fraction `terrain-layer.js` tints by;
   *   defaults to all-1s (a no-op division) so a caller that predates P6-02 — a test, say — keeps
   *   treating snapshot plant values as already-fractions.
   */
  constructor({ width, height, view, px = 4, plantCap = [1, 1, 1, 1, 1, 1] }) {
    this.width = width;
    this.height = height;
    this.px = px;
    this.plantCap = plantCap;
    this.view = view;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (view.getContext('2d'));
    this.dpr = 1;

    this.worldCanvas = document.createElement('canvas');
    this.worldCanvas.width = width * px;
    this.worldCanvas.height = height * px;
    this.worldCtx = /** @type {CanvasRenderingContext2D} */ (this.worldCanvas.getContext('2d'));

    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = width;
    this.terrainCanvas.height = height;
    this.terrainCtx = /** @type {CanvasRenderingContext2D} */ (this.terrainCanvas.getContext('2d'));
    this.terrainImage = this.terrainCtx.createImageData(width, height);

    /**
     * The last terrain grid received (terrain type never changes after
     * generation/intervention); cached so a snapshot without FLAG_TERRAIN
     * can still repaint the plant/carcass tint. Copied (P2-10 finding),
     * not the snapshot's own view: the snapshot's buffer is one of a
     * fixed, recycled pair (`SnapshotPool`) that gets transferred back to
     * the worker and refilled, which detaches every typed-array view
     * still pointing at it — including this one, if it merely aliased the
     * snapshot's `terrain` array instead of owning its data.
     * @type {Uint8Array | null}
     */
    this._cachedTerrain = null;
    this._frame = 0;

    /** Lazily created: the energy-density lens is off by default (P2-09).
     * @type {HTMLCanvasElement | null} */
    this._energyCanvas = null;
    /** @type {CanvasRenderingContext2D | null} */
    this._energyCtx = null;
    /** @type {ImageData | null} */
    this._energyImage = null;

    /** Lazily created: every scent lens is off by default (P3-02).
     * @type {HTMLCanvasElement | null} */
    this._scentCanvas = null;
    /** @type {CanvasRenderingContext2D | null} */
    this._scentCtx = null;
    /** @type {ImageData | null} */
    this._scentImage = null;
  }

  /**
   * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, image: ImageData }}
   */
  _ensureEnergyLayer() {
    let canvas = this._energyCanvas;
    let ctx = this._energyCtx;
    let image = this._energyImage;
    if (!canvas || !ctx || !image) {
      canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      image = ctx.createImageData(this.width, this.height);
      this._energyCanvas = canvas;
      this._energyCtx = ctx;
      this._energyImage = image;
    }
    return { canvas, ctx, image };
  }

  /**
   * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, image: ImageData }}
   */
  _ensureScentLayer() {
    let canvas = this._scentCanvas;
    let ctx = this._scentCtx;
    let image = this._scentImage;
    if (!canvas || !ctx || !image) {
      canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      image = ctx.createImageData(this.width, this.height);
      this._scentCanvas = canvas;
      this._scentCtx = ctx;
      this._scentImage = image;
    }
    return { canvas, ctx, image };
  }

  /**
   * Resize the visible canvas's backing store to its CSS size times device
   * pixel ratio (capped at 2, SPEC §6.5).
   * @returns {void}
   */
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const parent = this.view.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : this.view.getBoundingClientRect();
    this.view.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.view.height = Math.max(1, Math.round(rect.height * this.dpr));
  }

  /**
   * Draw one frame from a decoded snapshot: terrain/plant/carcass
   * (repainted only when dirty or every 6th frame, SPEC §6.5), the scent
   * lenses (if any are on), the energy density lens (if on), organisms,
   * the night lens, then present at the camera transform. Pass order is
   * fixed (PLAN.md P2-09/P3-02): terrain, scent, energy, organisms, night.
   * @param {*} snapshot a `decodeSnapshot()` result
   * @param {import('./camera.js').Camera} cam
   * @param {{ night?: boolean, energy?: boolean, scent?: boolean[], colorMode?: 'self'|'species'|'energy'|'age', speciesStore?: *, highlightSpecies?: number, selectedId?: number }} [lensState]
   * @returns {void}
   */
  draw(snapshot, cam, lensState = {}) {
    const {
      night = false,
      energy = false,
      scent = [false, false, false, false],
      colorMode = 'self',
      speciesStore,
      highlightSpecies,
      selectedId,
    } = lensState;

    if (snapshot.terrain) this._cachedTerrain = snapshot.terrain.slice();

    const dirty = snapshot.terrainDirty || this._frame % TERRAIN_REPAINT_EVERY === 0;
    if (dirty && this._cachedTerrain) {
      paintTerrainImageData(this.terrainImage, {
        terrain: this._cachedTerrain,
        plants: snapshot.plants,
        carcass: snapshot.carcass,
        width: this.width,
        height: this.height,
        plantCap: this.plantCap,
      });
      this.terrainCtx.putImageData(this.terrainImage, 0, 0);
    }

    const worldW = this.width * this.px;
    const worldH = this.height * this.px;
    this.worldCtx.imageSmoothingEnabled = false;
    this.worldCtx.clearRect(0, 0, worldW, worldH);
    this.worldCtx.drawImage(this.terrainCanvas, 0, 0, worldW, worldH);

    if (scent.some(Boolean)) {
      const layer = this._ensureScentLayer();
      paintScent(layer.image, snapshot, { scent });
      layer.ctx.putImageData(layer.image, 0, 0);
      this.worldCtx.drawImage(layer.canvas, 0, 0, worldW, worldH);
    }

    if (energy) {
      const layer = this._ensureEnergyLayer();
      paintEnergy(layer.image, snapshot);
      layer.ctx.putImageData(layer.image, 0, 0);
      this.worldCtx.save();
      this.worldCtx.globalAlpha = ENERGY_LENS_ALPHA;
      this.worldCtx.drawImage(layer.canvas, 0, 0, worldW, worldH);
      this.worldCtx.restore();
    }

    drawOrganisms(this.worldCtx, snapshot, {
      colorMode,
      speciesStore,
      highlightSpecies,
      selectedId,
    });
    if (night) drawNight(this.worldCtx, snapshot.light, worldW, worldH);

    this._frame++;
    this.present(cam);
  }

  /**
   * Draw the offscreen world canvas onto the visible canvas at the
   * camera's transform, DPR-aware, with smoothing off (SPEC §6.5).
   * @param {import('./camera.js').Camera} cam world-pixel centre and zoom
   * @returns {void}
   */
  present(cam) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#050806';
    ctx.fillRect(0, 0, this.view.width, this.view.height);
    const z = cam.z * this.dpr;
    const w = this.width * this.px * z;
    const h = this.height * this.px * z;
    const ox = this.view.width / 2 - cam.x * z;
    const oy = this.view.height / 2 - cam.y * z;
    ctx.drawImage(this.worldCanvas, ox, oy, w, h);
  }
}
