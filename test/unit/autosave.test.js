// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startAutosave } from '../../src/persist/autosave.js';
import { makeConfig } from '../../src/core/config.js';

/** A stub sim: records every `send`, and lets the test fire a fake `stateSnapshot` reply. */
function stubSim() {
  /** @type {string[]} */
  const sent = [];
  /** @type {Set<(msg: *) => void>} */
  const handlers = new Set();
  return {
    sim: {
      send: (type) => sent.push(type),
      on: (type, cb) => {
        if (type !== 'stateSnapshot') return () => {};
        handlers.add(cb);
        return () => handlers.delete(cb);
      },
    },
    sent,
    fireReply(msg) {
      for (const cb of handlers) cb(msg);
    },
  };
}

/** A stub db: records every `put`. */
function stubDb() {
  /** @type {[string, *][]} */
  const puts = [];
  return { db: { put: (key, value) => Promise.resolve(puts.push([key, value])) }, puts };
}

const cfg = makeConfig({});
// `test/unit/**` gets only Node globals from eslint (test/ui/** is where
// jsdom's document/window are declared browser globals) even though this
// file's `@vitest-environment jsdom` comment gives it real ones at
// runtime — go through `globalThis` so both the linter and the runtime
// agree these exist.
const doc = /** @type {Document} */ (/** @type {*} */ (globalThis).document);
const win = /** @type {Window & typeof globalThis} */ (/** @type {*} */ (globalThis).window);

describe('startAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves on the interval', () => {
    const { sim, sent } = stubSim();
    const { db } = stubDb();

    const autosave = startAutosave({ sim, db, cfg, intervalMs: 1000, doc, win });
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual(['snapshotState']);

    vi.advanceTimersByTime(2000);
    expect(sent).toEqual(['snapshotState', 'snapshotState', 'snapshotState']);

    autosave.stop();
  });

  it('saves when the tab becomes hidden', () => {
    const { sim, sent } = stubSim();
    const { db } = stubDb();
    Object.defineProperty(doc, 'hidden', { configurable: true, value: true });

    const autosave = startAutosave({ sim, db, cfg, intervalMs: 60000, doc, win });
    doc.dispatchEvent(new win.Event('visibilitychange'));
    expect(sent).toEqual(['snapshotState']);

    autosave.stop();
    Object.defineProperty(doc, 'hidden', { configurable: true, value: false });
  });

  it('persists the stateSnapshot reply to the db under "world"', () => {
    const { sim, fireReply } = stubSim();
    const { db, puts } = stubDb();

    const autosave = startAutosave({ sim, db, cfg, intervalMs: 60000, doc, win });
    fireReply({
      record: '{"seed":1}',
      state: new ArrayBuffer(4),
      hash: 'abc',
      tick: 500,
      checkpoint: new ArrayBuffer(4),
      checkpointTick: 0,
    });

    expect(puts).toHaveLength(1);
    expect(puts[0][0]).toBe('world');
    expect(puts[0][1]).toMatchObject({ hash: 'abc', tick: 500, checkpointTick: 0 });
    expect(typeof puts[0][1].savedAt).toBe('number');

    autosave.stop();
  });

  it('stop() clears the interval and unsubscribes', () => {
    const { sim, sent } = stubSim();
    const { db } = stubDb();
    const autosave = startAutosave({ sim, db, cfg, intervalMs: 1000, doc, win });
    autosave.stop();
    vi.advanceTimersByTime(5000);
    expect(sent).toEqual([]);
  });

  it('defaults intervalMs from cfg.persist.autosaveSeconds when not given', () => {
    const { sim, sent } = stubSim();
    const { db } = stubDb();
    const autosave = startAutosave({ sim, db, cfg, doc, win });

    vi.advanceTimersByTime(cfg.persist.autosaveSeconds * 1000 - 1);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual(['snapshotState']);

    autosave.stop();
  });
});
