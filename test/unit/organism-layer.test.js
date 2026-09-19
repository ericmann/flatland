import { describe, it, expect } from 'vitest';
import { drawOrganisms } from '../../src/render/organism-layer.js';

const DIET_HERBIVORE = 0;
const VISION_DIURNAL = 2;

/** A recording fake 2D context: only the calls organism-layer.js needs. */
function fakeCtx() {
  return {
    fillStyle: null,
    strokeStyle: null,
    lineWidth: null,
    fillCalls: [],
    strokeCalls: [],
    fillRect(x, y, w, h) {
      this.fillCalls.push({ fillStyle: this.fillStyle, x, y, w, h });
    },
    strokeRect(x, y, w, h) {
      this.strokeCalls.push({ strokeStyle: this.strokeStyle, x, y, w, h });
    },
  };
}

function flagsByte({
  diet = DIET_HERBIVORE,
  vision = VISION_DIURNAL,
  social = false,
  sick = false,
} = {}) {
  return (sick ? 1 : 0) | (diet << 1) | (vision << 3) | (social ? 1 << 5 : 0);
}

function fakeSnapshot(orgs) {
  return {
    orgs: {
      n: orgs.length,
      x: Float32Array.from(orgs.map((o) => o.x)),
      y: Float32Array.from(orgs.map((o) => o.y)),
      size: Float32Array.from(orgs.map((o) => o.size ?? 1)),
      hue: Float32Array.from(orgs.map((o) => o.hue ?? 0)),
      heading: Int8Array.from(orgs.map((o) => o.heading ?? 0)),
      flagsByte: Uint8Array.from(orgs.map((o) => o.flagsByte ?? flagsByte())),
      energyFrac: Uint8Array.from(orgs.map((o) => o.energyFrac ?? 128)),
      ageFrac: Uint8Array.from(orgs.map((o) => o.ageFrac ?? 128)),
      species: Int32Array.from(orgs.map((o) => o.species ?? 0)),
      id: Uint32Array.from(orgs.map((o, i) => o.id ?? i + 1)),
    },
  };
}

describe('organism-layer', () => {
  it('one fillRect body per living organism at x·4, y·4 with side clamp(round(size·2),1,5)', () => {
    const ctx = fakeCtx();
    const snap = fakeSnapshot([
      { x: 10, y: 5, size: 1.3, hue: 90 },
      { x: 2, y: 8, size: 0.7, hue: 200 },
    ]);
    drawOrganisms(ctx, snap, { colorMode: 'self' });

    // Each default (non-carnivore, non-social, non-sick) organism draws
    // exactly 2 rects: body, then eye.
    expect(ctx.fillCalls).toHaveLength(4);
    const bodies = [ctx.fillCalls[0], ctx.fillCalls[2]];
    const side0 = Math.round(1.3 * 2);
    expect(bodies[0]).toMatchObject({
      w: side0,
      h: side0,
      x: Math.round(10 * 4 - side0 / 2),
      y: Math.round(5 * 4 - side0 / 2),
    });
    const side1 = Math.round(0.7 * 2);
    expect(bodies[1]).toMatchObject({
      w: side1,
      h: side1,
      x: Math.round(2 * 4 - side1 / 2),
      y: Math.round(8 * 4 - side1 / 2),
    });
  });

  it('colour is derived from hue', () => {
    const ctx = fakeCtx();
    const snap = fakeSnapshot([{ x: 0, y: 0, size: 1, hue: 137 }]);
    drawOrganisms(ctx, snap, { colorMode: 'self' });
    expect(ctx.fillCalls[0].fillStyle).toBe('hsl(137 55% 62%)');
  });

  it('highlighted species get rings and the selected organism gets the sun ring', () => {
    const ctx = fakeCtx();
    const snap = fakeSnapshot([
      { x: 1, y: 1, species: 0, id: 11 },
      { x: 2, y: 2, species: 5, id: 22 },
      { x: 3, y: 3, species: 5, id: 33 },
    ]);
    drawOrganisms(ctx, snap, { colorMode: 'self', highlightSpecies: 5, selectedId: 22 });

    // Two members of species 5 get a white ring each.
    const whiteRings = ctx.strokeCalls.filter((c) => c.strokeStyle === '#fff');
    expect(whiteRings).toHaveLength(2);

    // The selected organism (id 22) gets exactly one sun-coloured ring.
    const sunRings = ctx.strokeCalls.filter((c) => c.strokeStyle === '#e3a83a');
    expect(sunRings).toHaveLength(1);
    expect(sunRings[0]).toMatchObject({ x: 2 * 4 - 4, y: 2 * 4 - 4, w: 8, h: 8 });
  });

  it('colour mode energy varies with energyFrac', () => {
    const ctx = fakeCtx();
    const snap = fakeSnapshot([
      { x: 0, y: 0, energyFrac: 0 },
      { x: 1, y: 1, energyFrac: 255 },
    ]);
    drawOrganisms(ctx, snap, { colorMode: 'energy' });
    // Each default organism draws body then eye; bodies are the first of each pair.
    expect(ctx.fillCalls).toHaveLength(4);
    expect(ctx.fillCalls[0].fillStyle).not.toBe(ctx.fillCalls[2].fillStyle);
  });
});
