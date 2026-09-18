/**
 * The per-tick spatial hash (SPEC §6.3): a counting-sort bucket grid over
 * organism positions, rebuilt once per tick and queried many times by
 * senses (P1-05) and later mechanics.
 *
 * Determinism (SPEC §3.1, §6.3): cells are scanned in row-major order;
 * within a cell, items are in slot order (the counting-sort placement
 * pass iterates slots ascending). No allocation in `rebuild` or
 * `queryRange` beyond what the constructor preallocates.
 */

export class Grid {
  /**
   * @param {number} w world width in tiles
   * @param {number} h world height in tiles
   * @param {number} cell cell size in tiles
   * @param {number} capacity max number of organisms (sizes `items`)
   */
  constructor(w, h, cell, capacity) {
    this.w = w;
    this.h = h;
    this.cell = cell;
    this.cellsX = Math.ceil(w / cell);
    this.cellsY = Math.ceil(h / cell);
    const numCells = this.cellsX * this.cellsY;
    this.cellCount = new Int32Array(numCells);
    /** Prefix-sum start offsets into `items`, one extra trailing entry = total count. */
    this.cellStart = new Int32Array(numCells + 1);
    this.items = new Int32Array(capacity);
    /** Scratch write cursor per cell, reused every rebuild (no allocation). */
    this._cursor = new Int32Array(numCells);
  }

  /**
   * The cell index for a world position, clamped inside the grid.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  _cellIndex(x, y) {
    const cx = Math.min(this.cellsX - 1, Math.max(0, Math.floor(x / this.cell)));
    const cy = Math.min(this.cellsY - 1, Math.max(0, Math.floor(y / this.cell)));
    return cy * this.cellsX + cx;
  }

  /**
   * Rebuild the bucket grid from every living slot in `store`, in two
   * passes over slot order (count, then place).
   * @param {import('./organisms.js').OrganismStore} store
   * @returns {void}
   */
  rebuild(store) {
    const cellCount = this.cellCount;
    cellCount.fill(0);

    for (let i = 0; i < store.highWater; i++) {
      if (!store.alive[i]) continue;
      cellCount[this._cellIndex(store.x[i], store.y[i])]++;
    }

    let acc = 0;
    const cellStart = this.cellStart;
    for (let c = 0; c < cellCount.length; c++) {
      cellStart[c] = acc;
      acc += cellCount[c];
    }
    cellStart[cellCount.length] = acc;

    const cursor = this._cursor;
    cursor.set(cellStart.subarray(0, cellCount.length));

    const items = this.items;
    for (let i = 0; i < store.highWater; i++) {
      if (!store.alive[i]) continue;
      const c = this._cellIndex(store.x[i], store.y[i]);
      items[cursor[c]++] = i;
    }
  }

  /**
   * Fill `out` with every living slot whose cell intersects the square
   * `[x-r, x+r] x [y-r, y+r]`, cell-major then slot order. This is a
   * candidate set, not a precise circle: callers filter by true distance.
   * @param {number} x
   * @param {number} y
   * @param {number} r
   * @param {Int32Array} out must be at least as large as the store's capacity
   * @returns {number} the number of candidates written to `out`
   */
  queryRange(x, y, r, out) {
    const cellsX = this.cellsX;
    const cellsY = this.cellsY;
    const cell = this.cell;
    const cx0 = Math.max(0, Math.floor((x - r) / cell));
    const cx1 = Math.min(cellsX - 1, Math.floor((x + r) / cell));
    const cy0 = Math.max(0, Math.floor((y - r) / cell));
    const cy1 = Math.min(cellsY - 1, Math.floor((y + r) / cell));

    const cellStart = this.cellStart;
    const items = this.items;
    let n = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      const rowBase = cy * cellsX;
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = rowBase + cx;
        const start = cellStart[c];
        const end = cellStart[c + 1];
        for (let k = start; k < end; k++) {
          out[n++] = items[k];
        }
      }
    }
    return n;
  }
}
