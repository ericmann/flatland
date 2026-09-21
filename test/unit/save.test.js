import { describe, it, expect } from 'vitest';
import {
  encodeRecord,
  decodeRecord,
  encodeState,
  restoreState,
  stateHash,
  stateByteLength,
} from '../../src/core/save.js';
import { makeConfig } from '../../src/core/config.js';
import { World } from '../../src/core/world.js';
import { makeWorld, stepN } from '../helpers.js';

describe('encodeRecord / decodeRecord', () => {
  it('round-trip and the diff contains only changed keys', () => {
    const config = makeConfig({ world: { width: 64, height: 40 } });
    const interventions = [{ tick: 10, kind: 'rain' }];
    const json = encodeRecord({ seed: 7, config, interventions });
    const parsed = JSON.parse(json);

    expect(parsed.seed).toBe(7);
    expect(parsed.configDiff).toEqual({ 'world.width': 64, 'world.height': 40 });
    expect(parsed.interventions).toEqual(interventions);

    const decoded = decodeRecord(json);
    expect(decoded.seed).toBe(7);
    expect(decoded.interventions).toEqual(interventions);
    expect(decoded.config).toEqual(config);
  });
});

describe('encodeState / restoreState', () => {
  it('gives an identical hash and identical chronicle, names and stats', () => {
    const world = stepN(makeWorld({ seed: 5 }), 500);
    const buffer = encodeState(world);

    const restored = World.fromState(world.cfg, world.seed, buffer);

    expect(restored.hash()).toBe(world.hash());
    expect(restored.tick).toBe(world.tick);
    expect(restored.chronicle.entries).toEqual(world.chronicle.entries);
    expect(restored.species.names).toEqual(world.species.names);
    expect(restored.stats.n).toBe(world.stats.n);
    expect(Array.from(restored.stats.diversity)).toEqual(Array.from(world.stats.diversity));
    expect(restored.interventions).toEqual(world.interventions);
    expect(restored.pending).toEqual(world.pending);
  });

  it('writes into a caller-supplied buffer when it is large enough', () => {
    const world = stepN(makeWorld({ seed: 6 }), 100);
    const byteLength = stateByteLength(world);
    const big = new ArrayBuffer(byteLength + 64);

    const result = encodeState(world, big);

    expect(result).toBe(big);
    const restored = World.fromState(world.cfg, world.seed, result);
    expect(restored.hash()).toBe(world.hash());
  });
});

describe('stateHash', () => {
  it('is stable across two encodes of the same world', () => {
    const world = stepN(makeWorld({ seed: 9 }), 200);
    const a = encodeState(world);
    const b = encodeState(world);
    expect(stateHash(a)).toBe(stateHash(b));
  });
});

describe('restoreState', () => {
  it('rejects a buffer with a wrong magic or version', () => {
    const world = makeWorld({ seed: 3 });
    const buffer = encodeState(world);

    const badMagic = buffer.slice(0);
    new DataView(badMagic).setInt32(0, 0, true);
    expect(() => restoreState(new World(world.cfg, world.seed), badMagic)).toThrow(/magic/);

    const badVersion = buffer.slice(0);
    new DataView(badVersion).setInt32(4, 99, true);
    expect(() => restoreState(new World(world.cfg, world.seed), badVersion)).toThrow(/version/);
  });

  it('a version-1 record (P6-06: pre-rescale saves) is refused by restoreState', () => {
    const world = makeWorld({ seed: 3 });
    const buffer = encodeState(world);
    const v1 = buffer.slice(0);
    new DataView(v1).setInt32(4, 1, true);
    expect(() => restoreState(new World(world.cfg, world.seed), v1)).toThrow(
      /unsupported version 1/,
    );
  });
});
