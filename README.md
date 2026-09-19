# Flatland

A browser-native artificial-life ecosystem: a tile-based 8-bit world in which
organisms hunt, graze, breed, evolve, and die, with no goal and no player
character. The successor to [Helioza](https://github.com/ericmann/helioza).

Deterministic from a seed plus its history: organisms sense light, scent,
temperature and each other; breed asexually or (Phase 5) sexually with
crossover; hunt, graze, swim, sicken, migrate and speciate; and weather —
day/night, seasons, temperature, rain and fog — moves the world underneath
them. Idle mode narrates what's happening in plain language; the field
station lets a viewer inspect organisms, watch charts and a live phylogeny,
and intervene (fire, meteor, plague, river, meadow, rain) as logged,
chronicled, replayable events, never a silent mutation. The app is
installable and runs offline after a first load.

- **Spec:** `docs/SPEC.md` — the source of truth.
- **Mockup:** `docs/mockup.html` — the reference for layout, colour and
  interaction.
- **Build plan:** `docs/PLAN.md`, tracked task-by-task in `docs/PROGRESS.md`
  (all phases complete as of this branch).
- **Working in this repo:** `CLAUDE.md` and `docs/development.md`.
- **Deployment:** `docs/deployment.md` (Cloudflare Pages).
- **Preview (this branch):** https://build-2026-09-18.flatland.pages.dev

## Quick start

```
npm ci
npm run dev
```

Node 22.12+ is required. See `docs/development.md` for the full command
reference (tests, headless harness, sweeps) and `docs/blog-post.md` for a
narrative tour of what the sim actually does.
