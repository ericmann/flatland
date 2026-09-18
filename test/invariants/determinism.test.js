import { describe, it, expect } from 'vitest';
import { makeWorld, stepN } from '../helpers.js';

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
