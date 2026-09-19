import { test, expect } from '@playwright/test';

test('the manifest is linked and served with the required fields', async ({ page }) => {
  await page.goto('/');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const manifestUrl = new URL(manifestHref, page.url()).toString();
  const response = await page.request.get(manifestUrl);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();

  expect(manifest.name).toBe('Flatland');
  expect(manifest.short_name).toBe('Flatland');
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBe('any');
  expect(manifest.theme_color).toBe('#0e1410');
  expect(manifest.background_color).toBe('#0e1410');
  expect(manifest.start_url).toBe('/');

  const anyIcons = manifest.icons.filter((icon) => (icon.purpose ?? 'any') === 'any');
  expect(anyIcons.some((icon) => icon.sizes === '192x192')).toBe(true);
  expect(anyIcons.some((icon) => icon.sizes === '512x512')).toBe(true);

  const maskable = manifest.icons.find((icon) => icon.purpose === 'maskable');
  expect(maskable?.sizes).toBe('512x512');
});

test('a service worker is registered after load', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.dataset.painted === '1', null, {
    timeout: 5000,
  });

  await page.waitForFunction(
    async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration);
    },
    null,
    { timeout: 10000 },
  );
});
