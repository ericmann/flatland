import { describe, it, expect } from 'vitest';
import { Grid } from '../../src/core/grid.js';
import { OrganismStore } from '../../src/core/organisms.js';

const GENOME_LENGTH = 4;

/**
 * @param {number} capacity
 * @param {Array<{x: number, y: number}>} positions
 * @returns {OrganismStore}
 */
function storeWith(capacity, positions) {
  const store = new OrganismStore(capacity, GENOME_LENGTH);
  for (const { x, y } of positions) {
    const slot = store.alloc();
    store.x[slot] = x;
    store.y[slot] = y;
  }
  return store;
}

describe('Grid.rebuild', () => {
  it('places every living slot in exactly one cell, in slot order within the cell', () => {
    const w = 32;
    const h = 32;
    const cell = 8;
    const positions = [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 9, y: 1 },
      { x: 1, y: 9 },
      { x: 2, y: 1 },
    ];
    const store = storeWith(10, positions);
    const grid = new Grid(w, h, cell, 10);
    grid.rebuild(store);

    // Slots 0, 1, 4 land in cell (0,0); slot 2 in cell (1,0); slot 3 in cell (0,1).
    const cellsX = Math.ceil(w / cell);
    const cell00 = 0 * cellsX + 0;
    const cell10 = 0 * cellsX + 1;
    const cell01 = 1 * cellsX + 0;

    const itemsIn = (c) =>
      Array.from(grid.items.subarray(grid.cellStart[c], grid.cellStart[c + 1]));
    expect(itemsIn(cell00)).toEqual([0, 1, 4]);
    expect(itemsIn(cell10)).toEqual([2]);
    expect(itemsIn(cell01)).toEqual([3]);

    // Every slot appears exactly once across all cells.
    const seen = new Set();
    for (let c = 0; c < grid.cellCount.length; c++) {
      for (const slot of itemsIn(c)) {
        expect(seen.has(slot)).toBe(false);
        seen.add(slot);
      }
    }
    expect(seen.size).toBe(positions.length);
  });

  it('excludes dead slots', () => {
    const store = storeWith(5, [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    store.free(1);
    const grid = new Grid(16, 16, 8, 5);
    grid.rebuild(store);
    const out = new Int32Array(5);
    const n = grid.queryRange(8, 8, 8, out);
    const found = Array.from(out.subarray(0, n)).sort();
    expect(found).toEqual([0, 2]);
  });
});

describe('Grid.queryRange', () => {
  it('finds every slot within r (no false negatives)', () => {
    const w = 64;
    const h = 64;
    const cell = 8;
    /** @type {{x:number,y:number}[]} */
    const positions = [];
    // A deterministic pseudo-random-looking spread without using Math.random.
    for (let k = 0; k < 40; k++) {
      positions.push({ x: (k * 13) % w, y: (k * 29) % h });
    }
    const store = storeWith(positions.length, positions);
    const grid = new Grid(w, h, cell, positions.length);
    grid.rebuild(store);

    const cx = 30;
    const cy = 30;
    const r = 15;
    const out = new Int32Array(positions.length);
    const n = grid.queryRange(cx, cy, r, out);
    const found = new Set(Array.from(out.subarray(0, n)));

    for (let i = 0; i < positions.length; i++) {
      const dx = positions[i].x - cx;
      const dy = positions[i].y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= r) {
        expect(found.has(i)).toBe(true);
      }
    }
  });

  it('never returns a slot much farther than r + cellSize*sqrt(2) for non-adversarial queries', () => {
    const w = 64;
    const h = 64;
    const cell = 8;
    const positions = [];
    for (let k = 0; k < 60; k++) {
      positions.push({ x: (k * 17.3) % w, y: (k * 7.7) % h });
    }
    const store = storeWith(positions.length, positions);
    const grid = new Grid(w, h, cell, positions.length);
    grid.rebuild(store);
    const out = new Int32Array(positions.length);

    const bound = 15 + cell * Math.SQRT2;
    for (const [cx, cy] of [
      [10.5, 10.5],
      [30.2, 5.1],
      [50, 50],
      [0.5, 63.5],
    ]) {
      const n = grid.queryRange(cx, cy, 15, out);
      for (let k = 0; k < n; k++) {
        const slot = out[k];
        const dx = positions[slot].x - cx;
        const dy = positions[slot].y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeLessThanOrEqual(bound + 1e-6);
      }
    }
  });
});
