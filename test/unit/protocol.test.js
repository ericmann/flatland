import { describe, it, expect } from 'vitest';
import { MSG } from '../../src/sim/protocol.js';

describe('protocol', () => {
  it('every MSG name is unique', () => {
    const values = Object.values(MSG);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
