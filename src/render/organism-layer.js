/**
 * Organism rendering (SPEC §6.5): a procedural sprite per living organism,
 * read from a decoded snapshot's compact SoA, then species-highlight rings
 * and the selected-organism sun ring (SPEC §5.2). Testable in node with a
 * plain recording fake 2D context — no real canvas needed.
 */
import { drawSprite } from './sprites.js';

/** World pixels per tile (matches `Renderer`'s default `px`, SPEC §6.5). */
const PX = 4;

/** The sun accent colour used for the selected-organism ring (SPEC §5.5 palette). */
const SUN_RING_COLOR = '#e3a83a';
const HIGHLIGHT_RING_COLOR = '#fff';

/**
 * Draw every living organism in `snap` as a sprite, then white rings
 * around any member of `highlightSpecies`, then the sun-coloured ring
 * around `selectedId` (drawn last so it is never occluded).
 * @param {CanvasRenderingContext2D | *} ctx
 * @param {*} snap a decoded snapshot (`decodeSnapshot()`'s return value)
 * @param {{ colorMode?: 'self'|'species'|'energy'|'age', speciesStore?: *, highlightSpecies?: number, selectedId?: number }} [opts]
 * @returns {void}
 */
export function drawOrganisms(ctx, snap, opts = {}) {
  const { colorMode = 'self', speciesStore, highlightSpecies, selectedId } = opts;
  const { orgs } = snap;

  for (let i = 0; i < orgs.n; i++) {
    const org = {
      size: orgs.size[i],
      heading: orgs.heading[i],
      flagsByte: orgs.flagsByte[i],
      hue: orgs.hue[i],
      energyFrac: orgs.energyFrac[i],
      ageFrac: orgs.ageFrac[i],
      species: orgs.species[i],
    };
    drawSprite(ctx, org, 1, orgs.x[i] * PX, orgs.y[i] * PX, { colorMode, speciesStore });
  }

  if (highlightSpecies != null) {
    ctx.strokeStyle = HIGHLIGHT_RING_COLOR;
    ctx.lineWidth = 1;
    for (let i = 0; i < orgs.n; i++) {
      if (orgs.species[i] !== highlightSpecies) continue;
      const cx = orgs.x[i] * PX;
      const cy = orgs.y[i] * PX;
      ctx.strokeRect(cx - 4, cy - 4, 8, 8);
    }
  }

  if (selectedId != null) {
    for (let i = 0; i < orgs.n; i++) {
      if (orgs.id[i] !== selectedId) continue;
      ctx.strokeStyle = SUN_RING_COLOR;
      ctx.lineWidth = 1;
      const cx = orgs.x[i] * PX;
      const cy = orgs.y[i] * PX;
      ctx.strokeRect(cx - 4, cy - 4, 8, 8);
      break;
    }
  }
}
