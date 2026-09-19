import { describe, it, expect } from 'vitest';
import { drawSprite, spriteColour } from '../../src/render/sprites.js';

const DIET_HERBIVORE = 0;
const DIET_CARNIVORE = 2;
const VISION_NOCTURNAL = 0;
const VISION_DIURNAL = 2;
const SOCIAL_BIT = 1 << 5;
const SICK_BIT = 1;

function flagsByte({
  diet = DIET_HERBIVORE,
  vision = VISION_DIURNAL,
  social = false,
  sick = false,
}) {
  return (sick ? SICK_BIT : 0) | (diet << 1) | (vision << 3) | (social ? SOCIAL_BIT : 0);
}

function org(overrides = {}) {
  return {
    size: 1,
    heading: 0,
    hue: 90,
    energyFrac: 128,
    ageFrac: 128,
    species: 0,
    flagsByte: flagsByte({}),
    ...overrides,
  };
}

/** A recording fake 2D context: only the calls sprites.js needs. */
function fakeCtx() {
  return {
    fillStyle: null,
    strokeStyle: null,
    calls: [],
    fillRect(x, y, w, h) {
      this.calls.push({ fillStyle: this.fillStyle, x, y, w, h });
    },
  };
}

describe('drawSprite', () => {
  it('a carnivore-class sprite draws spines and a herbivore does not', () => {
    const carn = fakeCtx();
    drawSprite(carn, org({ size: 2, flagsByte: flagsByte({ diet: DIET_CARNIVORE }) }), 1, 0, 0);
    // body + 2 side spines + 2 top spines (px = round(2*2)=4 >= 3) + eye = 6
    expect(carn.calls.length).toBeGreaterThan(3);

    const herb = fakeCtx();
    drawSprite(herb, org({ size: 2, flagsByte: flagsByte({ diet: DIET_HERBIVORE }) }), 1, 0, 0);
    // body + eye only = 2
    expect(herb.calls.length).toBe(2);
  });

  it('nocturnal eye is light, diurnal dark', () => {
    const noct = fakeCtx();
    drawSprite(noct, org({ flagsByte: flagsByte({ vision: VISION_NOCTURNAL }) }), 1, 0, 0);
    expect(noct.calls.at(-1).fillStyle).toBe('#f3efe0');

    const diurnal = fakeCtx();
    drawSprite(diurnal, org({ flagsByte: flagsByte({ vision: VISION_DIURNAL }) }), 1, 0, 0);
    expect(diurnal.calls.at(-1).fillStyle).toBe('#141a14');
  });

  it('social flag draws a tail', () => {
    const social = fakeCtx();
    drawSprite(social, org({ flagsByte: flagsByte({ social: true }) }), 1, 0, 0);
    // body + tail + eye = 3
    expect(social.calls.length).toBe(3);

    const noTail = fakeCtx();
    drawSprite(noTail, org({ flagsByte: flagsByte({ social: false }) }), 1, 0, 0);
    // body + eye = 2
    expect(noTail.calls.length).toBe(2);
  });

  it('sick draws the marker', () => {
    const sick = fakeCtx();
    drawSprite(sick, org({ flagsByte: flagsByte({ sick: true }) }), 1, 0, 0);
    expect(sick.calls.at(-1).fillStyle).toBe('rgba(150,80,200,.6)');

    const healthy = fakeCtx();
    drawSprite(healthy, org({ flagsByte: flagsByte({ sick: false }) }), 1, 0, 0);
    expect(healthy.calls.some((c) => c.fillStyle === 'rgba(150,80,200,.6)')).toBe(false);
  });

  it('all rects land on integer multiples of scale', () => {
    const scale = 3;
    const ctx = fakeCtx();
    drawSprite(
      ctx,
      org({ size: 2, flagsByte: flagsByte({ diet: DIET_CARNIVORE, sick: true }) }),
      scale,
      7.4,
      -2.9,
    );
    for (const c of ctx.calls) {
      expect(c.x % scale === 0).toBe(true);
      expect(c.y % scale === 0).toBe(true);
      expect(c.w % scale === 0).toBe(true);
      expect(c.h % scale === 0).toBe(true);
    }
  });
});

describe('spriteColour', () => {
  it('self mode: herbivore/omnivore vs carnivore saturation and lightness differ', () => {
    expect(
      spriteColour('self', org({ hue: 100, flagsByte: flagsByte({ diet: DIET_HERBIVORE }) })),
    ).toBe('hsl(100 55% 62%)');
    expect(
      spriteColour('self', org({ hue: 100, flagsByte: flagsByte({ diet: DIET_CARNIVORE }) })),
    ).toBe('hsl(100 65% 58%)');
  });

  it('species mode reads the hue from the species store', () => {
    const store = { hue: (id) => (id === 3 ? 210 : undefined) };
    expect(spriteColour('species', org({ species: 3, hue: 10 }), store)).toBe('hsl(210 55% 62%)');
  });

  it('energy and age modes vary with their fraction', () => {
    const low = spriteColour('energy', org({ energyFrac: 0 }));
    const high = spriteColour('energy', org({ energyFrac: 255 }));
    expect(low).not.toBe(high);

    const young = spriteColour('age', org({ ageFrac: 0 }));
    const old = spriteColour('age', org({ ageFrac: 255 }));
    expect(young).not.toBe(old);
  });
});
