/**
 * The idle auto-camera, caption, ticker and clock (SPEC §5.1). UI-side
 * randomness (`random`) is allowed here — it never reaches the sim, only
 * picks which point of interest the camera drifts to next.
 */
import { regionName } from '../core/names.js';
import { tag as formatTag, clockParts } from './format.js';

/** How long a user pan/pinch/wheel suspends the auto-camera (SPEC §5.1). */
export const IDLE_OVERRIDE_MS = 10000;

const EV_HUNT = 1;
const EV_BIRTH = 2;
const EV_IMMIGRATION = 4;
const HUNT_MAX_AGE_TICKS = 400;
const BIRTH_MAX_AGE_TICKS = 300;
const HERD_SAMPLES = 12;
const HERD_CELL_TILES = 8;
const NIGHT_LIGHT_THRESHOLD = 0.08;
const POI_ZOOM = 3.2;
const NIGHT_ZOOM = 1.4;
const GLIDE_RATE = 0.03;
const HOLD_MS_MIN = 8000;
const HOLD_MS_MAX = 12000;
/** World pixels per tile (matches `Renderer`'s default `px`, SPEC §6.5). */
const PX = 4;

/** Bounded POI memory ring size (Decisions §12.2, P3-09). */
const POI_MEMORY_SIZE = 16;
/** Ordinal words up to "tenth" (PLAN.md P3-09); further repeats keep saying "tenth". */
const ORDINALS = Object.freeze([
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
]);

/**
 * @param {number} n 1-based
 * @returns {string}
 */
function ordinalWord(n) {
  return ORDINALS[Math.min(Math.max(n, 1), ORDINALS.length) - 1];
}

/**
 * Which map edge `(x, y)` is nearest, for the Arrivals caption (P3-06's
 * immigrants always land exactly on one).
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {'west'|'east'|'north'|'south'}
 */
function edgeFromPosition(x, y, w, h) {
  const distances = /** @type {['west'|'east'|'north'|'south', number][]} */ ([
    ['west', x],
    ['east', w - x],
    ['north', y],
    ['south', h - y],
  ]);
  let best = distances[0];
  for (const d of distances) if (d[1] < best[1]) best = d;
  return best[0];
}

/**
 * Every other rAF while idle (SPEC §8: 30fps snapshot cadence against a
 * ~60fps rAF driver).
 * @param {number} frameCount
 * @returns {boolean}
 */
export function isSnapshotFrame(frameCount) {
  return frameCount % 2 === 0;
}

/**
 * Build the `#idleui` element (mockup markup) and its field references.
 * @param {Document} doc
 */
function createIdleUI(doc) {
  const el = doc.createElement('div');
  el.id = 'idleui';
  el.innerHTML = `
    <div id="idleclock"><span class="big" id="idleTime">06:00</span><span id="idleDay">Year 1 · Day 1 · Spring</span></div>
    <div class="cap"><div class="eyebrow" id="capK">Watching</div><div class="t" id="capT">the world wake up</div></div>
    <div class="ticker"><span class="st" id="tickT">—</span><span id="tickE">…</span></div>
    <div class="hint">Tap the map, press any key, or <button id="openStation">open the field station</button></div>
  `;
  return {
    el,
    capK: /** @type {HTMLElement} */ (el.querySelector('#capK')),
    capT: /** @type {HTMLElement} */ (el.querySelector('#capT')),
    tickT: /** @type {HTMLElement} */ (el.querySelector('#tickT')),
    tickE: /** @type {HTMLElement} */ (el.querySelector('#tickE')),
    idleTime: /** @type {HTMLElement} */ (el.querySelector('#idleTime')),
    idleDay: /** @type {HTMLElement} */ (el.querySelector('#idleDay')),
    openStation: /** @type {HTMLButtonElement} */ (el.querySelector('#openStation')),
  };
}

/**
 * @param {number} flagsByte
 * @returns {number} 0 herbivore, 1 omnivore, 2 carnivore (SPEC §6.4's snapshot flagsByte bits 1-2).
 */
function dietCodeOf(flagsByte) {
  return (flagsByte >> 1) & 0b11;
}

/**
 * @param {{ app: *, camera: import('../render/camera.js').Camera, cfg: typeof import('../core/config.js').DEFAULTS, reduceMotion: boolean, random?: () => number }} opts
 * @returns {{ tick: (snapshot: *, now: number) => void, onChronicle: (entries: *[]) => void, caption: () => { kind: string, text: string }, ui: ReturnType<typeof createIdleUI> }}
 */
