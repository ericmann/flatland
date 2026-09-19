import { test, expect } from '@playwright/test';

/** Wait for the app state machine's debug handle to exist. */
async function waitForApp(page) {
  await page.waitForFunction(() => window.__flatland !== undefined, null, { timeout: 3000 });
}

// See smoke.spec.js: a fixed `?seed=` bypasses any auto-saved world from
// IndexedDB (P4-06's boot precedence) so this test gets its own fresh
// genesis, immune to another test's auto-save (P4-09 finding).
const SEED = '90104';

test('a fire writes a ⚡ line to the chronicle', async ({ page }) => {
  test.setTimeout(45000);
  await page.goto(`/?seed=${SEED}`);
  await waitForApp(page);

  const openBox = await page.locator('#view').boundingBox();
  await page.mouse.click(openBox.x + openBox.width / 2, openBox.y + openBox.height / 2); // open the station
  await page.waitForFunction(() => window.__flatland.mode === 'station', null, { timeout: 5000 });

  await page.locator('[data-pane="god"]').click();
  await page.locator('[data-tool="fire"]').click();
  await expect(page.locator('[data-tool="fire"]')).toHaveClass(/on/);

  const box = await page.locator('#view').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // A generous timeout, not a sleep: the intervention only reaches the
  // chronicle once the sim actually ticks past it, which needs real
  // headroom under a loaded machine rather than a fixed small budget.
  await expect(page.locator('.chron-rows')).toContainText('⚡ Fire sweeps', { timeout: 20000 });
});
