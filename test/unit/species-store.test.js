import { describe, it, expect } from 'vitest';
import { SpeciesStore } from '../../src/ui/species-store.js';

describe('SpeciesStore', () => {
  it('apply merges deltas and keeps names', () => {
    const store = new SpeciesStore();
    store.apply({
      species: [
        { id: 0, name: 'Meadow Grazers', ancestor: -1, born: 0, died: -1, hue: 90, count: 50 },
        { id: 1, name: 'Rock Stalkers', ancestor: -1, born: 0, died: -1, hue: 10, count: 24 },
      ],
    });
    expect(store.name(0)).toBe('Meadow Grazers');
    expect(store.name(1)).toBe('Rock Stalkers');
    expect(store.list()).toHaveLength(2);

    // A delta touching only id 0 (e.g. it went extinct) leaves id 1 alone
    // and keeps id 0's name.
    store.apply({
      species: [
        { id: 0, name: 'Meadow Grazers', ancestor: -1, born: 0, died: 500, hue: 90, count: 0 },
      ],
    });
    expect(store.name(0)).toBe('Meadow Grazers');
    expect(store.byId.get(0).died).toBe(500);
    expect(store.name(1)).toBe('Rock Stalkers');
    expect(store.list()).toHaveLength(2);

    // A delta introducing a new id 2 (a split) adds it without disturbing 0/1.
    store.apply({
      species: [
        { id: 2, name: 'Meadow Grazers II', ancestor: 0, born: 600, died: -1, hue: 91, count: 1 },
      ],
    });
    expect(store.name(2)).toBe('Meadow Grazers II');
    expect(store.hue(2)).toBe(91);
    expect(store.list()).toHaveLength(3);
  });
});
