# Deployment — Cloudflare Pages

Follows Helioza's deployment approach with one difference: there **is** a
build step (SPEC §7).

## Dashboard setup (once, human)

1. Cloudflare dashboard → **Workers & Pages** → **Create application** →
   the **Pages** flow (not the Workers flow, which prefills a deploy
   command this project doesn't want).
2. **Connect to Git** → `ericmann/flatland`.
3. Build settings:

   | Field                  | Value                                                                                                                                            |
   | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
   | Project name           | `flatland`                                                                                                                                       |
   | Production branch      | `main`                                                                                                                                           |
   | Framework preset       | None (or "React (Vite)" — both prefill the same build command and output directory; "None" avoids implying a framework this project doesn't use) |
   | Build command          | `npm run build`                                                                                                                                  |
   | Build output directory | `dist`                                                                                                                                           |
   | Root directory         | `/`                                                                                                                                              |
   | Environment variable   | `NODE_VERSION=22`                                                                                                                                |

4. Save and deploy.
5. **Custom domains** → add `flatland.eamann.com`. The zone is on
   Cloudflare, so it creates the proxied `CNAME flatland → flatland.pages.dev`
   and the certificate itself. Wait for **Active**.
6. **Settings → Builds & deployments → Preview deployments**: set to
   **All branches**, so every branch (including `build/<date>`) gets its
   own preview URL.

This whole section is a human step; it is not automated by `/implement`.

## Preview deployments

Every branch and PR deploys to `<branch>.flatland.pages.dev`, with every
non-alphanumeric character in the branch name replaced by `-` (SPEC §7.2).
For example, branch `build/2026-09-18` deploys to
`https://build-2026-09-18.flatland.pages.dev`. Design review happens on
these URLs; a PR is not mergeable until its preview has been opened on a
phone. If the dashboard has not yet been connected (the step above), this
URL will 404 until it is.

## Headers

`public/_headers` (copied into `dist/` by Vite, since `public/` is Vite's
static-asset directory):

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cache-Control: public, max-age=0, must-revalidate
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

No COOP/COEP: the design does not rely on `SharedArrayBuffer`, and setting
those headers would complicate the Android WebView case (SPEC §10).

## Progressive Web App (Phase 4)

`vite-plugin-pwa` (`strategies: 'generateSW'`) precaches the built bundle
(`workbox.globPatterns`) with `navigateFallback: 'index.html'`, so once a
build has loaded once, the service worker serves the app shell and every
asset from its cache on subsequent loads — including with the network
fully off (airplane mode), since nothing in `src/core`/`src/sim` fetches
after boot (CLAUDE.md's offline-first rule). `registerType: 'autoUpdate'`
means a new deployment's worker activates and reloads open tabs onto it
automatically rather than waiting for every tab to close; `src/main.js`
registers it itself via `import { registerSW } from
'virtual:pwa-register'` (`immediate: true`), and `vite.config.js` sets
`injectRegister: false` so the plugin doesn't also inject its own
registration.

`scripts/make-icons.mjs` generates the manifest's icon set byte-identically
on every run: `icon.svg`, `icon-192.png`/`icon-512.png` (purpose `any`) and
`maskable-512.png` (purpose `maskable`, an 80% safe zone). The manifest
(name, start URL, the dark-theme `theme_color`/`background_color` from
SPEC §5.5, and those icons) is injected into `dist/index.html` at build
time, alongside the `theme-color` meta tag and `apple-touch-icon` link
`index.html` sets directly. Once the manifest and service worker are both
served, a Chromium-based browser (desktop or Android) offers "Add to Home
Screen" / "Install"; the installed app launches standalone, without browser
chrome, using `theme_color` for the title/status bar. `test/unit/
bundle-size.test.js` keeps the gzip total (JS+CSS+fonts+`index.html`)
under a 400 kB budget so the precached, offline footprint stays small.
Part of the phone checklist (`docs/PROGRESS.md`'s Phase 4 end log entry).

## CI

`.github/workflows/test.yml` runs on push to `main` and every PR:
`npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run
test:soak`, `npm run build`, then installs Chromium and runs `npm run
test:ui` (Playwright, against the built `preview` server). A PR that
regresses the Node throughput gate (SPEC §8) by more than 10% fails CI once
that gate exists (P1-10).

## Command-line deploy (fallback)

```
npm run build && npx wrangler pages deploy dist --project-name flatland
```

Useful if the dashboard's Git integration is ever unavailable.
