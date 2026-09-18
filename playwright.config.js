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
