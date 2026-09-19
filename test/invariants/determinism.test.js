import { describe, it, expect } from 'vitest';
import { makeWorld, stepN } from '../helpers.js';
import { encodeState } from '../../src/core/save.js';
import { World } from '../../src/core/world.js';

// SPEC §3.1, §9.2: given a seed, two independently constructed worlds must
// step to byte-identical state at every tick.
describe('determinism: seeds 1..10 produce identical hashes after 5000 ticks', () => {
  for (let seed = 1; seed <= 10; seed++) {
    it(`seed ${seed}`, () => {
      const a = stepN(makeWorld({ seed }), 5000);
      const b = stepN(makeWorld({ seed }), 5000);
      expect(a.hash()).toBe(b.hash());
    });
  }
});

// SPEC §3.4: a state snapshot is a cache, never a source of drift — a
// world restored mid-run and stepped onward must match a world that ran
// continuously the whole time.
describe('determinism: a restored state snapshot matches a continuous run', () => {
  it('a world restored from a state snapshot at tick 2,500 and stepped to 5,000 matches the continuous run', () => {
    const continuous = stepN(makeWorld({ seed: 42 }), 5000);

    const atSnapshot = stepN(makeWorld({ seed: 42 }), 2500);
    const buffer = encodeState(atSnapshot);
    const restored = World.fromState(atSnapshot.cfg, atSnapshot.seed, buffer);
    stepN(restored, 2500);

    expect(restored.hash()).toBe(continuous.hash());
  });
});
