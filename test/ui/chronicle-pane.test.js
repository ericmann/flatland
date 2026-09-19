// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createChroniclePane } from '../../src/ui/station/chronicle-pane.js';
import { makeConfig } from '../../src/core/config.js';

const cfg = makeConfig({});

describe('createChroniclePane', () => {
  it('renders entries newest first with time tags and kind classes', () => {
    const el = document.createElement('div');
    const pane = createChroniclePane({ el, cfg });

    pane.addEntries([
      { tick: 100, kind: 'split', text: 'A new lineage splits.' },
      { tick: 200, kind: 'extinct', text: 'They are extinct.' },
    ]);

    expect(pane.rows.children).toHaveLength(2);
    // Newest (tick 200) is first.
    expect(pane.rows.children[0].textContent).toContain('They are extinct.');
    expect(pane.rows.children[0].classList.contains('ext')).toBe(true);
    expect(pane.rows.children[1].textContent).toContain('A new lineage splits.');
    expect(pane.rows.children[1].classList.contains('spl')).toBe(true);
    expect(pane.rows.children[0].querySelector('.t')).toBeTruthy();
  });

  it('a kind with no CSS mapping gets no extra class', () => {
    const el = document.createElement('div');
    const pane = createChroniclePane({ el, cfg });
    pane.addEntries([{ tick: 0, kind: 'genesis', text: 'The world begins.' }]);
    expect(pane.rows.children[0].className).toBe('');
  });

  it('caps the DOM at 500 rows', () => {
    const el = document.createElement('div');
    const pane = createChroniclePane({ el, cfg });

    const entries = [];
    for (let i = 0; i < 600; i++) {
      entries.push({ tick: i, kind: 'first', text: `event ${i}` });
    }
    pane.addEntries(entries);

    expect(pane.rows.children).toHaveLength(500);
    // Newest (599) survives, oldest (0..99) are dropped.
    expect(pane.rows.children[0].textContent).toContain('event 599');
    expect(pane.rows.children[499].textContent).toContain('event 100');
  });

  it('filter chips hide entries of other kinds', () => {
    const el = document.createElement('div');
    const pane = createChroniclePane({ el, cfg });
    pane.addEntries([
      { tick: 1, kind: 'split', text: 'A lineage splits.' },
      { tick: 2, kind: 'hunt-summary', text: 'A hunt.' },
      { tick: 3, kind: 'famine', text: 'A famine.' },
      { tick: 4, kind: 'intervention', text: 'A bolt of lightning.' },
      { tick: 5, kind: 'naming', text: 'A rename.' }, // not in any named filter category
    ]);

    function visibleKinds() {
      return Array.from(pane.rows.children)
        .filter((row) => row.style.display !== 'none')
        .map((row) => row.dataset.kind);
    }

    // All: everything visible.
    expect(visibleKinds().sort()).toEqual(
      ['split', 'hunt-summary', 'famine', 'intervention', 'naming'].sort(),
    );

    el.querySelector('[data-filter="lineages"]').dispatchEvent(
      new Event('click', { bubbles: true }),
    );
    expect(visibleKinds()).toEqual(['split']);

    el.querySelector('[data-filter="hunts"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(visibleKinds()).toEqual(['hunt-summary']);

    el.querySelector('[data-filter="world"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(visibleKinds()).toEqual(['famine']);

    el.querySelector('[data-filter="hand"]').dispatchEvent(new Event('click', { bubbles: true }));
    expect(visibleKinds()).toEqual(['intervention']);

    // A newly added row respects the currently active filter.
    pane.addEntries([{ tick: 6, kind: 'split', text: 'Another split.' }]);
    expect(visibleKinds()).toEqual(['intervention']);
  });
});
