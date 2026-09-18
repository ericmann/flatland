import { describe, it, expect } from 'vitest';
import { OrganismStore, HASH_ORDER, TRAIT_COUNT } from '../../src/core/organisms.js';

const GENOME_LENGTH = 10;

describe('OrganismStore.alloc', () => {
  it('returns the lowest free slot', () => {
    const store = new OrganismStore(5, GENOME_LENGTH);
    expect(store.alloc()).toBe(0);
    expect(store.alloc()).toBe(1);
    expect(store.alloc()).toBe(2);
  });

  it('returns -1 at capacity and count does not change', () => {
    const store = new OrganismStore(2, GENOME_LENGTH);
    store.alloc();
    store.alloc();
    expect(store.count).toBe(2);
    expect(store.alloc()).toBe(-1);
    expect(store.count).toBe(2);
  });

  it('ids are monotonic and never reused', () => {
    const store = new OrganismStore(4, GENOME_LENGTH);
    const a = store.alloc();
    const b = store.alloc();
    const idA = store.id[a];
    const idB = store.id[b];
    expect(idA).toBe(1);
    expect(idB).toBe(2);
    store.free(a);
    const c = store.alloc(); // reuses slot a
    expect(c).toBe(a);
    expect(store.id[c]).toBe(3); // new id, not idA reused
  });
});

describe('OrganismStore.free', () => {
  it('reuses the freed slot before any higher one', () => {
    const store = new OrganismStore(5, GENOME_LENGTH);
    store.alloc(); // 0
    const one = store.alloc(); // 1
    store.alloc(); // 2
    store.free(one);
    expect(store.alloc()).toBe(1);
  });
});

describe('OrganismStore.genomeOf', () => {
  it('is a view, not a copy', () => {
    const store = new OrganismStore(3, GENOME_LENGTH);
    const slot = store.alloc();
    const view = store.genomeOf(slot);
    expect(view.length).toBe(GENOME_LENGTH);
    view[0] = 0.75;
    expect(store.genome[slot * GENOME_LENGTH]).toBe(0.75);
    store.genome[slot * GENOME_LENGTH + 1] = 0.25;
    expect(view[1]).toBe(0.25);
  });
});

describe('OrganismStore.highWater', () => {
  it('never decreases and bounds every living slot', () => {
    const store = new OrganismStore(5, GENOME_LENGTH);
    const a = store.alloc();
    const b = store.alloc();
    const c = store.alloc();
    expect(store.highWater).toBe(3);
    store.free(b);
    expect(store.highWater).toBe(3); // does not shrink on free
    store.free(c);
    store.free(a);
    expect(store.highWater).toBe(3);
    const again = store.alloc();
    expect(again).toBeLessThan(store.highWater);
  });
});

describe('OrganismStore.slotOfId', () => {
  it('finds a living organism and returns -1 for a dead one', () => {
    const store = new OrganismStore(3, GENOME_LENGTH);
    const slot = store.alloc();
    const id = store.id[slot];
    expect(store.slotOfId(id)).toBe(slot);
    store.free(slot);
    expect(store.slotOfId(id)).toBe(-1);
  });

  it('returns -1 for an id that was never allocated', () => {
    const store = new OrganismStore(3, GENOME_LENGTH);
    expect(store.slotOfId(9999)).toBe(-1);
  });
});

describe('HASH_ORDER', () => {
  it('lists exactly the store arrays consumed by hash(), excluding pheno and derived arrays', () => {
    expect(HASH_ORDER).toEqual([
      'alive',
      'id',
      'x',
      'y',
      'heading',
      'energy',
      'body',
      'age',
      'species',
      'parent',
      'generation',
      'sick',
      'flags',
      'genome',
    ]);
  });

  it('every name in HASH_ORDER is a real typed-array field on the store', () => {
    const store = new OrganismStore(2, GENOME_LENGTH);
    for (const name of HASH_ORDER) {
      expect(ArrayBuffer.isView(store[name])).toBe(true);
    }
  });
});

describe('OrganismStore construction', () => {
  it('preallocates pheno and the derived per-slot arrays sized by capacity', () => {
    const store = new OrganismStore(7, GENOME_LENGTH);
    expect(store.pheno.length).toBe(7 * TRAIT_COUNT);
    expect(store.energyMax.length).toBe(7);
    expect(store.lifespanTicks.length).toBe(7);
    expect(store.maturityTicks.length).toBe(7);
    expect(store.breedEnergy.length).toBe(7);
  });
});
