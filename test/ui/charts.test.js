// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createCharts,
  paintPopulation,
  paintDiversity,
  paintFlows,
} from '../../src/ui/station/charts.js';

/** A recording fake 2D context: only the calls charts.js needs. */
function fakeCtx() {
  return {
    strokeStyle: null,
    fillStyle: null,
    lineWidth: null,
    font: null,
    calls: [],
    beginPath() {
      this.calls.push({ op: 'beginPath' });
    },
    moveTo(x, y) {
      this.calls.push({ op: 'moveTo', x, y });
    },
    lineTo(x, y) {
      this.calls.push({ op: 'lineTo', x, y });
    },
    closePath() {
      this.calls.push({ op: 'closePath' });
    },
    stroke() {
      this.calls.push({ op: 'stroke', strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
    },
    fill() {
      this.calls.push({ op: 'fill', fillStyle: this.fillStyle });
    },
    fillRect(x, y, w, h) {
      this.calls.push({ op: 'fillRect', x, y, w, h, fillStyle: this.fillStyle });
    },
    fillText(text, x, y) {
      this.calls.push({ op: 'fillText', text, x, y });
    },
  };
}

describe('paintPopulation', () => {
  it('draws one polyline per species', () => {
    const ctx = fakeCtx();
    const history = [
      {
        species: [
          [0, 5],
          [1, 2],
        ],
      },
      {
        species: [
          [0, 8],
          [1, 0],
        ],
      },
    ];
    const speciesStore = { hue: (id) => (id === 0 ? 90 : 200) };

    paintPopulation(ctx, 100, 50, history, speciesStore);

    const strokes = ctx.calls.filter((c) => c.op === 'stroke');
    // 4 grid lines + one stroke per species (2).
    expect(strokes.length).toBeGreaterThanOrEqual(2);
    const hues = strokes.map((s) => s.strokeStyle).filter((s) => s && s.startsWith('hsl'));
    expect(hues).toContain('hsl(90 55% 62%)');
    expect(hues).toContain('hsl(200 55% 62%)');
    // Species 1's last count is 0 (extinct): drawn thinner.
    const thin = strokes.find((s) => s.strokeStyle === 'hsl(200 55% 62%)');
    expect(thin.lineWidth).toBe(1);
    const thick = strokes.find((s) => s.strokeStyle === 'hsl(90 55% 62%)');
    expect(thick.lineWidth).toBe(1.6);
  });
});

describe('paintDiversity', () => {
  it('draws the light area under the diversity line', () => {
    const ctx = fakeCtx();
    const history = [
      { light: 0.2, diversity: 1.0 },
      { light: 0.8, diversity: 1.5 },
    ];

    paintDiversity(ctx, 100, 50, history);

    const fills = ctx.calls.filter((c) => c.op === 'fill');
    expect(fills).toHaveLength(1);
    expect(fills[0].fillStyle).toBe('rgba(227,168,58,.14)');

    const strokes = ctx.calls.filter((c) => c.op === 'stroke');
    const diversityStroke = strokes.find((s) => s.strokeStyle === '#7fbb6a');
    expect(diversityStroke).toBeDefined();
    expect(diversityStroke.lineWidth).toBe(1.6);

    const label = ctx.calls.find((c) => c.op === 'fillText');
    expect(label.text).toBe('H = 1.50');
  });
});

describe('paintFlows', () => {
  it('draws six stacked areas with a legend', () => {
    const ctx = fakeCtx();
    const history = [
      {
        flows: {
          photosynthesis: 10,
          grazing: 4,
          predation: 2,
          scavenging: 1,
          decay: 3,
          metabolism: 5,
        },
      },
      {
        flows: {
          photosynthesis: 8,
          grazing: 5,
          predation: 1,
          scavenging: 2,
          decay: 2,
          metabolism: 6,
        },
      },
    ];

    paintFlows(ctx, 100, 50, history);

    const fills = ctx.calls.filter((c) => c.op === 'fill');
    // One stacked area per flow key (6).
    expect(fills).toHaveLength(6);
    const fillColors = new Set(fills.map((f) => f.fillStyle));
    expect(fillColors.size).toBe(6);

    const swatches = ctx.calls.filter((c) => c.op === 'fillRect');
    expect(swatches).toHaveLength(6);
    const swatchColors = new Set(swatches.map((s) => s.fillStyle));
    expect(swatchColors).toEqual(fillColors);

    const labels = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.text);
    for (const name of [
      'Photosynthesis',
      'Grazing',
      'Predation',
      'Scavenging',
      'Decay',
      'Metabolism',
    ]) {
      expect(labels).toContain(name);
    }
  });

  it('draws nothing but the grid for an empty history', () => {
    const ctx = fakeCtx();
    paintFlows(ctx, 100, 50, []);
    expect(ctx.calls.some((c) => c.op === 'fill')).toBe(false);
    expect(ctx.calls.some((c) => c.op === 'fillRect')).toBe(false);
  });
});

describe('createCharts', () => {
  function withVisibleCanvases(fn) {
    // jsdom's getBoundingClientRect returns all-zero by default, so
    // createCharts's real-canvas sizing would otherwise always no-op.
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 100, height: 50, top: 0, left: 0, right: 0, bottom: 0 });
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
  }

  it('does not draw while the pane is hidden or when data is unchanged', () => {
    withVisibleCanvases(() => {
      const el = document.createElement('div');
      const charts = createCharts({ el });
      const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

      // Hidden: recording the sample must not touch the canvas context.
      charts.update({ tick: 100, light: 0.5, diversity: 1.2, species: [[0, 3]] });
      expect(getContextSpy).not.toHaveBeenCalled();

      charts.setVisible(true);
      const callsAfterVisible = getContextSpy.mock.calls.length;
      expect(callsAfterVisible).toBeGreaterThan(0); // becoming visible draws once.

      // Same tick again: unchanged data, no redraw.
      charts.update({ tick: 100, light: 0.5, diversity: 1.2, species: [[0, 3]] });
      expect(getContextSpy.mock.calls.length).toBe(callsAfterVisible);

      // A new tick: redraws.
      charts.update({ tick: 101, light: 0.5, diversity: 1.2, species: [[0, 3]] });
      expect(getContextSpy.mock.calls.length).toBeGreaterThan(callsAfterVisible);

      getContextSpy.mockRestore();
    });
  });
});
