# `test/e2e/` — SPEC §9.4 checklist

Playwright, run against a built preview server (never `vite dev`), on two
projects: `chromium-desktop` and `pixel-7` (`playwright.config.js`). Every
row below is a required SPEC §9.4 check (plus the P4-09 auto-save addition)
and the exact spec file + test name that covers it. All run on both
projects except where noted — a `test.skip()` for the project it doesn't
apply to is the existing, intentional pattern (a touch-only gesture, a
phone-only layout), not a gap.

| SPEC §9.4 check                                                                   | Spec file         | Test name                                                     | Projects                                                                      |
| --------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| page loads with no console errors                                                 | `smoke.spec.js`   | `page loads with no console errors and paints a canvas`       | both                                                                          |
| first frame under budget                                                          | `smoke.spec.js`   | `first frame is painted within 1500 ms`                       | both                                                                          |
| tap opens station                                                                 | `station.spec.js` | `tap opens the station and the top bar shows a running clock` | both                                                                          |
| tap opens station (input path)                                                    | `input.spec.js`   | `tap on the map opens the station`                            | both                                                                          |
| pinch changes the zoom label                                                      | `input.spec.js`   | `pinch changes the zoom label`                                | pixel-7 only (`test.skip` on chromium-desktop: pinch is a touch-only gesture) |
| drag pans                                                                         | `input.spec.js`   | `drag pans (camera x changes)`                                | both                                                                          |
| a Hand-of-God fire writes a ⚡ chronicle line                                     | `god.spec.js`     | `a fire writes a ⚡ line to the chronicle`                    | both                                                                          |
| a share link reloads into the same clock and population                           | `share.spec.js`   | `a share link reloads into the same clock and population`     | both                                                                          |
| a reload resumes at or after the previous tick (P4-09 addition, auto-save/resume) | `resume.spec.js`  | `a reload resumes at or after the previous tick`              | both                                                                          |
| the PWA installs — manifest present with the required fields                      | `pwa.spec.js`     | `the manifest is linked and served with the required fields`  | both                                                                          |
| the PWA installs — service worker registered                                      | `pwa.spec.js`     | `a service worker is registered after load`                   | both                                                                          |

## Other coverage (not a §9.4 bullet, kept alongside it)

- `smoke.spec.js`: `the tick advances (data-tick increases within 3 s)`,
  `the page makes no network requests after load except same-origin assets`
  (SPEC §3 rule 9, offline-first).
- `input.spec.js`: `key 2 shows 4× active in the cluster` (speed control).
- `station.spec.js`: `clicking an organism opens the inspector with a
sprite`, the rename → chronicle → phylogeny flow, and
  `pixel-7: the rail is a horizontal strip and the inspector is hidden
until selection` (`test.skip` on chromium-desktop: phone layout only).

## Waiting conventions

No spec uses `page.waitForTimeout` to wait for application state — only
`data-tick`, `data-painted`, `data-replaying`, class/text assertions, or
`expect.poll` against a directly-observable source (e.g. `resume.spec.js`
polls IndexedDB itself, since there is no DOM signal for "the auto-save
write finished"). Real-time waits (`waitForTimeout`) appear only where
they mean exactly what they say: giving async work a fixed grace period
to _possibly_ misbehave before asserting it didn't (e.g. "no console
errors showed up in the next 200ms"), never as a substitute for waiting on
a state change.
