// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openStore } from '../../src/persist/db.js';

describe('openStore', () => {
  it('put/get/del round-trip', async () => {
    const store = openStore('flatland-test-db');

    expect(await store.get('world')).toBeUndefined();

    await store.put('world', { seed: 42, tick: 100 });
    expect(await store.get('world')).toEqual({ seed: 42, tick: 100 });

    await store.del('world');
    expect(await store.get('world')).toBeUndefined();
  });
});
