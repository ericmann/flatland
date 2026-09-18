import { test, expect } from '@playwright/test';

test('page loads with no console errors and paints a canvas', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  // Let anything async (there is none yet, but future tasks may add some)
  // have a moment to surface a console error before asserting.
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
});

test('first frame is painted within 1500 ms', async ({ page }) => {
  const start = Date.now();
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.dataset.painted === '1', null, {
    timeout: 1500,
  });
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(1500);
});
