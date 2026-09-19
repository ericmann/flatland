import { defineConfig, devices } from '@playwright/test';

// SPEC §6.6, §9.4: Chromium desktop + Pixel 7 emulation, against a built
// preview server (never `vite dev`, so this exercises the real bundle).
export default defineConfig({
  testDir: 'test/e2e',
  retries: process.env.CI ? 1 : 0,
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
  // P4-09 finding: `registerType: 'autoUpdate'` (vite.config.js) makes
  // `main.js`'s `registerSW` call `window.location.reload()` itself
  // whenever Workbox reports the service worker "activated" with
  // `isUpdate`/`isExternal` true — real, intended behaviour for a
  // genuinely different tab updating a genuinely different tab, but
  // every spec here shares one origin, so several tabs open at once can
  // trip that on each other, reloading a page out from under a running
  // test (surfaced as `window.__flatland` suddenly `undefined` mid-test,
  // or a chronicle that looked like it had "reset"). One worker keeps at
  // most one spec's tab open against that origin at a time (the one
  // planned exception, `share.spec.js`'s own second `page` in the same
  // context/test, never showed this — it shares the *same* registration,
  // not a competing one). Blocking service workers outright instead
  // (tried first) avoids this too, but makes `registerSW`'s own
  // `onRegisterError` fire — a *bigger* footgun, since it fails
  // `smoke.spec.js`'s "no console errors" check on every run.
  workers: 1,
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
