/**
 * The inspector (SPEC §5.2, §10): the selected organism's record — a
 * portrait sprite, diet/generation, current goal, energy/age bars, vision,
 * the 17 live brain inputs, the genome radial glyph over 8 traits, family
 * lines and Follow/Close. Markup and ids from `docs/mockup.html`'s
 * `#insp`. On phones this is the `#insp.open` bottom sheet (P2-08's CSS).
 *
 * `update(snap)` is called every frame (like `idle.js`'s `tick`) with the
 * latest decoded snapshot; it reads `app.getSelectedId()`/`snap.selected`
 * rather than owning selection state itself (that's `app.js`'s, so the
 * rail/topbar/inspector are all thin views over the same source of truth).
 */
import { drawSprite } from '../../render/sprites.js';
import { TRAIT, dietClass, visionClass, traitValue, genomeLength } from '../../core/genome.js';
import { INPUT } from '../../core/senses.js';
import { OUTPUT } from '../../core/reflex.js';
import { exp } from '../../core/fmath.js';
import { clock } from '../../core/light.js';

/** World pixels per tile (matches `Renderer`'s default `px`, SPEC §6.5). */
const PX = 4;
/** How long "…died" stays before the inspector empties (PLAN.md P2-10). */
const DEAD_MESSAGE_MS = 3000;
/** Portrait sprite scale (mockup: a 24×24 canvas, `drawSprite` at 3×). */
const PORTRAIT_SCALE = 3;

/** The 8 traits the genome glyph shows, in the mockup's listed order. */
const GLYPH_TRAITS = [
  { trait: TRAIT.size, label: 'size' },
  { trait: TRAIT.speed, label: 'speed' },
  { trait: TRAIT.visionPeak, label: 'vision peak' },
  { trait: TRAIT.visionWidth, label: 'vision width' },
  { trait: TRAIT.boldness, label: 'boldness' },
  { trait: TRAIT.sociality, label: 'sociality' },
  { trait: TRAIT.metabolism, label: 'metabolism' },
  { trait: TRAIT.lifespan, label: 'lifespan' },
];

const DIET_LABEL = { herbivore: 'grazer', omnivore: 'omnivore', carnivore: 'hunter' };

/**
 * @param {{ el: HTMLElement, app: {
 *   getSelectedId: () => number | null,
 *   deselect: () => void,
 *   onSelectionChange: (cb: (id: number | null) => void) => (() => void),
 *   camera: () => import('../../render/camera.js').Camera,
 *   setCamera: (next: import('../../render/camera.js').Camera) => void,
 *   getLastInteractionAt: () => number,
 *   root?: HTMLElement,
 * }, cfg: typeof import('../../core/config.js').DEFAULTS, speciesStore?: { name: (id: number) => string|undefined } }} opts
 * @returns {{ el: HTMLElement, update: (snap: *) => void, detach: () => void }}
 */
