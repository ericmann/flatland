import { test, expect } from '@playwright/test';

// P5-06 (SPEC §8): "Frame time, main thread <= 8ms at 1x; UI never below
// 50fps at 16x" and "Memory <= 150 MB total" are phone-only budgets (the
// SPEC's own measurement basis is "a mid-range Android phone" — see
// docs/performance.md's `NOT VERIFIED (human)` rows). What this suite can
// measure without a phone, on both Playwright projects, is real
// requestAnimationFrame frame time on the desktop/emulated-mobile browser
// this machine actually has, asserting nothing stricter than the PLAN's
// own ceiling: "p95 < 33 ms" (roughly 30fps — a floor far below the 50fps
// phone budget, wide enough to be meaningful on a shared dev machine
// without being a real phone-budget gate).
const SEED = '90105';
const FRAME_COUNT = 300;

/** Wait for the app state machine's debug handle to exist. */
async function waitForApp(page) {
  await page.waitForFunction(() => window.__flatland !== undefined, null, { timeout: 3000 });
}

/**
 * Drive the app into the given mode/speed, then sample `FRAME_COUNT`
 * `requestAnimationFrame` deltas via `performance.now()` inside the page
 * (SPEC §8/§9.4: measured in-page, not from the Node side, so it reflects
 * the real main-thread frame cost — layout, canvas draw, snapshot decode
 * — the renderer actually pays).
 * Also samples the worker's own achieved tick rate (SPEC §8's "Sim
 * throughput, worker >= 480 ticks/s (16x real time at 30 tps)" row) by
 * reading `data-tick` (main.js's status handler) before and after the
 * frame-sampling window — real wall time against real simulated ticks,
 * not a Node-side estimate.
 * @param {import('@playwright/test').Page} page
 * @param {{ mode: 'idle'|'station', speedKey: '1'|'3', label: string }} scenario
 * @returns {Promise<{ label: string, mean: number, p95: number, max: number, heapUsedMB: number|null, workerTps: number }>}
 */
async function measureScenario(page, { mode, speedKey, label }) {
  await page.goto(`/?seed=${SEED}`);
  await waitForApp(page);

  if (mode === 'station') {
    // A tap always opens the station whether or not it lands on an
    // organism (app.js's `onTap`), so a fixed centre click is enough —
    // no need to hunt for an organism the way station.spec.js does for
    // its selection-specific assertions.
    const box = await page.locator('#view').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.__flatland.mode === 'station', null, {
      timeout: 5000,
    });
  }
  // Idle is the default boot mode (app.js), so no action is needed there.

  await page.keyboard.press(speedKey); // '1' -> 1x, '3' -> 16x (app.js's onKeyDown).
  await page.waitForFunction((sp) => window.__flatland.speed === sp, speedKey === '1' ? 1 : 16, {
    timeout: 3000,
  });

  // Let the mode/speed change settle (a resize/redraw or two) before
  // sampling, so the first measured frames aren't the transition itself.
  await page.waitForTimeout(300);

  const tickBefore = await page.evaluate(() => Number(document.documentElement.dataset.tick));
  const wallBefore = Date.now();

  const deltas = await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        let count = 0;
        function loop(t) {
          times.push(t - last);
          last = t;
          count++;
          if (count < frames) {
            requestAnimationFrame(loop);
          } else {
            resolve(times);
          }
        }
        requestAnimationFrame(loop);
      }),
    FRAME_COUNT,
  );

  const tickAfter = await page.evaluate(() => Number(document.documentElement.dataset.tick));
  const wallAfter = Date.now();
  const workerTps = ((tickAfter - tickBefore) / (wallAfter - wallBefore)) * 1000;

  const heapUsedMB = await page.evaluate(() => {
    const mem = /** @type {*} */ (performance).memory;
    return mem ? mem.usedJSHeapSize / 1e6 : null;
  });

  // Drop the first sample (SPEC §9.4's own e2e style avoids asserting on
  // startup transients elsewhere): it spans from `waitForTimeout`'s
  // return to the first rAF, not a real inter-frame gap.
  const samples = deltas.slice(1).sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const max = samples[samples.length - 1];

  return { label, mean, p95, max, heapUsedMB, workerTps };
}

test('p95 frame time under 33 ms on both projects', async ({ page }, testInfo) => {
  test.setTimeout(60000);

  const scenarios = [
    { mode: 'idle', speedKey: '1', label: 'idle @ 1x' },
    { mode: 'idle', speedKey: '3', label: 'idle @ 16x' },
    { mode: 'station', speedKey: '1', label: 'station @ 1x' },
    { mode: 'station', speedKey: '3', label: 'station @ 16x' },
  ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(await measureScenario(page, scenario));
  }

  const lines = results.map(
    (r) =>
      `${r.label.padEnd(14)} mean ${r.mean.toFixed(2)} ms  p95 ${r.p95.toFixed(2)} ms  ` +
      `max ${r.max.toFixed(2)} ms  heap ${r.heapUsedMB != null ? r.heapUsedMB.toFixed(1) + ' MB' : 'n/a'}  ` +
      `worker ${r.workerTps.toFixed(0)} ticks/s`,
  );
  const report = [
    `frame time — ${testInfo.project.name} (${FRAME_COUNT} frames/scenario)`,
    ...lines,
  ].join('\n');

  // SPEC §8/§9.4: numbers land in both the console (visible in `npm run
  // test:ui`'s output and CI logs) and the HTML report as an attachment,
  // per this task's "writes the numbers into the test's own
  // report/console output" design constraint.
  console.log(report);
  await testInfo.attach(`perf-${testInfo.project.name}.txt`, { body: report });

  for (const r of results) {
    // The real §8 budgets (<=8ms main thread at 1x, never below 50fps at
    // 16x) need a real phone (docs/performance.md's `NOT VERIFIED
    // (human)` rows). This assertion is deliberately far looser: it only
    // catches an actual stall/hang on the CI/dev machine, not a phone
    // regression.
    expect(r.p95, `${r.label} p95 frame time`).toBeLessThan(33);
  }
});
