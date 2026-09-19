import { test, expect } from '@playwright/test';

// A fixed `?seed=` (SPEC §5.6): `main.js`'s `boot()` treats `?seed=` as an
// explicit override that bypasses any auto-saved world in IndexedDB
// (P4-06's stated precedence). Going through a plain `/` here would
// instead let each test's "fresh" boot silently resume whatever a
// previous test in the same run last auto-saved (this suite's own
// `resume.spec.js`, or a `visibilitychange` a multi-page test like
// `share.spec.js` triggers), which showed up as flaky, unrelated-looking
// failures during P4-09 — a `?seed=` load never reads that store at all.
const SEED = '90101';

test('page loads with no console errors and paints a canvas', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(`/?seed=${SEED}`);
  await expect(page.locator('canvas')).toBeVisible();
  // Let anything async (there is none yet, but future tasks may add some)
  // have a moment to surface a console error before asserting.
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
});

test('first frame is painted within 1500 ms', async ({ page }) => {
  const start = Date.now();
  await page.goto(`/?seed=${SEED}`);
  await page.waitForFunction(() => document.documentElement.dataset.painted === '1', null, {
    timeout: 1500,
  });
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(1500);
});

test('the tick advances (data-tick increases within 3 s)', async ({ page }) => {
  await page.goto(`/?seed=${SEED}`);
  await page.waitForFunction(() => document.documentElement.dataset.tick !== undefined, null, {
    timeout: 3000,
  });
  const first = await page.evaluate(() => Number(document.documentElement.dataset.tick));
  await page.waitForFunction(
    (prev) => Number(document.documentElement.dataset.tick) > prev,
    first,
    {
      timeout: 3000,
    },
  );
});

test('the page makes no network requests after load except same-origin assets', async ({
  page,
}) => {
  const urls = [];
  page.on('request', (req) => urls.push(req.url()));

  await page.goto(`/?seed=${SEED}`);
  await page.waitForFunction(() => document.documentElement.dataset.painted === '1', null, {
    timeout: 1500,
  });
  await page.waitForTimeout(1000); // let the worker/sim settle and request a few snapshots

  const origin = new URL(page.url()).origin;
  const offOrigin = urls.filter((u) => new URL(u).origin !== origin);
  expect(offOrigin).toEqual([]);
});
