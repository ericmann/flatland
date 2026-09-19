import { test, expect } from '@playwright/test';

/** Wait for the app state machine's debug handle to exist. */
async function waitForApp(page) {
  await page.waitForFunction(() => window.__flatland !== undefined, null, { timeout: 3000 });
}

test('a share link reloads into the same clock and population', async ({ page, context }) => {
  test.setTimeout(45000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // See smoke.spec.js: a fixed `?seed=` bypasses any auto-saved world from
  // IndexedDB (P4-06's boot precedence), so `page`'s own genesis here is
  // never an accidental resume of another test's auto-save (P4-09
  // finding). `page2` below loads the `?w=` share link instead, which
  // already takes precedence over everything else.
  await page.goto('/?seed=90105');
  await waitForApp(page);

  const openBox = await page.locator('#view').boundingBox();
  await page.mouse.click(openBox.x + openBox.width / 2, openBox.y + openBox.height / 2); // open the station
  await page.waitForFunction(() => window.__flatland.mode === 'station', null, { timeout: 5000 });

  // That same click can also land on an organism and select it (station
  // mode and selection are independent — the click does both if it's
  // lucky/unlucky). On phone widths the inspector is then a bottom sheet
  // that overlaps the dock tabs (SPEC §5.2, the same issue station.spec.js's
  // rename test guards against): close it first so the god-pane tab
  // click below isn't intercepted by it.
  if ((await page.evaluate(() => window.__flatland.selectedId)) != null) {
    await page.locator('#unsel').click();
  }

  // Fire an intervention partway through, so the replayed link has a
  // non-trivial log, then let a few more ticks run past it.
  await page.locator('[data-pane="god"]').click();
  await page.locator('[data-tool="fire"]').click();
  const mapBox = await page.locator('#view').boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await expect(page.locator('.chron-rows')).toContainText('⚡ Fire sweeps', { timeout: 20000 });
  await page.waitForTimeout(500);

  // Pause so `data-tick` and the population summary stay fixed while we
  // compare (the space-bar shortcut, not a topbar click: on the pixel-7
  // viewport the crowded top bar's buttons can visually overlap at this
  // narrow width, making a real click target ambiguous/flaky).
  await page.keyboard.press(' ');
  await page.waitForTimeout(300); // let the last in-flight pump()'s status/snapshot settle.

  const tickA = await page.evaluate(() => document.documentElement.dataset.tick);
  const herbA = await page.locator('#pHerb').textContent();
  const carnA = await page.locator('#pCarn').textContent();

  await page.locator('#shareBtn').click();
  await expect(page.locator('#toast')).toHaveText(/Link copied|Shared/, { timeout: 5000 });
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(clipboard);
  expect(url.searchParams.get('w')).toBeTruthy();

  const page2 = await context.newPage();
  await page2.goto(url.toString());
  await waitForApp(page2);
  // A share link loads paused (speed 0, P4-05) precisely so the replayed
  // tick is stable to compare against — no race with live ticking.
  await page2.waitForFunction(
    () =>
      document.documentElement.dataset.replaying !== '1' && document.documentElement.dataset.tick,
    null,
    { timeout: 20000 },
  );
  await page2.waitForTimeout(300); // let the first post-replay status/snapshot settle.

  // The top bar (and its `#pHerb`/`#pCarn`/speed cluster) is mounted as
  // soon as `loaded` fires, regardless of idle/station mode — no need to
  // open the station here, only to read its text content.
  const tickB = await page2.evaluate(() => document.documentElement.dataset.tick);
  expect(tickB).toBe(tickA);
  await expect(page2.locator('#top [data-sp="0"]')).toHaveClass(/on/);
  await expect(page2.locator('#pHerb')).toHaveText(herbA);
  await expect(page2.locator('#pCarn')).toHaveText(carnA);
});
