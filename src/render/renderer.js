/**
 * Canvas layer composition and presentation (SPEC §6.5). Owns the visible
 * `<canvas>`, an offscreen world canvas at `tiles * px`, and the 1px/tile
 * terrain canvas painted from an ImageData. Never imports `src/core` state
 * mutators — it only reads the plain typed arrays it is handed.
 */
import { paintTerrain as paintTerrainImageData } from './terrain-layer.js';
import { drawOrganisms } from './organism-layer.js';
import { drawNight } from './lens-layer.js';

/** Re-paint the terrain ImageData at most this often, in frames (SPEC §6.5). */
const TERRAIN_REPAINT_EVERY = 6;

export class Renderer {
  /**
   * @param {{ width: number, height: number, view: HTMLCanvasElement, px?: number }} opts
   */
  constructor({ width, height, view, px = 4 }) {
    this.width = width;
    this.height = height;
    this.px = px;
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

    /** The last terrain grid received (terrain type never changes after generation/intervention); cached so a snapshot without FLAG_TERRAIN can still repaint the plant/carcass tint. */
    this._cachedTerrain = null;
    this._frame = 0;
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
   * Draw one frame from a decoded snapshot: the terrain/plant/carcass
   * layer (repainted only when dirty or every 6th frame, SPEC §6.5),
   * organisms, the night lens, then present at the camera transform.
   * @param {*} snapshot a `decodeSnapshot()` result
   * @param {import('./camera.js').Camera} cam
   * @param {{ night?: boolean }} [opts]
   * @returns {void}
   */
  draw(snapshot, cam, { night = false } = {}) {
    if (snapshot.terrain) this._cachedTerrain = snapshot.terrain;

    const dirty = snapshot.terrainDirty || this._frame % TERRAIN_REPAINT_EVERY === 0;
    if (dirty && this._cachedTerrain) {
      paintTerrainImageData(this.terrainImage, {
        terrain: this._cachedTerrain,
        plants: snapshot.plants,
        carcass: snapshot.carcass,
        width: this.width,
        height: this.height,
      });
      this.terrainCtx.putImageData(this.terrainImage, 0, 0);
    }

    const worldW = this.width * this.px;
    const worldH = this.height * this.px;
    this.worldCtx.imageSmoothingEnabled = false;
    this.worldCtx.clearRect(0, 0, worldW, worldH);
    this.worldCtx.drawImage(this.terrainCanvas, 0, 0, worldW, worldH);

    drawOrganisms(this.worldCtx, snapshot, 'self');
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
