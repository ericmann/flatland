import { test, expect } from '@playwright/test';

/** Wait for the app state machine's debug handle to exist. */
async function waitForApp(page) {
  await page.waitForFunction(() => window.__flatland !== undefined, null, { timeout: 3000 });
}

test('tap opens the station and the top bar shows a running clock', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  await page.locator('#view').click();
  expect(await page.evaluate(() => window.__flatland.mode)).toBe('station');

  await expect(page.locator('#clock')).toHaveText(/Year \d+ · Day \d+ · \d{2}:\d{2}/);
  const first = await page.locator('#clock').textContent();
  await page.waitForFunction(
    (prev) => document.querySelector('#clock')?.textContent !== prev,
    first,
    { timeout: 5000 },
  );
});

test('clicking an organism opens the inspector with a sprite', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto('/');
  await waitForApp(page);

  // Organisms move every tick and only occupy a fraction of the map, so
  // a small fixed grid of taps can consistently miss depending on exactly
  // when (real time) the clicks land relative to their positions. Random
  // points over a longer budget make this robust without depending on
  // timing or population layout.
  const box = await page.locator('#view').boundingBox();
  let selected = false;
  for (let attempt = 0; attempt < 400 && !selected; attempt++) {
    const x = box.x + Math.random() * box.width;
    const y = box.y + Math.random() * box.height;
    await page.mouse.click(x, y);
    selected = (await page.evaluate(() => window.__flatland.selectedId)) != null;
  }

  expect(selected).toBe(true);
  await expect(page.locator('#inspBody')).toBeVisible();
  await expect(page.locator('#portrait')).toBeVisible();
});

test('renaming shows a "You named…" chronicle line and the new name in the phylogeny', async ({
  page,
}) => {
  test.setTimeout(30000);
  await page.goto('/');
  await waitForApp(page);

  const box = await page.locator('#view').boundingBox();
  let selected = false;
  for (let attempt = 0; attempt < 400 && !selected; attempt++) {
    const x = box.x + Math.random() * box.width;
    const y = box.y + Math.random() * box.height;
    await page.mouse.click(x, y);
    selected = (await page.evaluate(() => window.__flatland.selectedId)) != null;
  }
  expect(selected).toBe(true);

  const nameInput = page.locator('#specName');
  await expect(nameInput).toBeEnabled();
  await nameInput.fill('Renamed Test Lineage');
  await nameInput.press('Enter');

  await expect(page.locator('.chron-rows')).toContainText('You named the', { timeout: 10000 });
  await expect(page.locator('.chron-rows')).toContainText('Renamed Test Lineage', {
    timeout: 10000,
  });

  // On phone widths the inspector is a bottom sheet that overlaps the
  // dock tabs (SPEC §5.2); close it first so the tab click isn't
  // intercepted, matching how a user would actually get to the dock.
  await page.locator('#unsel').click();
  await page.locator('[data-pane="phylo"]').click();
  await expect(page.locator('#phyloSvg')).toContainText('Renamed Test Lineage', {
    timeout: 10000,
  });
});

test('pixel-7: the rail is a horizontal strip and the inspector is hidden until selection', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-7', 'phone layout only, exercised on pixel-7');
  await page.goto('/');
  await waitForApp(page);
  await page.locator('#view').click(); // open the station

  const rail = await page.locator('#rail').boundingBox();
  expect(rail.width).toBeGreaterThan(rail.height);

  await expect(page.locator('#insp')).toBeHidden();
});
