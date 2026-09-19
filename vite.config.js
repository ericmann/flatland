import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// P4-08 (SPEC §2, §6.6, §10): installable, offline PWA. `generateSW`
// precaches the built bundle plus icons/fonts/manifest; `injectRegister:
// false` because src/main.js registers the service worker itself via the
// `virtual:pwa-register` import (SPEC's worker/main-thread boundary — no
// plugin-generated script tag doing it a second time). No `devOptions`: the
// service worker only runs against a real build (`npm run preview`), never
// `vite dev`.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
  plugins: [
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Flatland',
        short_name: 'Flatland',
        description:
          'A browser-native artificial-life ecosystem: organisms hunt, graze, breed, evolve and die on a tile-based world with no goal and no player character.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0e1410',
        background_color: '#0e1410',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
