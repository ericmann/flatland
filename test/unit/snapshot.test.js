import { describe, it, expect } from 'vitest';
import {
  snapshotByteLength,
  encodeSnapshot,
  decodeSnapshot,
  SnapshotPool,
} from '../../src/sim/snapshot.js';
import { FLAG_TERRAIN, FLAG_PHEROMONE, FLAG_SELECTED } from '../../src/sim/protocol.js';
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
    expect(snap.selected.length).toBe(gLen + 17 + 8 + 12);
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
