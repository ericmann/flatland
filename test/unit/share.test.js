import { describe, it, expect } from 'vitest';
import { encodeShare, decodeShare } from '../../src/persist/share.js';

describe('encodeShare/decodeShare', () => {
  it('encode/decode round-trips seed, diff, interventions and tick', () => {
    const share = {
      seed: 42,
      configDiff: { 'species.theta': 0.9 },
      interventions: [
        { tick: 1000, kind: 'fire', x: 10, y: 20 },
        { tick: 3000, kind: 'meteor', x: 5, y: 6 },
        { tick: 3000, kind: 'rename', speciesId: 2, name: 'Rock Hunters' },
      ],
      tick: 5000,
    };

    const str = encodeShare(share);
    expect(typeof str).toBe('string');
    expect(str).not.toMatch(/[+/=]/); // base64url, not base64

    const decoded = decodeShare(str);
    expect(decoded).toEqual(share);
  });

  it('compaction folds intervention-free stretches into ff records and the encoded size of a 100k-tick log with 3 events is under 200 bytes', () => {
    const interventions = [
      { tick: 1000, kind: 'fire', x: 10, y: 20 },
      { tick: 50000, kind: 'meteor', x: 5, y: 6 },
      { tick: 90000, kind: 'rain' },
    ];
    const str = encodeShare({ seed: 1, configDiff: {}, interventions, tick: 100000 });

    expect(str.length).toBeLessThan(200);

    const decoded = decodeShare(str);
    expect(decoded.tick).toBe(100000);
    expect(decoded.interventions).toEqual(interventions);
  });

  it('unknown version throws', () => {
    const str = encodeShare({ seed: 1, configDiff: {}, interventions: [], tick: 0 });
    const [, seed, configDiff, ops] = JSON.parse(
      Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    const bumped = Buffer.from(JSON.stringify([99, seed, configDiff, ops]), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(() => decodeShare(bumped)).toThrow(/version/);
  });

  it('an empty interventions log with tick 0 encodes to no ff record', () => {
    const decoded = decodeShare(
      encodeShare({ seed: 7, configDiff: {}, interventions: [], tick: 0 }),
    );
    expect(decoded).toEqual({ seed: 7, configDiff: {}, interventions: [], tick: 0 });
  });
});
