// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createDock } from '../../src/ui/station/dock.js';

describe('createDock', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('tabs switch panes and only one pane is on', () => {
    const el = document.createElement('footer');
    document.body.appendChild(el);
    const dock = createDock({ el });

    const onTabs = () =>
      Array.from(el.querySelectorAll('[data-pane]')).filter((t) => t.classList.contains('on'));
    const onPanes = () => Object.values(dock.panes).filter((p) => p.classList.contains('on'));

    expect(onTabs()).toHaveLength(1);
    expect(onTabs()[0].dataset.pane).toBe('chron');
    expect(onPanes()).toHaveLength(1);
    expect(onPanes()[0].id).toBe('chron');

    el.querySelector('[data-pane="phylo"]').dispatchEvent(new Event('click', { bubbles: true }));

    expect(onTabs()).toHaveLength(1);
    expect(onTabs()[0].dataset.pane).toBe('phylo');
    expect(onPanes()).toHaveLength(1);
    expect(onPanes()[0].id).toBe('phylo');
  });

  it('notifies subscribers of the active pane', () => {
    const el = document.createElement('footer');
    const dock = createDock({ el });
    const seen = [];
    dock.onPaneChange((name) => seen.push(name));

    dock.activate('god');
    expect(seen).toEqual(['god']);
  });
});
