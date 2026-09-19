/**
 * Procedural pixel sprites (SPEC §5.5): body size from the `size` trait,
 * colour by mode, an eye pixel keyed to vision class and heading, spines
 * for the carnivore diet class, a tail for the social flag, and a sick
 * marker. Shared by the world layer (`organism-layer.js`, `scale = 1`)
 * and the inspector portrait (P2-10, a larger `scale`) so both read the
 * same `flagsByte` bit layout (SPEC §6.4) off a decoded snapshot.
 *
 * Interpretation: SPEC §5.5 says "drawn at integer pixel scales only".
 * The mockup's `drawSprite` only rounds the body origin to the nearest
 * integer, which does not guarantee every accessory pixel (spines, tail,
 * eye, sick bar — each offset by whole multiples of `scale` from the
 * body origin) lands on a multiple of `scale` when `scale > 1`. This
 * implementation instead snaps the body origin to the nearest multiple
 * of `scale`, so every rect drawn — body, spines, tail, eye, sick bar —
 * has `x`, `y`, `w` and `h` all exact multiples of `scale`. At `scale = 1`
 * (the world layer) this is identical to plain rounding.
 */

const DIET_MASK = 0b0000_0110; // bits 1-2 of flagsByte
const DIET_SHIFT = 1;
const DIET_CARNIVORE = 2;
const VISION_MASK = 0b0001_1000; // bits 3-4 of flagsByte
const VISION_SHIFT = 3;
const VISION_NOCTURNAL = 0;
const SOCIAL_BIT = 1 << 5;
const SICK_BIT = 1;

/**
 * @param {number} flagsByte
 * @returns {number}
 */
function dietCodeOf(flagsByte) {
  return (flagsByte & DIET_MASK) >> DIET_SHIFT;
}

/**
 * @param {number} flagsByte
 * @returns {number}
 */
function visionCodeOf(flagsByte) {
  return (flagsByte & VISION_MASK) >> VISION_SHIFT;
}

/**
 * The fill colour for one organism under a colour mode (SPEC §5.5).
 * @param {'self'|'species'|'energy'|'age'} mode
 * @param {{ hue: number, flagsByte: number, energyFrac: number, ageFrac: number, species: number }} org
 * @param {{ hue: (id: number) => number|undefined }} [speciesStore]
 * @returns {string}
 */
export function spriteColour(mode, org, speciesStore) {
  switch (mode) {
    case 'species': {
      const hue = speciesStore?.hue(org.species) ?? org.hue;
      return `hsl(${hue} 55% 62%)`;
    }
    case 'energy': {
      const e = org.energyFrac / 255;
      return `hsl(${35 + e * 10} ${40 + e * 60}% ${28 + e * 40}%)`;
    }
    case 'age': {
      const a = org.ageFrac / 255;
      return `hsl(90 8% ${95 - a * 60}%)`;
    }
    default: {
      const carn = dietCodeOf(org.flagsByte) === DIET_CARNIVORE;
      return carn ? `hsl(${org.hue} 65% 58%)` : `hsl(${org.hue} 55% 62%)`;
    }
  }
}

/**
 * Draw one organism sprite centred at `(ox, oy)`, `scale` device pixels
 * per sprite pixel (SPEC §5.5, mockup `drawSprite`).
 * @param {CanvasRenderingContext2D | *} g
 * @param {{ size: number, heading: number, flagsByte: number, hue: number, energyFrac: number, ageFrac: number, species: number }} org
 * @param {number} scale
 * @param {number} ox
 * @param {number} oy
 * @param {{ colorMode?: 'self'|'species'|'energy'|'age', speciesStore?: * }} [opts]
 * @returns {void}
 */
export function drawSprite(g, org, scale, ox, oy, opts = {}) {
  const px = Math.min(5, Math.max(1, Math.round(org.size * 2))) * scale;
  const x = Math.round((ox - px / 2) / scale) * scale;
  const y = Math.round((oy - px / 2) / scale) * scale;

  g.fillStyle = spriteColour(opts.colorMode ?? 'self', org, opts.speciesStore);
  g.fillRect(x, y, px, px);

  const carn = dietCodeOf(org.flagsByte) === DIET_CARNIVORE;
  const social = (org.flagsByte & SOCIAL_BIT) !== 0;

  if (carn) {
    g.fillRect(x - scale, y + scale, scale, scale);
    g.fillRect(x + px, y + scale, scale, scale);
    if (px >= 3 * scale) {
      g.fillRect(x + scale, y - scale, scale, scale);
      g.fillRect(x + px - 2 * scale, y - scale, scale, scale);
    }
  } else if (social) {
    g.fillRect(x + px, y + px - scale, scale, scale);
  }

  const nocturnal = visionCodeOf(org.flagsByte) === VISION_NOCTURNAL;
  g.fillStyle = nocturnal ? '#f3efe0' : '#141a14';
  const heading = (org.heading / 127) * Math.PI;
  const ex = x + (Math.cos(heading) > 0 ? px - scale : 0);
  const ey = y + Math.round(px / 4 / scale) * scale;
  g.fillRect(ex, ey, scale, scale);

  if ((org.flagsByte & SICK_BIT) !== 0) {
    g.fillStyle = 'rgba(150,80,200,.6)';
    g.fillRect(x, y, px, scale);
  }
}
