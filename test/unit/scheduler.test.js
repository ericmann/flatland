import { describe, it, expect } from 'vitest';
import { Scheduler } from '../../src/sim/scheduler.js';
import { MSG } from '../../src/sim/protocol.js';

/**
 * A scheduler wired to a controllable fake clock and a `post` that records
 * every message (plus its transfer list) for inspection.
 */
function makeScheduler(budgetMs) {
  let now = 0;
  /** @type {{ msg: *, transfer: Transferable[] }[]} */
  const posts = [];
  /** @type {*[][]} */
  const warnings = [];
  const scheduler = new Scheduler({
    now: () => now,
    post: (msg, transfer = []) => posts.push({ msg, transfer }),
    budgetMs,
    warn: (...args) => warnings.push(args),
  });
  return {
    scheduler,
    posts,
    warnings,
    advance: (ms) => {
      now += ms;
    },
  };
}

function load(scheduler, seed) {
  scheduler.handle({
    type: MSG.LOAD,
    seed,
    config: { world: { width: 16, height: 12 } },
  });
}

describe('Scheduler', () => {
  it('runs speed × tps ticks per simulated second', () => {
    const { scheduler, advance } = makeScheduler();
    load(scheduler, 1);

    advance(1000);
    expect(scheduler.pump().ticks).toBe(30); // speed 1 × tps 30

    scheduler.handle({ type: MSG.SET_SPEED, speed: 0.5 });
    advance(1000);
    expect(scheduler.pump().ticks).toBe(15); // speed 0.5 × tps 30
  });

  it('speed 0 and pause run nothing; resume continues', () => {
    const { scheduler, advance } = makeScheduler();
    load(scheduler, 1);

    scheduler.handle({ type: MSG.SET_SPEED, speed: 0 });
    advance(1000);
    expect(scheduler.pump().ticks).toBe(0);

    scheduler.handle({ type: MSG.SET_SPEED, speed: 1 });
    scheduler.handle({ type: MSG.PAUSE });
    advance(1000);
    expect(scheduler.pump().ticks).toBe(0);
    expect(scheduler.paused).toBe(true);

    scheduler.handle({ type: MSG.RESUME });
    advance(1000);
    expect(scheduler.pump().ticks).toBe(30);
  });

  it('when the budget is blown the wall-clock target is dropped, not the simulation', () => {
    const { scheduler, advance } = makeScheduler();
    load(scheduler, 1);

    advance(10000); // 10 simulated seconds fell behind in wall-clock terms
    const { ticks, behind } = scheduler.pump();
    expect(ticks).toBeLessThanOrEqual(30); // sim.tps, not 300
    expect(behind).toBe(true);
  });

  it('requestSnapshot posts one buffer with a transfer list and a second request without release is served only after release', () => {
    const { scheduler, posts } = makeScheduler();
    load(scheduler, 1);
    const snapshots = () => posts.filter((p) => p.msg.type === MSG.SNAPSHOT);

    scheduler.handle({ type: MSG.REQUEST_SNAPSHOT, flags: 0 });
    scheduler.pump();
    expect(snapshots()).toHaveLength(1);
    const first = snapshots()[0];
    expect(first.transfer).toEqual([first.msg.buffer]);

    // The pool is double-buffered: a second request is still served from
    // the other buffer.
    scheduler.handle({ type: MSG.REQUEST_SNAPSHOT, flags: 0 });
    scheduler.pump();
    expect(snapshots()).toHaveLength(2);

    // Now both buffers are checked out: a third request cannot be served.
    scheduler.handle({ type: MSG.REQUEST_SNAPSHOT, flags: 0 });
    scheduler.pump();
    expect(snapshots()).toHaveLength(2);

    // Releasing one frees it up for the still-pending request.
    scheduler.handle({ type: MSG.RELEASE_SNAPSHOT, buffer: first.msg.buffer });
    scheduler.pump();
    expect(snapshots()).toHaveLength(3);
  });

  it('hash command replies with world.hash()', () => {
    const { scheduler, posts } = makeScheduler();
    load(scheduler, 1);

    scheduler.handle({ type: MSG.HASH });
    const reply = posts.find((p) => p.msg.type === MSG.HASH);
    expect(reply).toBeDefined();
    expect(reply.msg.hash).toBe(scheduler.world.hash());
  });

  it('two schedulers loaded with the same seed have equal hashes after the same pumps', () => {
    const a = makeScheduler();
    const b = makeScheduler();
    load(a.scheduler, 7);
    load(b.scheduler, 7);

    for (let i = 0; i < 5; i++) {
      a.advance(200);
      a.scheduler.pump();
      b.advance(200);
      b.scheduler.pump();
    }

    expect(a.scheduler.world.hash()).toBe(b.scheduler.world.hash());
  });

  it('intervene queues for the next tick at the earliest', () => {
    const { scheduler } = makeScheduler();
    load(scheduler, 1);

    scheduler.handle({ type: MSG.INTERVENE, event: { kind: 'rain', tick: 0 } });
    expect(scheduler.world.pending[0].tick).toBe(scheduler.world.tick + 1);

    scheduler.handle({ type: MSG.INTERVENE, event: { kind: 'rain', tick: 500 } });
    expect(scheduler.world.pending[1].tick).toBe(500);
  });

  it('loaded is followed by a full phylogeny event; a split posts a delta with the new species only', () => {
    const { scheduler, posts } = makeScheduler();
    load(scheduler, 1);

    const phylogenyPosts = () => posts.filter((p) => p.msg.type === MSG.PHYLOGENY);
    const full = phylogenyPosts();
    expect(full).toHaveLength(1);
    expect(full[0].msg.species.length).toBe(scheduler.world.species.n);
    expect(full[0].msg.species.length).toBeGreaterThan(0);

    // A new species, without needing actual evolutionary drift.
    const world = scheduler.world;
    const gLen = world.store.genomeLength;
    const newId = world.species.create(world, 0 * gLen, 0, 5, 5);

    scheduler.pump();
    const afterSplit = phylogenyPosts();
    expect(afterSplit).toHaveLength(2);
    expect(afterSplit[1].msg.species).toHaveLength(1);
    expect(afterSplit[1].msg.species[0].id).toBe(newId);

    // Pumping again with nothing new posts no further phylogeny event.
    scheduler.pump();
    expect(phylogenyPosts()).toHaveLength(2);
  });

  it('status carries population by class and species counts', () => {
    const { scheduler, posts, advance } = makeScheduler();
    load(scheduler, 1);
    advance(1000);
    scheduler.pump();

    const status = posts.filter((p) => p.msg.type === MSG.STATUS).at(-1);
    expect(status).toBeDefined();
    const fields = [
      'light',
      'season',
      'dayFraction',
      'temperature',
      'herb',
      'omni',
      'carn',
      'plantsFraction',
      'speciesLiving',
      'speciesTotal',
    ];
    for (const field of fields) {
      expect(status.msg[field]).toBeDefined();
    }
    expect(status.msg.speciesTotal).toBe(scheduler.world.species.n);
  });

  it('stats events carry species counts', () => {
    const { scheduler, posts, advance } = makeScheduler();
    load(scheduler, 1);
    advance(1000);
    scheduler.pump();

    const stats = posts.filter((p) => p.msg.type === MSG.STATS).at(-1);
    expect(stats).toBeDefined();
    expect(Array.isArray(stats.msg.species)).toBe(true);
    expect(stats.msg.species.length).toBe(scheduler.world.species.n);
    expect(stats.msg.species.length).toBeGreaterThan(0);
    for (const [id, count] of stats.msg.species) {
      expect(typeof id).toBe('number');
      expect(count).toBe(scheduler.world.species.count[id]);
    }
  });

  it('snapshotState posts a transferred state, hash, tick and record; load(state) resumes from it', () => {
    const source = makeScheduler();
    load(source.scheduler, 3);
    for (let i = 0; i < 10; i++) {
      source.advance(200);
      source.scheduler.pump();
    }

    source.scheduler.handle({ type: MSG.SNAPSHOT_STATE });
    const post = source.posts.find((p) => p.msg.type === MSG.STATE_SNAPSHOT);
    expect(post).toBeDefined();
    expect(post.msg.hash).toBe(source.scheduler.world.hash());
    expect(post.msg.tick).toBe(source.scheduler.world.tick);
    expect(typeof post.msg.record).toBe('string');
    expect(post.transfer).toContain(post.msg.state);

    const resumed = makeScheduler();
    resumed.scheduler.handle({
      type: MSG.LOAD,
      seed: 3,
      config: { world: { width: 16, height: 12 } },
      state: post.msg.state,
    });
    expect(resumed.scheduler.world.hash()).toBe(source.scheduler.world.hash());
    expect(resumed.scheduler.world.tick).toBe(source.scheduler.world.tick);
  });

  it('resume discards a refused (version-mismatched) record and starts fresh from the seed (P6-06)', () => {
    const source = makeScheduler();
    load(source.scheduler, 3);
    for (let i = 0; i < 10; i++) {
      source.advance(200);
      source.scheduler.pump();
    }
    source.scheduler.handle({ type: MSG.SNAPSHOT_STATE });
    const post = source.posts.find((p) => p.msg.type === MSG.STATE_SNAPSHOT);
    // Corrupt the saved state to an old (pre-P6-06) version, as save.js's
    // own VERSION bump makes restoreState refuse — see src/core/save.js.
    new DataView(post.msg.state).setInt32(4, 1, true);

    const resumed = makeScheduler();
    resumed.scheduler.handle({
      type: MSG.LOAD,
      seed: 3,
      config: { world: { width: 16, height: 12 } },
      state: post.msg.state,
    });
    // Started fresh from genesis at the same seed, not resumed from the
    // (discarded, tick-10-pumps-in) source state.
    expect(resumed.scheduler.world.tick).toBe(0);
    expect(resumed.scheduler.world.store.count).toBeGreaterThan(0);
    expect(resumed.warnings.length).toBe(1);
  });

  it('load(state) queues only interventions after the restored tick', () => {
    const source = makeScheduler();
    load(source.scheduler, 4);
    for (let i = 0; i < 5; i++) {
      source.advance(200);
      source.scheduler.pump();
    }
    source.scheduler.handle({ type: MSG.SNAPSHOT_STATE });
    const state = source.posts.find((p) => p.msg.type === MSG.STATE_SNAPSHOT).msg.state;
    const restoredTick = source.scheduler.world.tick;

    const resumed = makeScheduler();
    resumed.scheduler.handle({
      type: MSG.LOAD,
      seed: 4,
      config: { world: { width: 16, height: 12 } },
      state,
      interventions: [
        { tick: 1, kind: 'rain' }, // already in the past — must not be (re)queued.
        { tick: restoredTick + 50, kind: 'rain' },
      ],
    });

    expect(resumed.scheduler.world.pending).toEqual([{ tick: restoredTick + 50, kind: 'rain' }]);
  });

  it('replayTo runs to the tick regardless of speed and then continues live', () => {
    // A fake clock that advances 1ms per read (not just per `advance()`),
    // so `_replayTo`'s own budget check sees elapsed time even though
    // nothing in this test calls `advance()` — a static clock would let
    // one chunk finish the whole replay in a single iteration, which is
    // still correct but would make chunking unobservable here.
    let calls = 0;
    const posts = [];
    const scheduler = new Scheduler({
      now: () => calls++,
      post: (msg, transfer = []) => posts.push({ msg, transfer }),
      budgetMs: 5,
    });
    scheduler.handle({
      type: MSG.LOAD,
      seed: 5,
      config: { world: { width: 16, height: 12 } },
      replayTo: 300,
    });

    expect(scheduler.world.tick).toBe(300);
    // speed was never consulted by replay (default 1, untouched).
    expect(scheduler.speed).toBe(1);

    const replayStatuses = posts.filter(
      (p) => p.msg.type === MSG.STATUS && p.msg.replaying !== undefined,
    );
    expect(replayStatuses.length).toBeGreaterThan(1); // more than one chunk, given the 1ms-per-read clock.
    expect(replayStatuses.every((p) => p.msg.progress >= 0 && p.msg.progress <= 1)).toBe(true);
    expect(replayStatuses.at(-1).msg).toEqual({ type: MSG.STATUS, replaying: false, progress: 1 });

    // Post-replay, live pump()s behave normally: speed 0 truly pauses.
    scheduler.handle({ type: MSG.SET_SPEED, speed: 0 });
    const { ticks } = scheduler.pump();
    expect(ticks).toBe(0);
    expect(scheduler.world.tick).toBe(300);
  });

  it('resume with a valid checkpoint reports verify ok', () => {
    const source = makeScheduler();
    source.scheduler.handle({
      type: MSG.LOAD,
      seed: 7,
      config: { world: { width: 16, height: 12 }, persist: { verifyReplayTicks: 5 } },
    });
    for (let i = 0; i < 20; i++) {
      source.advance(300);
      source.scheduler.pump();
    }
    source.scheduler.handle({ type: MSG.SNAPSHOT_STATE });
    const snap = source.posts.filter((p) => p.msg.type === MSG.STATE_SNAPSHOT).at(-1).msg;
    expect(snap.checkpoint).toBeInstanceOf(ArrayBuffer);
    expect(typeof snap.checkpointTick).toBe('number');

    const resumed = makeScheduler();
    resumed.scheduler.handle({
      type: MSG.LOAD,
      seed: 7,
      config: { world: { width: 16, height: 12 }, persist: { verifyReplayTicks: 5 } },
      state: snap.state,
      verify: {
        checkpoint: snap.checkpoint,
        checkpointTick: snap.checkpointTick,
        expectedHash: snap.hash,
      },
    });

    let verifyStatus;
    for (let i = 0; i < 50 && !verifyStatus; i++) {
      resumed.advance(50);
      resumed.scheduler.pump();
      verifyStatus = resumed.posts.find(
        (p) => p.msg.type === MSG.STATUS && p.msg.verify !== undefined,
      );
    }
    expect(verifyStatus).toBeDefined();
    expect(verifyStatus.msg.verify).toBe('ok');
    expect(verifyStatus.msg.at).toBe(snap.tick);
  });

  it('a tampered state reports verify mismatch', () => {
    const source = makeScheduler();
    source.scheduler.handle({
      type: MSG.LOAD,
      seed: 8,
      config: { world: { width: 16, height: 12 }, persist: { verifyReplayTicks: 5 } },
    });
    for (let i = 0; i < 20; i++) {
      source.advance(300);
      source.scheduler.pump();
    }
    source.scheduler.handle({ type: MSG.SNAPSHOT_STATE });
    const snap = source.posts.filter((p) => p.msg.type === MSG.STATE_SNAPSHOT).at(-1).msg;

    const resumed = makeScheduler();
    resumed.scheduler.handle({
      type: MSG.LOAD,
      seed: 8,
      config: { world: { width: 16, height: 12 }, persist: { verifyReplayTicks: 5 } },
      state: snap.state,
      verify: {
        checkpoint: snap.checkpoint,
        checkpointTick: snap.checkpointTick,
        expectedHash: 'deadbeef', // wrong on purpose.
      },
    });

    let verifyStatus;
    for (let i = 0; i < 50 && !verifyStatus; i++) {
      resumed.advance(50);
      resumed.scheduler.pump();
      verifyStatus = resumed.posts.find(
        (p) => p.msg.type === MSG.STATUS && p.msg.verify !== undefined,
      );
    }
    expect(verifyStatus).toBeDefined();
    expect(verifyStatus.msg.verify).toBe('mismatch');
  });

  it('verification never runs more than verifyReplayTicks ticks', () => {
    const source = makeScheduler();
    source.scheduler.handle({
      type: MSG.LOAD,
      seed: 9,
      config: { world: { width: 16, height: 12 }, persist: { verifyReplayTicks: 5 } },
    });
    for (let i = 0; i < 30; i++) {
      source.advance(50);
      source.scheduler.pump();
      source.scheduler.handle({ type: MSG.SNAPSHOT_STATE });
      const snap = source.posts[source.posts.length - 1].msg;
      expect(snap.tick - snap.checkpointTick).toBeLessThan(5);
    }
  });
});
