// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createPhylogenyPane } from '../../src/ui/station/phylogeny-pane.js';

/** A fake app exposing just the highlight contract phylogeny-pane.js needs. */
function fakeApp() {
  let highlight = null;
  return {
    getHighlightSpecies: () => highlight,
    setHighlightSpecies(id) {
      highlight = id;
    },
  };
}

function fakeSnap({ n, ancestor, born, died, count }) {
  return {
    tick: 1000,
    species: {
      n,
      ancestor: Int32Array.from(ancestor),
      born: Int32Array.from(born),
      died: Int32Array.from(died),
      count: Int32Array.from(count),
    },
  };
}

describe('createPhylogenyPane', () => {
  it('renders one line per species and a dashed link per ancestor', () => {
    const el = document.createElement('div');
    const app = fakeApp();
    const pane = createPhylogenyPane({ el, app });

    // 3 species: 0 is a founder (ancestor -1), 1 splits from 0, 2 splits from 0.
    const snap = fakeSnap({
      n: 3,
      ancestor: [-1, 0, 0],
      born: [0, 500, 700],
      died: [-1, -1, -1],
      count: [10, 5, 3],
    });
    pane.render(snap);

    const branches = el.querySelectorAll('line.branch');
    expect(branches).toHaveLength(3);
    const links = el.querySelectorAll('line.link');
    expect(links).toHaveLength(2); // species 1 and 2 each link to ancestor 0.
  });

  it('tapping a branch sets the highlight and tapping again clears it', () => {
    const el = document.createElement('div');
    const app = fakeApp();
    const pane = createPhylogenyPane({ el, app });

    const snap = fakeSnap({
      n: 2,
      ancestor: [-1, -1],
      born: [0, 0],
      died: [-1, -1],
      count: [1, 1],
    });
    pane.render(snap);

    const branch = el.querySelector('line[data-species-id="1"]');
    branch.dispatchEvent(new Event('click', { bubbles: true }));
    expect(app.getHighlightSpecies()).toBe(1);

    branch.dispatchEvent(new Event('click', { bubbles: true }));
    expect(app.getHighlightSpecies()).toBe(null);
  });

  it('does not redraw while hidden', () => {
    const el = document.createElement('div');
    const app = fakeApp();
    const pane = createPhylogenyPane({ el, app });

    const snap = fakeSnap({ n: 1, ancestor: [-1], born: [0], died: [-1], count: [1] });
    for (let i = 0; i < 20; i++) pane.update(snap);

    expect(el.querySelectorAll('line.branch')).toHaveLength(0);

    pane.setVisible(true);
    pane.update(snap);
    expect(el.querySelectorAll('line.branch')).toHaveLength(1);
  });
});
