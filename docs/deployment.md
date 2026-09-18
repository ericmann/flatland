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