export function createInspector({ el, app, cfg, speciesStore }) {
  el.innerHTML = `
    <div class="empty" id="inspEmpty"><h3>Inspector</h3>Click a creature on the map to open its record. Follow it until it dies, if you like.</div>
    <div id="inspBody" hidden>
      <div class="portrait">
        <canvas id="portrait" width="24" height="24"></canvas>
        <div class="who">
          <div class="name"><input id="specName" aria-label="Lineage name" spellcheck="false" disabled title="naming arrives in Phase 4"></div>
          <div class="sub"><span class="diet" id="diet">grazer</span> · <span id="gen">gen 1</span><br /><span id="goal"></span> · <span id="where"></span></div>
        </div>
      </div>
      <div class="kv">
        <span>energy</span><div class="bar"><i class="e" id="bEnergy"></i></div>
        <span>age</span><div class="bar"><i class="a" id="bAge"></i></div>
        <span>sees best at</span><b id="visPeak">–</b>
        <span>vision now</span><b id="visNow">–</b>
      </div>
      <div class="sec"><h3>Brain · inputs firing</h3><div class="brain" id="brain"></div></div>
      <div class="sec"><h3>Genome</h3><div class="glyph"><canvas id="glyph" width="220" height="220"></canvas>
        <ul>${GLYPH_TRAITS.map((t) => `<li>${t.label}</li>`).join('')}</ul></div></div>
      <div class="sec"><h3>Family</h3><div class="tree" id="family"></div></div>
      <div class="row"><button class="tbtn" id="follow">Follow</button><button class="tbtn" id="unsel">Close</button></div>
    </div>
  `;

  const inspEmpty = /** @type {HTMLElement} */ (el.querySelector('#inspEmpty'));
  const inspBody = /** @type {HTMLElement} */ (el.querySelector('#inspBody'));
  const portrait = /** @type {HTMLCanvasElement} */ (el.querySelector('#portrait'));
  const dietEl = /** @type {HTMLElement} */ (el.querySelector('#diet'));
  const genEl = /** @type {HTMLElement} */ (el.querySelector('#gen'));
  const goalEl = /** @type {HTMLElement} */ (el.querySelector('#goal'));
  const bEnergy = /** @type {HTMLElement} */ (el.querySelector('#bEnergy'));
  const bAge = /** @type {HTMLElement} */ (el.querySelector('#bAge'));
  const visPeakEl = /** @type {HTMLElement} */ (el.querySelector('#visPeak'));
  const visNowEl = /** @type {HTMLElement} */ (el.querySelector('#visNow'));
  const glyph = /** @type {HTMLCanvasElement} */ (el.querySelector('#glyph'));
  const familyEl = /** @type {HTMLElement} */ (el.querySelector('#family'));
  const followBtn = /** @type {HTMLButtonElement} */ (el.querySelector('#follow'));
  const closeBtn = /** @type {HTMLButtonElement} */ (el.querySelector('#unsel'));

  const brainEl = /** @type {HTMLElement} */ (el.querySelector('#brain'));
  const brainFills = /** @type {HTMLElement[]} */ (
    Object.keys(INPUT).map((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('i');
      bar.appendChild(fill);
      brainEl.append(span, bar);
      return fill;
    })
  );

  let following = false;
  /** performance.now() ms the camera last snapped to the organism, so a later manual pan can cancel Follow. */
  let followSetAt = -Infinity;
  /** performance.now() ms the selection was first found dead, or -1. */
  let deadSince = -1;
  let lastX = 0;
  let lastY = 0;

  /** @returns {void} */
  function showEmptyText() {
    inspEmpty.replaceChildren();
    const h3 = document.createElement('h3');
    h3.textContent = 'Inspector';
    inspEmpty.append(
      h3,
      document.createTextNode(
        'Click a creature on the map to open its record. Follow it until it dies, if you like.',
      ),
    );
    inspEmpty.hidden = false;
    inspBody.hidden = true;
  }

  /** @returns {void} */
  function showDeadText() {
    inspEmpty.replaceChildren();
    const h3 = document.createElement('h3');
    h3.textContent = 'Inspector';
    inspEmpty.append(h3, document.createTextNode('…died'));
    inspEmpty.hidden = false;
    inspBody.hidden = true;
  }

  /** @returns {void} */
  function showBody() {
    inspEmpty.hidden = true;
    inspBody.hidden = false;
  }

  followBtn.addEventListener('click', () => {
    following = true;
    followSetAt = performance.now();
    app.setCamera({ x: lastX, y: lastY, z: Math.max(app.camera().z, 4) });
  });

  closeBtn.addEventListener('click', () => {
    following = false;
    app.deselect();
  });

  app.onSelectionChange((id) => {
    following = false;
    deadSince = -1;
    // `.open` drives the phone bottom-sheet (P2-08's CSS: `#insp.open`).
    // `#app.insp-open` (on the root, a sibling's ancestor of `#hud`) is
    // how the phone media query raises the floating cluster so the sheet
    // doesn't cover it.
    el.classList.toggle('open', id != null);
    app.root?.classList.toggle('insp-open', id != null);
    if (id == null) showEmptyText();
  });

  /**
   * SPEC-consistent reading of "current goal" from this tick's outputs
   * (PLAN.md P2-10): eat first, then flee/hunt/forage/rest by throttle.
   * @param {{ eat: number, throttle: number, threatProx: number, foodMag: number, carn: boolean }} o
   * @returns {string}
   */
  function deriveGoal(o) {
    if (o.eat >= 0.5) return o.carn ? 'feeding' : 'grazing';
    if (o.throttle > 0.7 && o.threatProx > 0) return 'fleeing';
    if (o.throttle > 0.7 && o.foodMag > 0 && o.carn) return 'hunting';
    if (o.throttle > 0.3) return 'foraging';
    return 'resting';
  }

  /**
   * @param {*} snap a decoded snapshot
   * @returns {void}
   */
  function update(snap) {
    const selectedId = app.getSelectedId();
    if (selectedId == null) return;

    if (snap.selectedSlot === -1 || !snap.selected) {
      if (deadSince === -1) {
        deadSince = performance.now();
        showDeadText();
      } else if (performance.now() - deadSince > DEAD_MESSAGE_MS) {
        app.deselect();
      }
      return;
    }
    deadSince = -1;
    showBody();

    const rec = snap.selected;
    const gLen = genomeLength(cfg);
    let k = gLen;
    const inputs = rec.subarray(k, (k += 17));
    const outputs = rec.subarray(k, (k += 8));
    const energy = rec[k++];
    const energyMax = rec[k++];
    const age = rec[k++];
    const lifespanTicks = rec[k++];
    const x = rec[k++];
    const y = rec[k++];
    const heading = rec[k++];
    const speciesId = rec[k++];
    const generation = rec[k++];
    const parentId = rec[k++];
    const sickTicks = rec[k++];
    k += 1; // body is read but unused here.
    const offspring = rec[k++];
    const livingSiblings = rec[k++];
    const speciesCount = rec[k++];
    const speciesBorn = rec[k++];
    const speciesAncestor = rec[k];

    lastX = x * PX;
    lastY = y * PX;

    if (following && app.getLastInteractionAt() <= followSetAt) {
      app.setCamera({ x: lastX, y: lastY, z: Math.max(app.camera().z, 4) });
    } else if (following) {
      following = false; // a manual pan/zoom happened since Follow was set.
    }

    const diet = traitValue(cfg, rec[TRAIT.diet], TRAIT.diet);
    const cls = dietClass(diet);
    const carn = cls === 'carnivore';
    dietEl.textContent = DIET_LABEL[cls];
    genEl.textContent = `gen ${generation}`;

    const name = speciesStore?.name?.(speciesId);
    if (familyEl) {
      const ancestorName = speciesStore?.name?.(speciesAncestor) ?? '—';
      const born = clock(speciesBorn, cfg).text;
      familyEl.textContent =
        `${name ?? `lineage ${speciesId}`} ← ${ancestorName}\n` +
        `parent #${parentId} · ${livingSiblings} living siblings\n` +
        `${offspring} offspring · ${speciesCount} living kin · lineage born ${born}`;
    }

    goalEl.textContent = deriveGoal({
      eat: outputs[OUTPUT.eat],
      throttle: outputs[OUTPUT.throttle],
      threatProx: inputs[INPUT.threatProx],
      foodMag: inputs[INPUT.foodMag],
      carn,
    });

    bEnergy.style.width = `${Math.max(0, Math.min(100, (energy / energyMax) * 100))}%`;
    bAge.style.width = `${Math.max(0, Math.min(100, (age / lifespanTicks) * 100))}%`;

    const lambda = traitValue(cfg, rec[TRAIT.visionPeak], TRAIT.visionPeak);
    const sigma = traitValue(cfg, rec[TRAIT.visionWidth], TRAIT.visionWidth);
    visPeakEl.textContent = `${Math.round(lambda * 100)}% · ${visionClass(lambda)}`;
    const L = snap.light ?? 0;
    const dAcuity = (L - lambda) / sigma;
    const acuity = exp(-(dAcuity * dAcuity));
    visNowEl.textContent = `${Math.round(acuity * 100)}%`;

    for (let i = 0; i < brainFills.length; i++) {
      const v = Math.max(0, Math.min(1, (inputs[i] + 1) / 2));
      brainFills[i].style.width = `${v * 100}%`;
    }

    const portraitCtx = portrait.getContext('2d');
    if (portraitCtx) {
      const dietCode = cls === 'herbivore' ? 0 : cls === 'omnivore' ? 1 : 2;
      const visionCode = { nocturnal: 0, crepuscular: 1, diurnal: 2 }[visionClass(lambda)];
      const social = traitValue(cfg, rec[TRAIT.sociality], TRAIT.sociality) > 0.6;
      const flagsByte =
        (sickTicks > 0 ? 1 : 0) | (dietCode << 1) | (visionCode << 3) | (social ? 1 << 5 : 0);

      portraitCtx.clearRect(0, 0, portrait.width, portrait.height);
      drawSprite(
        portraitCtx,
        {
          size: traitValue(cfg, rec[TRAIT.size], TRAIT.size),
          heading,
          flagsByte,
          hue: traitValue(cfg, rec[TRAIT.hue], TRAIT.hue),
          energyFrac: Math.round((energy / energyMax) * 255),
          ageFrac: Math.round((age / lifespanTicks) * 255),
          species: speciesId,
        },
        PORTRAIT_SCALE,
        portrait.width / 2,
        portrait.height / 2,
      );
    }

    const glyphCtx = glyph.getContext('2d');
    if (glyphCtx) {
      glyphCtx.clearRect(0, 0, glyph.width, glyph.height);
      const cx = glyph.width / 2;
      const cy = glyph.height / 2;
      const radius = Math.min(cx, cy) - 10;
      glyphCtx.strokeStyle = '#3a4d40';
      glyphCtx.beginPath();
      for (let i = 0; i < GLYPH_TRAITS.length; i++) {
        const angle = (i / GLYPH_TRAITS.length) * Math.PI * 2 - Math.PI / 2;
        const value = rec[GLYPH_TRAITS[i].trait];
        const r = radius * Math.max(0, Math.min(1, value));
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) glyphCtx.moveTo(px, py);
        else glyphCtx.lineTo(px, py);
      }
      glyphCtx.closePath();
      glyphCtx.fillStyle = 'rgba(227,168,58,0.35)';
      glyphCtx.fill();
      glyphCtx.stroke();
    }
  }

  showEmptyText();

  return {
    el,
    update,
    detach() {
      // No document-level listeners of its own to remove; app.js owns those.
    },
  };
}
