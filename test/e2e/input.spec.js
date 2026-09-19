import { test, expect } from '@playwright/test';

/** Wait for the app state machine's debug handle to exist. */
async function waitForApp(page) {
  await page.waitForFunction(() => window.__flatland !== undefined, null, { timeout: 3000 });
}

test('drag pans (camera x changes)', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  // Zoom in first: at the initial fit zoom the whole world already fits
  // the viewport on some project sizes (e.g. chromium-desktop), leaving no
  // room to pan — clamp() correctly pins the camera to the world centre.
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  const before = await page.evaluate(() => window.__flatland.camera.x);

  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy, { steps: 5 });
  await page.mouse.up();

  const after = await page.evaluate(() => window.__flatland.camera.x);
  expect(after).not.toBeCloseTo(before, 3);
});

test('pinch changes the zoom label', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'pixel-7',
    'pinch is a touch-only gesture, exercised on pixel-7',
  );
  await page.goto('/');
  await waitForApp(page);
  const before = await page.locator('#zoomv').textContent();

  const client = await page.context().newCDPSession(page);
  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Two touch points starting close together, spreading apart: a pinch-out (zoom in).
  async function touch(type, dx1, dx2) {
    await client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [
        { x: cx - dx1, y: cy, id: 1 },
        { x: cx + dx2, y: cy, id: 2 },
      ],
    });
  }
  await touch('touchStart', 10, 10);
  for (const d of [20, 30, 40, 50]) {
    await touch('touchMove', d, d);
  }
  await touch('touchEnd', 50, 50);

  const after = await page.locator('#zoomv').textContent();
  expect(after).not.toBe(before);
});

test('tap on the map opens the station', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  expect(await page.evaluate(() => window.__flatland.mode)).toBe('idle');

  await page.locator('#view').click();
  expect(await page.evaluate(() => window.__flatland.mode)).toBe('station');
});

test('key 2 shows 4× active in the cluster', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await page.keyboard.press('2');
  // Scoped to the floating cluster (P2-08 gave the top bar its own
  // `[data-sp]` speed group too, so the bare selector is now ambiguous).
  await expect(page.locator('#hud [data-sp="4"]')).toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => window.__flatland.speed)).toBe(4);
});
