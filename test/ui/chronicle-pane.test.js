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

    expect(el.children).toHaveLength(2);
    // Newest (tick 200) is first.
    expect(el.children[0].textContent).toContain('They are extinct.');
    expect(el.children[0].classList.contains('ext')).toBe(true);
    expect(el.children[1].textContent).toContain('A new lineage splits.');
    expect(el.children[1].classList.contains('spl')).toBe(true);
    expect(el.children[0].querySelector('.t')).toBeTruthy();
  });

  it('a kind with no CSS mapping gets no extra class', () => {
    const el = document.createElement('div');
    const pane = createChroniclePane({ el, cfg });
    pane.addEntries([{ tick: 0, kind: 'genesis', text: 'The world begins.' }]);
    expect(el.children[0].className).toBe('');
  });

  it('caps the DOM at 500 rows', () => {
    const el = document.createElement('div');
    const pane = createChroniclePane({ el, cfg });

    const entries = [];
    for (let i = 0; i < 600; i++) {
      entries.push({ tick: i, kind: 'first', text: `event ${i}` });
    }
    pane.addEntries(entries);

    expect(el.children).toHaveLength(500);
    // Newest (599) survives, oldest (0..99) are dropped.
    expect(el.children[0].textContent).toContain('event 599');
    expect(el.children[499].textContent).toContain('event 100');
  });
});
