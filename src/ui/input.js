/**
 * The pointer/wheel input contract (SPEC §5.4): one-pointer drag pans,
 * a short tap (<= 4 px total movement, no second pointer) selects, two
 * pointers pinch-zoom, wheel zooms about the cursor. Never touches
 * `src/core`/`src/sim`; this is purely gesture detection plus screen ->
 * world coordinate conversion (`render/camera.js`, already pure).
 *
 * Interpretation: PLAN.md doesn't spell out `attachInput`'s exact handler
 * names/signatures, only the gestures. Chosen here: `onPan(dx, dy)` with
 * already zoom-divided, sign-flipped world-pixel deltas (so a caller can
 * do `camera.x += dx; camera.y += dy` directly, matching "drag to pan");
 * `onTap(worldX, worldY)`; `onZoom(factor, worldX, worldY)` for *both*
 * wheel and pinch (pinch's absolute target zoom is converted to a factor
 * relative to the camera's current zoom), so the caller has one zoom
 * entry point (`app.js`'s `zoomBy(f, anchor)`).
 *
 * `onHover(worldX, worldY, pointerType)` (P2-10, optional): a `pointermove`
 * that isn't part of an active drag/pinch — a plain hover, which only a
 * mouse produces (touch never fires `pointermove` without an active
 * touch), matching SPEC §5.4's "no hover dependence on touch". The tile
 * tooltip filters on `pointerType === 'mouse'` itself rather than this
 * module doing it, so a future pointer type isn't silently dropped here.
 */
import { screenToWorld } from '../render/camera.js';

const TAP_MAX_MOVEMENT = 4;
const WHEEL_ZOOM_RATE = 0.0015;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   getCamera: () => import('../render/camera.js').Camera,
 *   onPan: (dx: number, dy: number) => void,
 *   onTap: (worldX: number, worldY: number) => void,
 *   onZoom: (factor: number, worldX: number, worldY: number) => void,
 *   onHover?: (worldX: number, worldY: number, pointerType: string, localX: number, localY: number) => void,
 *   onLeave?: () => void,
 * }} handlers
 * @returns {() => void} detach every listener this call added
 */
export function attachInput(canvas, handlers) {
  const { getCamera, onPan, onTap, onZoom, onHover, onLeave } = handlers;

  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  /** @type {{ x: number, y: number, moved: boolean } | null} */
  let drag = null;
  /** @type {{ dist: number, zoom: number } | null} */
  let pinch = null;

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ x: number, y: number }}
   */
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = rect.width > 0 ? canvas.width / rect.width : 1;
    const sx = (clientX - rect.left) * dpr;
    const sy = (clientY - rect.top) * dpr;
    return screenToWorld(getCamera(), canvas.width, canvas.height, sx, sy);
  }

  /**
   * @returns {[{ x: number, y: number }, { x: number, y: number }] | null}
   */
  function twoPoints() {
    if (pointers.size !== 2) return null;
    const pts = Array.from(pointers.values());
    return [pts[0], pts[1]];
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);

    const pts = twoPoints();
    if (pts) {
      drag = null;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinch = { dist, zoom: getCamera().z };
    } else if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, moved: false };
      pinch = null;
    }
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) {
      if (onHover) {
        const world = toWorld(e.clientX, e.clientY);
        const rect = canvas.getBoundingClientRect();
        onHover(world.x, world.y, e.pointerType, e.clientX - rect.left, e.clientY - rect.top);
      }
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = twoPoints();
    if (pts && pinch) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const targetZoom = pinch.zoom * (dist / pinch.dist);
      const factor = targetZoom / getCamera().z;
      const anchor = toWorld(midX, midY);
      onZoom(factor, anchor.x, anchor.y);
      return;
    }

    if (drag && pointers.size === 1) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > TAP_MAX_MOVEMENT) drag.moved = true;
      const z = getCamera().z;
      onPan(-dx / z, -dy / z);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (drag && pointers.size === 1 && !drag.moved) {
      const world = toWorld(e.clientX, e.clientY);
      onTap(world.x, world.y);
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
  }

  /** @param {WheelEvent} e */
  function onWheel(e) {
    e.preventDefault();
    const anchor = toWorld(e.clientX, e.clientY);
    onZoom(Math.exp(-e.deltaY * WHEEL_ZOOM_RATE), anchor.x, anchor.y);
  }

  /** @returns {void} */
  function handlePointerLeave() {
    onLeave?.();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return function detach() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', handlePointerLeave);
    canvas.removeEventListener('wheel', onWheel);
  };
}
