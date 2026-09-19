import { describe, it, expect } from 'vitest';
import {
  snapshotByteLength,
  encodeSnapshot,
  decodeSnapshot,
  SnapshotPool,
} from '../../src/sim/snapshot.js';
import {
  FLAG_TERRAIN,
  FLAG_PHEROMONE,
  FLAG_SELECTED,
  FLAG_SPECIES,
} from '../../src/sim/protocol.js';
import { makeWorld, stepN } from '../helpers.js';

function smallWorld(seed = 1) {
  return makeWorld({ width: 16, height: 12, seed });
}

describe('snapshot', () => {
  it('encode/decode round-trips header, organisms, plants and carcass', () => {
    const world = smallWorld();
    stepN(world, 5);
    const buffer = new ArrayBuffer(snapshotByteLength(world.cfg));
    const used = encodeSnapshot(world, buffer, { flags: 0, tps: 42.5, speed: 1 });
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThanOrEqual(buffer.byteLength);

    const snap = decodeSnapshot(buffer);
    expect(snap.tick).toBe(world.tick);
    expect(snap.light).toBeCloseTo(world.light, 6);
    expect(snap.width).toBe(world.width);
    expect(snap.height).toBe(world.height);
    expect(snap.nOrgs).toBe(world.store.count);
    expect(snap.achievedTps).toBeCloseTo(42.5, 2);
    expect(snap.speed).toBeCloseTo(1, 3);

    const aliveSlots = [];
    for (let i = 0; i < world.store.highWater; i++) {
      if (world.store.alive[i]) aliveSlots.push(i);
    }
    expect(Array.from(snap.orgs.slot)).toEqual(aliveSlots);
    for (let k = 0; k < snap.orgs.n; k++) {
      const slot = snap.orgs.slot[k];
      expect(snap.orgs.x[k]).toBeCloseTo(world.store.x[slot], 4);
      expect(snap.orgs.y[k]).toBeCloseTo(world.store.y[slot], 4);
      expect(snap.orgs.id[k]).toBe(world.store.id[slot]);
      expect(snap.orgs.species[k]).toBe(world.store.species[slot]);
    }

    expect(Array.from(snap.plants)).toEqual(Array.from(world.plants));
    expect(Array.from(snap.carcass)).toEqual(Array.from(world.carcass));
  });

  it('terrain is present only with FLAG_TERRAIN and pheromones only with FLAG_PHEROMONE', () => {
    const world = smallWorld();
    const buffer = new ArrayBuffer(snapshotByteLength(world.cfg));

    encodeSnapshot(world, buffer, { flags: 0 });
    let snap = decodeSnapshot(buffer);
    expect(snap.terrain).toBeUndefined();
    expect(snap.pher).toBeUndefined();

    encodeSnapshot(world, buffer, { flags: FLAG_TERRAIN });
    snap = decodeSnapshot(buffer);
    expect(snap.terrain).toBeDefined();
    expect(Array.from(snap.terrain)).toEqual(Array.from(world.terrain));
    expect(snap.pher).toBeUndefined();

    encodeSnapshot(world, buffer, { flags: FLAG_PHEROMONE });
    snap = decodeSnapshot(buffer);
    expect(snap.terrain).toBeUndefined();
    expect(snap.pher).toBeDefined();
    expect(snap.pher).toHaveLength(4);
    for (let c = 0; c < 4; c++) {
      expect(Array.from(snap.pher[c])).toEqual(Array.from(world.pher[c]));
    }
  });

  it('the selected record carries genome, inputs, outputs and scalars for a living id and is absent for a dead one', () => {
    const world = smallWorld();
    stepN(world, 3);
    const store = world.store;
    let livingSlot = -1;
    for (let i = 0; i < store.highWater; i++) {
      if (store.alive[i]) {
        livingSlot = i;
        break;
      }
    }
    expect(livingSlot).toBeGreaterThanOrEqual(0);
    const livingId = store.id[livingSlot];

    const buffer = new ArrayBuffer(snapshotByteLength(world.cfg));
    encodeSnapshot(world, buffer, { flags: FLAG_SELECTED, selectedId: livingId });
    const snap = decodeSnapshot(buffer);
    expect(snap.selectedSlot).toBe(livingSlot);
    expect(snap.selected).toBeDefined();
    const gLen = store.genomeLength;
    expect(snap.selected.length).toBe(gLen + 17 + 8 + 12 + 5); // +5 family scalars (P2-06)
    expect(Array.from(snap.selected.subarray(0, gLen))).toEqual(
      Array.from(store.genome.subarray(livingSlot * gLen, livingSlot * gLen + gLen)),
    );
    // Trailing scalars: energy is the first of the 12.
    expect(snap.selected[gLen + 17 + 8]).toBeCloseTo(store.energy[livingSlot], 3);

    // A dead (never-allocated) id: no organism has id 999999.
    encodeSnapshot(world, buffer, { flags: FLAG_SELECTED, selectedId: 999999 });
    const snapDead = decodeSnapshot(buffer);
    expect(snapDead.selectedSlot).toBe(-1);
    expect(snapDead.selected).toBeUndefined();
  });

  it('encoding into a reused buffer allocates no new ArrayBuffer (same buffer identity)', () => {
    const world = smallWorld();
    const buffer = new ArrayBuffer(snapshotByteLength(world.cfg));
    const before = buffer;
    encodeSnapshot(world, buffer, { flags: 0 });
    stepN(world, 1);
    encodeSnapshot(world, buffer, { flags: 0 });
    expect(buffer).toBe(before);
  });

  it('FLAG_SPECIES includes one row per species', () => {
    const world = smallWorld();
    stepN(world, 50);
    const buffer = new ArrayBuffer(snapshotByteLength(world.cfg));

    encodeSnapshot(world, buffer, { flags: 0 });
    expect(decodeSnapshot(buffer).species).toBeUndefined();

    encodeSnapshot(world, buffer, { flags: FLAG_SPECIES });
    const snap = decodeSnapshot(buffer);
    expect(snap.species).toBeDefined();
    expect(snap.species.n).toBe(world.species.n);
    expect(world.species.n).toBeGreaterThan(0);
    for (let id = 0; id < world.species.n; id++) {
      expect(snap.species.ancestor[id]).toBe(world.species.ancestor[id]);
      expect(snap.species.born[id]).toBe(world.species.born[id]);
      expect(snap.species.died[id]).toBe(world.species.died[id]);
      expect(snap.species.count[id]).toBe(world.species.count[id]);
      expect(snap.species.hue[id]).toBeCloseTo(world.species.hue[id], 4);
    }
  });

  it('the selected record carries family counts computed from the store', () => {
    const world = makeWorld({ seed: 1, config: { breeding: { baseRate: 1 } } });
    const store = world.store;
    let bred = -1;
    for (let t = 0; t < 3000 && bred === -1; t++) {
      world.step();
      for (let i = 0; i < store.highWater; i++) {
        if (store.alive[i] && store.parent[i] !== 0) {
          bred = i;
          break;
        }
      }
    }
    expect(bred).toBeGreaterThanOrEqual(0); // a real birth happened within the budget

    const bredId = store.id[bred];
    const bredParentId = store.parent[bred];
    let expectedSiblings = 0;
    for (let i = 0; i < store.highWater; i++) {
      if (store.alive[i] && store.id[i] !== bredId && store.parent[i] === bredParentId) {
        expectedSiblings++;
      }
    }
    const speciesId = store.species[bred];

    const buffer = new ArrayBuffer(snapshotByteLength(world.cfg));
    encodeSnapshot(world, buffer, { flags: FLAG_SELECTED, selectedId: bredId });
    const snap = decodeSnapshot(buffer);
    const gLen = store.genomeLength;
    const familyStart = gLen + 17 + 8 + 12;

    expect(snap.selected[familyStart]).toBe(store.offspring[bred]);
    expect(snap.selected[familyStart + 1]).toBe(expectedSiblings);
    expect(snap.selected[familyStart + 2]).toBe(world.species.count[speciesId]);
    expect(snap.selected[familyStart + 3]).toBe(world.species.born[speciesId]);
    expect(snap.selected[familyStart + 4]).toBe(world.species.ancestor[speciesId]);
  });

  it('social flag bit set when sociality > 0.6', () => {
    const world = makeWorld({
      width: 16,
      height: 12,
      seed: 1,
      organisms: [
        { x: 5, y: 5, traits: { sociality: 0.9 } },
        { x: 6, y: 6, traits: { sociality: 0.3 } },
      ],
    });
    const buffer = new ArrayBuffer(snapshotByteLength(world.cfg));
    encodeSnapshot(world, buffer, { flags: 0 });
    const snap = decodeSnapshot(buffer);

    const SOCIAL_BIT = 1 << 5;
    expect(snap.orgs.flagsByte[0] & SOCIAL_BIT).not.toBe(0);
    expect(snap.orgs.flagsByte[1] & SOCIAL_BIT).toBe(0);
  });

  it('pool refuses a third acquire until a release', () => {
    const world = smallWorld();
    const pool = new SnapshotPool(snapshotByteLength(world.cfg), 2);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).toBeInstanceOf(ArrayBuffer);
    expect(b).toBeInstanceOf(ArrayBuffer);
    expect(pool.acquire()).toBeNull();
    pool.release(a);
    const c = pool.acquire();
    expect(c).toBe(a);
    expect(pool.acquire()).toBeNull();
  });
});
