import { describe, it, expect } from 'vitest';
import { Chronicle, KIND, sentence, deathVerb } from '../../src/core/chronicle.js';
import { makeWorld } from '../helpers.js';

describe('genesis chronicle entry', () => {
  it('exists at tick 0 with kind genesis and a place', () => {
    const world = makeWorld({ seed: 5 });
    expect(world.chronicle.entries.length).toBeGreaterThanOrEqual(1);
    const entry = world.chronicle.entries[0];
    expect(entry.tick).toBe(0);
    expect(entry.kind).toBe(KIND.GENESIS);
    expect(typeof entry.place).toBe('string');
    expect(entry.place.length).toBeGreaterThan(0);
    expect(entry.text).toMatch(/^Genesis\. \d+ lineages seeded: .+\.$/);
  });

  it('genesis lists lineage names', () => {
    const world = makeWorld({ seed: 5 });
    const entry = world.chronicle.entries[0];
    for (const name of world.species.names) {
      expect(entry.text).toContain(name);
    }
    expect(world.species.names.length).toBe(
      world.cfg.genesis.herbivoreLineages + world.cfg.genesis.carnivoreLineages,
    );
  });
});

describe('sentence (P2-04)', () => {
  it('split and extinct sentences name both lineages and a place', () => {
    const split = sentence(KIND.SPLIT, {
      name: 'Meadow Grazers II',
      parent: 'Meadow Grazers',
      place: 'the northern meadow',
    });
    expect(split).toContain('Meadow Grazers II');
    expect(split).toContain('Meadow Grazers');
    expect(split).toContain('the northern meadow');

    const extinct = sentence(KIND.EXTINCT, {
      name: 'Rock Stalkers',
      verb: deathVerb(1), // DEATH.STARVED
      place: 'the eastern rocks',
    });
    expect(extinct).toContain('Rock Stalkers');
    expect(extinct).toContain('starved');
    expect(extinct).toContain('the eastern rocks');
  });
});

describe('Chronicle', () => {
  it('flush returns only new entries and then null', () => {
    const c = new Chronicle();
    expect(c.flush()).toBeNull();
    c.add(0, KIND.GENESIS, 'a', 'place a');
    c.add(1, KIND.SPLIT, 'b', 'place b');
    const first = c.flush();
    expect(first).not.toBeNull();
    expect(first.map((e) => e.text)).toEqual(['a', 'b']);
    expect(c.flush()).toBeNull();
    c.add(2, KIND.EXTINCT, 'c', 'place c');
    const second = c.flush();
    expect(second.map((e) => e.text)).toEqual(['c']);
    expect(c.flush()).toBeNull();
  });

  it('entries are append-only and ordered by tick', () => {
    const c = new Chronicle();
    c.add(5, KIND.GENESIS, 'a', 'x');
    c.add(10, KIND.SPLIT, 'b', 'y');
    c.add(20, KIND.EXTINCT, 'c', 'z');
    expect(c.entries.map((e) => e.tick)).toEqual([5, 10, 20]);
    expect(c.entries.length).toBe(3);
    // flush() does not remove or mutate entries.
    c.flush();
    expect(c.entries.length).toBe(3);
    expect(c.entries[0].text).toBe('a');
  });

  it('add() defaults subjects to an empty array', () => {
    const c = new Chronicle();
    c.add(0, KIND.GENESIS, 'a', 'x');
    expect(c.entries[0].subjects).toEqual([]);
  });
});
