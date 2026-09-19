import { describe, it, expect } from 'vitest';
import { pick } from '../../src/render/renderer.js';

function fakeSnap(orgs) {
  return {
    orgs: {
      n: orgs.length,
      x: Float32Array.from(orgs.map((o) => o.x)),
      y: Float32Array.from(orgs.map((o) => o.y)),
      id: Uint32Array.from(orgs.map((o) => o.id)),
    },
  };
}

describe('pick', () => {
  it('returns the nearest organism within r and -1 otherwise, ties by lowest id', () => {
    const snap = fakeSnap([
      { x: 10, y: 10, id: 5 },
      { x: 10.5, y: 10, id: 3 },
      { x: 20, y: 20, id: 1 },
    ]);

    // Nearest to (10, 10) within 2.5 tiles is id 5 (distance 0).
    expect(pick(snap, 10, 10, 2.5)).toBe(5);

    // Nothing within range of an empty patch.
    expect(pick(snap, 50, 50, 2.5)).toBe(-1);

    // A tap exactly between id 5 and id 3 (both distance 0.25): tie, lowest id wins.
    expect(pick(snap, 10.25, 10, 2.5)).toBe(3);
  });

  it('respects the radius boundary', () => {
    const snap = fakeSnap([{ x: 0, y: 0, id: 1 }]);
    expect(pick(snap, 3, 0, 2.5)).toBe(-1);
    expect(pick(snap, 2, 0, 2.5)).toBe(1);
  });
});
