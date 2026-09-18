import { describe, it, expect } from 'vitest';
import { clamp, zoomAt, fit, screenToWorld, worldToScreen } from '../../src/render/camera.js';

describe('clamp', () => {
  it('keeps the view inside the world when the world is larger than the view', () => {
    const cam = { x: 0, y: 0, z: 2 };
    const worldW = 1000;
    const worldH = 800;
    const viewW = 400;
    const viewH = 300;
    const c = clamp(cam, viewW, viewH, worldW, worldH);
    const halfVw = viewW / c.z / 2;
    const halfVh = viewH / c.z / 2;
    expect(c.x).toBeGreaterThanOrEqual(halfVw - 1e-9);
    expect(c.x).toBeLessThanOrEqual(worldW - halfVw + 1e-9);
    expect(c.y).toBeGreaterThanOrEqual(halfVh - 1e-9);
    expect(c.y).toBeLessThanOrEqual(worldH - halfVh + 1e-9);
  });

  it('centres the camera when the world is smaller than the view', () => {
    const cam = { x: 999, y: -999, z: 1 };
    const c = clamp(cam, 2000, 2000, 100, 80);
    expect(c.x).toBeCloseTo(50, 6);
    expect(c.y).toBeCloseTo(40, 6);
  });

  it('clamps z into [1, 8]', () => {
    expect(clamp({ x: 0, y: 0, z: 20 }, 100, 100, 200, 200).z).toBe(8);
    expect(clamp({ x: 0, y: 0, z: 0.1 }, 100, 100, 200, 200).z).toBe(1);
  });
});

describe('zoomAt', () => {
  it('keeps the anchor world point fixed on screen', () => {
    const cam = { x: 100, y: 80, z: 2 };
    const viewW = 400;
    const viewH = 300;
    const anchor = { x: 120, y: 90 };
    const before = worldToScreen(cam, viewW, viewH, anchor.x, anchor.y);
    const zoomed = zoomAt(cam, 2, anchor.x, anchor.y);
    const after = worldToScreen(zoomed, viewW, viewH, anchor.x, anchor.y);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.z).toBeGreaterThan(cam.z);
  });

  it('snaps z to quarter-pixel multiples and clamps to [1, 8]', () => {
    const cam = { x: 0, y: 0, z: 1 };
    const zoomed = zoomAt(cam, 100, 0, 0); // way over the top -> clamps to 8
    expect(zoomed.z).toBe(8);
    const tiny = zoomAt(cam, 1e-9, 0, 0); // way under -> clamps to 1
    expect(tiny.z).toBe(1);
    const snapped = zoomAt({ x: 0, y: 0, z: 1 }, 1.1, 0, 0);
    expect(snapped.z).toBeCloseTo(Math.round(snapped.z * 4) / 4, 9);
  });
});

describe('fit', () => {
  it('chooses the largest zoom that shows the whole world when the world is smaller than the view', () => {
    const c = fit({ x: 0, y: 0, z: 1 }, 300, 200, 100, 80);
    expect(c.z).toBeCloseTo(Math.min(300 / 100, 200 / 80), 9);
    expect(c.x).toBeCloseTo(50, 6);
    expect(c.y).toBeCloseTo(40, 6);
  });

  it('floors at zoom 1 (the minimum supported zoom) rather than shrinking further for a world larger than the view', () => {
    // A world bigger than the view would need z < 1 to show it all without
    // cropping, but 1 is the platform's minimum zoom (SPEC §4.1), so fit
    // floors there and centres — it does not crop-avoid by going below 1.
    const c = fit({ x: 0, y: 0, z: 1 }, 400, 300, 1000, 500);
    expect(c.z).toBe(1);
    expect(c.x).toBeCloseTo(500, 6);
    expect(c.y).toBeCloseTo(250, 6);
  });
});

describe('screenToWorld / worldToScreen', () => {
  it('screenToWorld inverts worldToScreen', () => {
    const cam = { x: 250, y: 130, z: 3.5 };
    const viewW = 500;
    const viewH = 400;
    for (const [wx, wy] of [
      [0, 0],
      [250, 130],
      [500, 300],
      [-40, 900],
    ]) {
      const screen = worldToScreen(cam, viewW, viewH, wx, wy);
      const back = screenToWorld(cam, viewW, viewH, screen.x, screen.y);
      expect(back.x).toBeCloseTo(wx, 6);
      expect(back.y).toBeCloseTo(wy, 6);
    }
  });
});
