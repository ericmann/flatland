import { test, expect } from '@playwright/test';

/** Wait for the app state machine's debug handle to exist. */
async function waitForApp(page) {
  await page.waitForFunction(() => window.__flatland !== undefined, null, { timeout: 3000 });
}

/**
 * Read the auto-save record straight out of IndexedDB (SPEC §5.6, P4-06's
 * `src/persist/db.js`: db name `'flatland'`, object store `'kv'`, key
 * `'world'`), independent of app code, so the test can confirm a save has
 * actually landed before navigating away.
 */
async function readAutosave(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('flatland', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('kv', 'readonly');
          const getReq = tx.objectStore('kv').get('world');
          getReq.onsuccess = () => resolve(getReq.result ?? null);
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

test('a reload resumes at or after the previous tick', async ({ page }) => {
  test.setTimeout(30000);
  // A fixed `?seed=` for this first load only (SPEC §5.6, P4-06's boot
  // precedence: `?seed=` bypasses IndexedDB entirely) so this test always
  // starts from its own small, fast-booting genesis, never an accidental
  // resume of a leftover auto-save from another test in the same run
  // (P4-09 finding) — a large inherited world would also need much
  // longer for its own background verifier replay to catch up. The
  // second load below is a deliberate bare `/`, the one place this
  // suite *wants* the auto-save path.
  await page.goto('/?seed=90106');
  await waitForApp(page);

  // Let a handful of real ticks accumulate so the resumed tick is
  // meaningfully non-zero, not just an artifact of `load`'s own
  // checkpoint-at-tick-0.
  await page.waitForFunction(() => Number(document.documentElement.dataset.tick) > 5, null, {
    timeout: 10000,
  });
  const tickA = Number(await page.evaluate(() => document.documentElement.dataset.tick));

  // Force an auto-save the same way a real tab-backgrounding does
  // (P4-06's `startAutosave`: a `visibilitychange` while `document.hidden`
  // is true saves immediately — the same technique its own unit test,
  // `test/unit/autosave.test.js`'s "saves when the tab becomes hidden",
  // uses) rather than waiting out the real `persist.autosaveSeconds`
  // interval (30s default).
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // Wait on the actual persisted state (never a sleep): the save is an
  // async round trip (worker reply -> IndexedDB write).
  await expect
    .poll(async () => (await readAutosave(page))?.tick ?? -1, { timeout: 10000 })
    .toBeGreaterThanOrEqual(tickA);

  // Attach console/error listeners before the reload so a determinism
  // mismatch from the resume-verification background replay (P4-06's
  // `_verifier`, which `console.error`s on a hash mismatch) can't slip
  // past before we start watching.
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // A bare navigation to `/` — never `page.reload()`, which would keep
  // this tab's `?seed=` (written by `main.js`'s `boot()` via
  // `history.replaceState` on the very first, seedless load) and take
  // the `?seed=` branch instead, which deliberately bypasses the
  // auto-save (P4-06's stated boot precedence: `?w=` > `?seed=` >
  // auto-save > fresh random seed). A bare `/` matches SPEC §9.4/P4-10's
  // "closing and reopening the tab resumes at the same clock" — the
  // scenario auto-save exists for — rather than an in-place F5.
  await page.goto('/');
  await waitForApp(page);
  await page.waitForFunction(() => document.documentElement.dataset.tick !== undefined, null, {
    timeout: 5000,
  });

  const tickB = Number(await page.evaluate(() => document.documentElement.dataset.tick));
  expect(tickB).toBeGreaterThanOrEqual(tickA);

  // Give the resume-verification background replay (stepped a little
  // further on each pump(), from its tick-0 checkpoint up to the
  // just-resumed tick, itself only a handful of ticks here) a further
  // moment to finish and, if it found a determinism fork, log it.
  await page.waitForFunction(
    (prev) => Number(document.documentElement.dataset.tick) > prev + 5,
    tickB,
    { timeout: 10000 },
  );
  expect(errors.filter((e) => e.includes('determinism mismatch'))).toEqual([]);
});
