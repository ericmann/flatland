/**
 * Pure camera math for the world canvas (SPEC §6.5). No DOM: every function
 * takes and returns a plain `{ x, y, z }` (world-pixel centre, zoom),
 * viewport size and world size, so it is directly unit-testable in node.
 * `renderer.js` is the only caller that touches an actual canvas.
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

/**
 * @typedef {{ x: number, y: number, z: number }} Camera
 */

/**
 * Snap a zoom level to quarter-pixel multiples and clamp to [1, 8]
 * (SPEC §6.5).
 * @param {number} z
 * @returns {number}
 */
export function snapZoom(z) {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  return Math.round(clamped * 4) / 4;
}

/**
 * Keep the camera inside the world: when the world is smaller than the
 * view on an axis, centre it on that axis; otherwise clamp the centre so
 * the view never shows past the world edge. Also clamps z to [1, 8].
 * @param {Camera} cam
 * @param {number} viewW world-pixel-space view width (screen px / dpr, pre-zoom)... actually device px
 * @param {number} viewH
 * @param {number} worldW total world width in world pixels (tiles * px)
 * @param {number} worldH total world height in world pixels
 * @returns {Camera}
 */
export function clamp(cam, viewW, viewH, worldW, worldH) {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.z));
  const vw = viewW / z;
  const vh = viewH / z;
  const x = vw >= worldW ? worldW / 2 : Math.max(vw / 2, Math.min(worldW - vw / 2, cam.x));
  const y = vh >= worldH ? worldH / 2 : Math.max(vh / 2, Math.min(worldH - vh / 2, cam.y));
  return { x, y, z };
}

/**
 * Zoom by `factor`, keeping the world point (ax, ay) fixed on screen.
 * @param {Camera} cam
 * @param {number} factor multiplier applied to the current zoom
 * @param {number} ax world-pixel x of the anchor point
 * @param {number} ay world-pixel y of the anchor point
 * @returns {Camera}
 */
export function zoomAt(cam, factor, ax, ay) {
  const z0 = cam.z;
  const z1 = snapZoom(z0 * factor);
  const x = ax - ((ax - cam.x) * z0) / z1;
  const y = ay - ((ay - cam.y) * z0) / z1;
  return { x, y, z: z1 };
}

/**
 * The camera that shows the whole world centred, at the largest zoom that
 * does not crop either axis, floored at 1 (SPEC §6.5).
 * @param {Camera} cam only used to satisfy the (cam, ...) call shape; z/x/y are recomputed
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} worldW
 * @param {number} worldH
 * @returns {Camera}
 */
export function fit(cam, viewW, viewH, worldW, worldH) {
  const z = Math.max(MIN_ZOOM, Math.min(viewW / worldW, viewH / worldH));
  return { x: worldW / 2, y: worldH / 2, z };
}

/**
 * Convert a screen point (device pixels, origin top-left of the view) to
 * world pixels.
 * @param {Camera} cam
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} sx
 * @param {number} sy
 * @returns {{ x: number, y: number }}
 */
export function screenToWorld(cam, viewW, viewH, sx, sy) {
  return {
    x: (sx - viewW / 2) / cam.z + cam.x,
    y: (sy - viewH / 2) / cam.z + cam.y,
  };
}

/**
 * Convert a world-pixel point to a screen point (device pixels, origin
 * top-left of the view). Inverse of `screenToWorld`.
 * @param {Camera} cam
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} wx
 * @param {number} wy
 * @returns {{ x: number, y: number }}
 */
export function worldToScreen(cam, viewW, viewH, wx, wy) {
  return {
    x: (wx - cam.x) * cam.z + viewW / 2,
    y: (wy - cam.y) * cam.z + viewH / 2,
  };
}
