import { describe, it, expect } from 'vitest';
import { relativeError, initGenesisLedger } from '../../src/core/ledger.js';
import { queueIntervention } from '../../src/core/interventions.js';
import { makeWorld } from '../helpers.js';

// SPEC §4.4, §9.2: the energy identity holds within 1e-3 relative error
// every 100 ticks over a 10,000-tick run with interventions.
describe('energy conservation invariant', () => {
  it('holds within 1e-3 relative error every 100 ticks over 10,000 ticks, with rain/fire/meteor interventions', () => {
    const world = makeWorld({ seed: 1 });
    initGenesisLedger(world);
    queueIntervention(world, { tick: 2000, kind: 'rain' });
    queueIntervention(world, { tick: 3000, kind: 'fire', x: 20, y: 15 });
    queueIntervention(world, { tick: 5000, kind: 'rain' });
    queueIntervention(world, { tick: 7000, kind: 'meteor', x: 40, y: 25 });

    for (let t = 1; t <= 10000; t++) {
      world.step();
      if (t % 100 === 0) {
        const err = relativeError(world);
        expect(err).toBeLessThan(1e-3);
      }
    }
  });
});