export function createIdle({ app, camera, cfg, reduceMotion, random = Math.random }) {
  const ui = createIdleUI(app.root.ownerDocument);
  app.world.appendChild(ui.el);
  ui.openStation.addEventListener('click', () => app.setMode('station'));

  /** @type {Uint8Array | null} cached across snapshots that omit FLAG_TERRAIN. */
  let cachedTerrain = null;
  let poiUntil = 0;
  /** @type {number | null} an organism id to follow, or null for a fixed point. */
  let targetId = null;
  let targetX = camera.x;
  let targetY = camera.y;
  let targetZ = camera.z;

  /**
   * The bounded POI memory ring (Decisions §12.2, P3-09): a fixed array
   * of 16 reused record objects — never allocates per pick, only
   * overwrites. `organismId`/`speciesId` are `null` when not applicable
   * to that pick's kind.
   * @type {{ kind: string, organismId: number|null, speciesId: number|null, tick: number }[]}
   */
  const poiMemory = Array.from({ length: POI_MEMORY_SIZE }, () => ({
    kind: '',
    organismId: null,
    speciesId: null,
    tick: 0,
  }));
  let poiMemoryHead = 0;
  let poiMemoryCount = 0;

  /**
   * @param {string} kind
   * @param {number|null} organismId
   * @param {number|null} speciesId
   * @param {number} tick
   * @returns {void}
   */
  function rememberPOI(kind, organismId, speciesId, tick) {
    const slot = poiMemory[poiMemoryHead];
    slot.kind = kind;
    slot.organismId = organismId;
    slot.speciesId = speciesId;
    slot.tick = tick;
    poiMemoryHead = (poiMemoryHead + 1) % POI_MEMORY_SIZE;
    if (poiMemoryCount < POI_MEMORY_SIZE) poiMemoryCount++;
  }

  /**
   * Every remembered sighting matching `key`/`value`, most-recent-first.
   * @param {'organismId'|'speciesId'} key
   * @param {number} value
   * @returns {{ kind: string, organismId: number|null, speciesId: number|null, tick: number }[]}
   */
  function priorSightingsBy(key, value) {
    const out = [];
    for (let i = 0; i < poiMemoryCount; i++) {
      const idx = (poiMemoryHead - 1 - i + POI_MEMORY_SIZE) % POI_MEMORY_SIZE;
      if (poiMemory[idx][key] === value) out.push(poiMemory[idx]);
    }
    return out;
  }

  /**
   * @param {*} snapshot
   * @param {number} id
   * @returns {number} slot index in the snapshot's compact SoA, or -1.
   */
  function findOrgById(snapshot, id) {
    const { n, id: ids } = snapshot.orgs;
    for (let i = 0; i < n; i++) {
      if (ids[i] === id) return i;
    }
    return -1;
  }

  /**
   * Rebuild the weighted point-of-interest list from `snapshot` and pick
   * one (SPEC §5.1), setting the caption and the next glide target.
   * @param {*} snapshot
   * @param {number} now
   * @returns {void}
   */
  function pickPOI(snapshot, now) {
    if (snapshot.terrain) cachedTerrain = snapshot.terrain.slice();
    const w = cfg.world.width;
    const h = cfg.world.height;
    /**
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    const region = (x, y) => (cachedTerrain ? regionName(x, y, cachedTerrain, w, h) : 'the world');

    /** @type {{ k: string, t: string, x: number, y: number, z?: number, followId?: number, speciesId?: number, weight: number }[]} */
    const opts = [];

    for (let e = 0; e < snapshot.eventsCount; e++) {
      const base = e * 6;
      const kind = snapshot.events[base];
      const evTick = snapshot.events[base + 1];
      const x = snapshot.events[base + 2];
      const y = snapshot.events[base + 3];
      const a = snapshot.events[base + 4];
      if (kind === EV_HUNT && snapshot.tick - evTick <= HUNT_MAX_AGE_TICKS) {
        opts.push({
          k: 'A hunt',
          t: `lineage ${a} closing in, ${region(x, y)}`,
          x,
          y,
          speciesId: a,
          weight: 3,
        });
      } else if (kind === EV_BIRTH && snapshot.tick - evTick <= BIRTH_MAX_AGE_TICKS) {
        opts.push({
          k: 'A birth',
          t: `new lineage ${a} in ${region(x, y)}`,
          x,
          y,
          speciesId: a,
          weight: 2,
        });
      } else if (kind === EV_IMMIGRATION && snapshot.tick - evTick <= BIRTH_MAX_AGE_TICKS) {
        const edge = edgeFromPosition(x, y, w, h);
        opts.push({
          k: 'Arrivals',
          t: `newcomers cross in from the ${edge} edge, ${region(x, y)}`,
          x,
          y,
          speciesId: a,
          weight: 2,
        });
      }
    }

    const { n, x: ox, y: oy, id: oid, species: osp, flagsByte: oflags } = snapshot.orgs;
    if (n > 0) {
      let bestIdx = -1;
      let bestCount = 0;
      for (let s = 0; s < HERD_SAMPLES; s++) {
        const idx = Math.floor(random() * n);
        if (idx < 0 || idx >= n) continue;
        const cx = ox[idx];
        const cy = oy[idx];
        let count = 0;
        for (let j = 0; j < n; j++) {
          if (Math.abs(ox[j] - cx) < HERD_CELL_TILES && Math.abs(oy[j] - cy) < HERD_CELL_TILES)
            count++;
        }
        if (count > bestCount) {
          bestCount = count;
          bestIdx = idx;
        }
      }
      if (bestIdx !== -1) {
        opts.push({
          k: 'A herd',
          t: `${bestCount} lineage ${osp[bestIdx]} gathered in ${region(ox[bestIdx], oy[bestIdx])}`,
          x: ox[bestIdx],
          y: oy[bestIdx],
          followId: oid[bestIdx],
          speciesId: osp[bestIdx],
          weight: 1,
        });
      }

      const carnivores = [];
      for (let i = 0; i < n; i++) {
        if (dietCodeOf(oflags[i]) === 2) carnivores.push(i);
      }
      if (carnivores.length > 0) {
        const idx = carnivores[Math.floor(random() * carnivores.length)];
        opts.push({
          k: 'Following',
          t: `a lineage ${osp[idx]} on the prowl through ${region(ox[idx], oy[idx])}`,
          x: ox[idx],
          y: oy[idx],
          followId: oid[idx],
          speciesId: osp[idx],
          weight: 2,
        });
      }
    }

    if (snapshot.light < NIGHT_LIGHT_THRESHOLD) {
      opts.push({
        k: 'Night',
        t: 'the whole valley in the dark',
        x: w / 2,
        y: h / 2,
        z: NIGHT_ZOOM,
        weight: 1.5,
      });
    }

    if (opts.length === 0) return; // nothing to look at yet; keep the current target/caption.

    const total = opts.reduce((sum, o) => sum + o.weight, 0);
    let r = random() * total;
    let picked = opts[0];
    for (const o of opts) {
      r -= o.weight;
      if (r <= 0) {
        picked = o;
        break;
      }
    }

    targetX = picked.x * PX;
    targetY = picked.y * PX;
    targetZ = picked.z ?? POI_ZOOM;
    targetId = picked.followId ?? null;
    poiUntil = now + HOLD_MS_MIN + random() * (HOLD_MS_MAX - HOLD_MS_MIN);

    // Narrative continuity (Decisions §12.2, P3-09): does this pick's
    // subject repeat a remembered one? Checked against memory *before*
    // this pick is itself recorded below.
    let captionText = picked.t;
    if (picked.k === 'Following' && picked.followId != null) {
      const prior = priorSightingsBy('organismId', picked.followId);
      if (prior.length > 0) {
        const prevDay = Math.floor(prior[0].tick / cfg.time.ticksPerDay);
        const thisDay = Math.floor(snapshot.tick / cfg.time.ticksPerDay);
        captionText =
          prevDay < thisDay
            ? `the same hunter, ${ordinalWord(prior.length + 1)} night running.`
            : `still following lineage ${picked.speciesId}.`;
      }
    } else if (picked.k === 'A hunt' && picked.speciesId != null) {
      const prior = priorSightingsBy('speciesId', picked.speciesId).filter(
        (s) => s.kind === 'A hunt',
      );
      if (prior.length > 0) {
        captionText = `lineage ${picked.speciesId} again.`;
      }
    }

    rememberPOI(picked.k, picked.followId ?? null, picked.speciesId ?? null, snapshot.tick);

    ui.capK.textContent = picked.k;
    ui.capT.textContent = captionText;
  }

  /**
   * Advance the auto-camera and refresh the clock, one call per rAF.
   * @param {*} snapshot a decoded snapshot
   * @param {number} now wall-clock ms (`performance.now()`)
   * @returns {void}
   */
  function tick(snapshot, now) {
    if (snapshot.terrain) cachedTerrain = snapshot.terrain.slice();

    const suspended = now - app.getLastInteractionAt() < IDLE_OVERRIDE_MS;
    if (!suspended) {
      let lostTarget = false;
      if (targetId !== null) {
        const idx = findOrgById(snapshot, targetId);
        if (idx === -1) {
          lostTarget = true;
        } else {
          targetX = snapshot.orgs.x[idx] * PX;
          targetY = snapshot.orgs.y[idx] * PX;
        }
      }
      if (now >= poiUntil || lostTarget) pickPOI(snapshot, now);

      const cam = app.camera();
      if (reduceMotion) {
        app.setCamera({ x: targetX, y: targetY, z: targetZ });
      } else {
        app.setCamera({
          x: cam.x + (targetX - cam.x) * GLIDE_RATE,
          y: cam.y + (targetY - cam.y) * GLIDE_RATE,
          z: cam.z + (targetZ - cam.z) * GLIDE_RATE,
        });
      }
    }

    const parts = clockParts(snapshot.tick, cfg);
    ui.idleTime.textContent = parts.time;
    ui.idleDay.textContent = `Year ${parts.year} · Day ${parts.day} · ${parts.season}`;
  }

  /**
   * @param {{ tick: number, text: string }[] | null} entries from a `chronicle` protocol event.
   * @returns {void}
   */
  function onChronicle(entries) {
    if (!entries || entries.length === 0) return;
    const newest = entries[entries.length - 1];
    ui.tickT.textContent = formatTag(newest.tick, cfg);
    ui.tickE.textContent = newest.text;
  }

  return {
    tick,
    onChronicle,
    caption: () => ({ kind: ui.capK.textContent ?? '', text: ui.capT.textContent ?? '' }),
    ui,
  };
}
