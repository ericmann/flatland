import { test, expect } from '@playwright/test';

/** Wait for the app state machine's debug handle to exist. */
async function waitForApp(page) {
  await page.waitForFunction(() => window.__flatland !== undefined, null, { timeout: 3000 });
}

// See smoke.spec.js: a fixed `?seed=` bypasses any auto-saved world from
// IndexedDB (P4-06's boot precedence) so every test here gets its own
// fresh genesis, immune to another test's auto-save (P4-09 finding).
const SEED = '90103';

/**
 * Click random points inside `#view` until one lands on an organism (SPEC
 * has no "click exactly here" contract — organisms move every tick and
 * only occupy a fraction of the map). Bounded by wall-clock time, not a
 * fixed attempt count: a fixed count can run out well before its
 * enclosing `test.setTimeout` when the machine is under load and each
 * click+evaluate round trip is slower than usual, which is exactly the
 * "unlucky" case this loop exists to ride out.
 * @param {import('@playwright/test').Page} page
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {number} deadlineMs
 * @returns {Promise<boolean>}
 */
async function selectAnyOrganism(page, box, deadlineMs) {
  const until = Date.now() + deadlineMs;
  let selected = false;
  while (!selected && Date.now() < until) {
    const x = box.x + Math.random() * box.width;
    const y = box.y + Math.random() * box.height;
    await page.mouse.click(x, y);
    try {
      selected = (await page.evaluate(() => window.__flatland.selectedId)) != null;
    } catch (err) {
      // P4-09 finding (playwright.config.js's `workers: 1` comment):
      // `registerType: 'autoUpdate'`'s `registerSW` calls
      // `window.location.reload()` itself on a service-worker
      // "activated" event with `isUpdate`/`isExternal` true. `workers: 1`
      // only makes this rare (one tab on the origin at a time), it
      // doesn't make it impossible — an in-flight reload of *this* tab's
      // own registration can still land mid-loop. The app is fine right
      // after (it just reloads and keeps working); treat the click that
      // raced the reload as "not yet selected" rather than failing the
      // test on a benign, known navigation.
      if (!/Execution context was destroyed/.test(String(err?.message ?? err))) throw err;
      await page.waitForLoadState('domcontentloaded');
      await waitForApp(page);
      selected = false;
    }
  }
  return selected;
}

test('tap opens the station and the top bar shows a running clock', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
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
  test.setTimeout(60000);
  await page.goto(`/?seed=${SEED}`);
  await waitForApp(page);

  const box = await page.locator('#view').boundingBox();
  const selected = await selectAnyOrganism(page, box, 45000);

  expect(selected).toBe(true);
  await expect(page.locator('#inspBody')).toBeVisible();
  await expect(page.locator('#portrait')).toBeVisible();
});

test('renaming shows a "You named…" chronicle line and the new name in the phylogeny', async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto(`/?seed=${SEED}`);
  await waitForApp(page);

  const box = await page.locator('#view').boundingBox();
  const selected = await selectAnyOrganism(page, box, 20000);
  expect(selected).toBe(true);

  const nameInput = page.locator('#specName');
  await expect(nameInput).toBeEnabled();
  await nameInput.fill('Renamed Test Lineage');
  await nameInput.press('Enter');

  // The rename is queued as an intervention and only reaches the
  // chronicle once the sim has actually ticked past it (SPEC §3 rule 6).
  // A P4-09 isolated repro (`node debug_rename_pixel7b.mjs`, 15 runs, this
  // machine's ambient load) confirmed this always resolves — observed
  // between 15 and 131 ticks — but real-time-to-that-tick varies a lot
  // under this session's documented sustained CPU contention (same class
  // as `test/invariants/throughput.test.js`'s, docs/PROGRESS.md P3-10
  // onward), so 20s was occasionally too little. 40s is a wait-on-state
  // budget, not a sleep: the typical case still resolves in well under a
  // second.
  await expect(page.locator('.chron-rows')).toContainText('You named the', { timeout: 40000 });
  await expect(page.locator('.chron-rows')).toContainText('Renamed Test Lineage', {
    timeout: 40000,
  });

  // On phone widths the inspector is a bottom sheet that overlaps the
  // dock tabs (SPEC §5.2); close it first so the tab click isn't
  // intercepted, matching how a user would actually get to the dock.
  await page.locator('#unsel').click();
  await page.locator('[data-pane="phylo"]').click();
  await expect(page.locator('#phyloSvg')).toContainText('Renamed Test Lineage', {
    timeout: 40000,
  });
});

test('pixel-7: the rail is a horizontal strip and the inspector is hidden until selection', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-7', 'phone layout only, exercised on pixel-7');
  await page.goto(`/?seed=${SEED}`);
  await waitForApp(page);
  await page.locator('#view').click(); // open the station

  const rail = await page.locator('#rail').boundingBox();
  expect(rail.width).toBeGreaterThan(rail.height);

  await expect(page.locator('#insp')).toBeHidden();
});
