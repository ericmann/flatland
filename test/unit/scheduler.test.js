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
  const scheduler = new Scheduler({
    now: () => now,
    post: (msg, transfer = []) => posts.push({ msg, transfer }),
    budgetMs,
  });
  return {
    scheduler,
    posts,
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
});
