import { test, expect } from '@playwright/test';

/** Wait for the app state machine's debug handle to exist. */
async function waitForApp(page) {
  await page.waitForFunction(() => window.__flatland !== undefined, null, { timeout: 3000 });
}

test('a fire writes a ⚡ line to the chronicle', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto('/');
  await waitForApp(page);

  const openBox = await page.locator('#view').boundingBox();
  await page.mouse.click(openBox.x + openBox.width / 2, openBox.y + openBox.height / 2); // open the station
  await page.waitForFunction(() => window.__flatland.mode === 'station', null, { timeout: 5000 });

  await page.locator('[data-pane="god"]').click();
  await page.locator('[data-tool="fire"]').click();
  await expect(page.locator('[data-tool="fire"]')).toHaveClass(/on/);

  const box = await page.locator('#view').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('.chron-rows')).toContainText('⚡ Fire sweeps', { timeout: 10000 });
});
