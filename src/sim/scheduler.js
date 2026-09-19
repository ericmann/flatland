/**
 * The fixed-timestep scheduler (SPEC §6.4): drives `World.step()` at
 * `speed x cfg.sim.tps` ticks per simulated second, batched per pump, with
 * a wall-clock budget so a slow batch drops ticks from the *wall-clock
 * target*, never from the simulation itself. Testable in Node: `now()` and
 * `post()` are injected, never read from `performance`/`postMessage`
 * directly (those live only in `worker.js`/`main-thread.js`, P1-13).
 *
 * Determinism: this class never touches `world` state itself except
 * through `world.step()`, `queueIntervention()`, `world.hash()` and the
 * read-only snapshot encoder — it is a driver, not a mechanic.
 */
import { makeConfig } from '../core/config.js';
import { World } from '../core/world.js';
import { runGenesis } from '../core/genesis.js';
import { queueIntervention } from '../core/interventions.js';
import { season, dayFraction } from '../core/light.js';
import { encodeState, encodeRecord } from '../core/save.js';
import { MSG } from './protocol.js';
import { snapshotByteLength, encodeSnapshot, SnapshotPool } from './snapshot.js';

export class Scheduler {
  /**
   * @param {{ now: () => number, post: (msg: *, transfer?: Transferable[]) => void, budgetMs?: number }} deps
   *   `now()` returns milliseconds (monotonic, injected). `post` sends one
   *   `{ type, ...payload }` message, with any transferables in `transfer`.
   *   `budgetMs`, when given, overrides `cfg.sim.batchBudgetMs` for every
   *   pump (the main-thread fallback passes `cfg.sim.fallbackBudgetMs`).
   */
  constructor({ now, post, budgetMs }) {
    this._now = now;
    this._post = post;
    this._budgetMsOverride = budgetMs;

    /** @type {World|null} */
    this.world = null;
    this.speed = 1;
    this.paused = false;
    /** Simulated ticks owed, in fractional ticks. */
    this.acc = 0;
    this.lastNow = now();
    this.achievedTps = 0;

    /** @type {number} organism id selected for the snapshot's selected record, 0 = none. */
    this.selectedId = 0;
    /** @type {import('./snapshot.js').SnapshotPool|null} */
    this.pool = null;
    /** @type {number|null} flags of a snapshot the main thread wants; null = none pending. */
    this._pendingSnapshotFlags = null;
    /** Set once by a `requestSnapshot({ terrainDirty: true })`-style caller; cleared after one is sent. */
    this._terrainDirty = false;

    this._tpsTickAccum = 0;
    this._tpsTimeAccum = 0;
    this._lastStatusPostAt = -Infinity;
    this._lastStatsN = 0;
    /** Species ids `< this` were included in a previous phylogeny post; new ids and dirty old ones are sent as a delta (P2-06). */
    this._lastPostedSpeciesN = 0;
  }

  /**
   * Handle one incoming `{ type, ...payload }` message.
   * @param {*} msg
   * @returns {void}
   */
  handle(msg) {
    switch (msg.type) {
      case MSG.LOAD:
        this._load(msg);
        break;
      case MSG.SET_SPEED:
        this.speed = msg.speed;
        break;
      case MSG.PAUSE:
        this.paused = true;
        break;
      case MSG.RESUME:
        this.paused = false;
        this.lastNow = this._now();
        break;
      case MSG.INTERVENE:
        this._intervene(msg.event);
        break;
      case MSG.SELECT:
        this.selectedId = msg.id;
        break;
      case MSG.REQUEST_SNAPSHOT:
        this._pendingSnapshotFlags = msg.flags;
        break;
      case MSG.RELEASE_SNAPSHOT:
        if (this.pool) this.pool.release(msg.buffer);
        break;
      case MSG.SNAPSHOT_STATE:
        this._snapshotState();
        break;
      case MSG.HASH:
        this._post({ type: MSG.HASH, hash: this._requireWorld().hash() });
        break;
      default:
        throw new Error(`unknown message type: ${msg.type}`);
    }
  }

  /**
   * @returns {World}
   */
  _requireWorld() {
    if (!this.world) throw new Error('Scheduler.handle: no world loaded (send "load" first)');
    return this.world;
  }

  /**
   * @param {{ seed: number, config?: *, interventions?: import('../core/interventions.js').InterventionEvent[], state?: ArrayBuffer }} msg
   *   `state`, when given (SPEC §5.6), restores a cached snapshot instead
   *   of replaying from genesis; `interventions` is still the full,
   *   canonical log either way, and any entry with `tick > world.tick`
   *   (i.e. not yet applied as of the snapshot) is (re)queued.
   * @returns {void}
   */
  _load(msg) {
    const cfg = makeConfig(msg.config ?? {});
    let world;
    if (msg.state) {
      world = World.fromState(cfg, msg.seed, msg.state);
    } else {
      world = new World(cfg, msg.seed);
      runGenesis(world);
    }
    for (const ev of msg.interventions ?? []) {
      if (ev.tick > world.tick) queueIntervention(world, ev);
    }
    this.world = world;

    this.acc = 0;
    this.lastNow = this._now();
    this.selectedId = 0;
    this._pendingSnapshotFlags = null;
    this._terrainDirty = true; // the freshly-generated terrain has never been sent.
    this._tpsTickAccum = 0;
    this._tpsTimeAccum = 0;
    this.achievedTps = 0;
    this._lastStatusPostAt = -Infinity;
    this._lastStatsN = world.stats.n;
    this._lastPostedSpeciesN = 0;
    this.pool = new SnapshotPool(snapshotByteLength(cfg));

    this._post({
      type: MSG.LOADED,
      seed: world.seed,
      tick: world.tick,
      width: world.width,
      height: world.height,
      hash: world.hash(),
    });
    this._sendPhylogeny(true); // the full table (force: always post right after load).
  }

  /**
   * Post a phylogeny event: species new since `_lastPostedSpeciesN`, plus
   * any earlier species the core marked `dirty` (e.g. went extinct) —
   * SPEC §6.4. On `load` this is the whole table (`_lastPostedSpeciesN`
   * starts at 0). Posts even when the delta is empty only when `force`
   * is set (used right after `load`, so "loaded is followed by a
   * phylogeny event" holds even for a world with no species yet).
   * @param {boolean} [force]
   * @returns {void}
   */
  _sendPhylogeny(force = false) {
    const world = this._requireWorld();
    const table = world.species;
    const fromN = this._lastPostedSpeciesN;
    /** @type {*[]} */
    const rows = [];

    for (let id = 0; id < fromN; id++) {
      if (!table.dirty[id]) continue;
      rows.push(this._phylogenyRow(table, id));
      table.dirty[id] = 0;
    }
    for (let id = fromN; id < table.n; id++) {
      rows.push(this._phylogenyRow(table, id));
      table.dirty[id] = 0;
    }
    this._lastPostedSpeciesN = table.n;

    if (rows.length === 0 && !force) return;
    this._post({ type: MSG.PHYLOGENY, species: rows });
  }

  /**
   * @param {import('../core/species.js').SpeciesTable} table
   * @param {number} id
   * @returns {*}
   */
  _phylogenyRow(table, id) {
    return {
      id,
      name: table.names[id],
      ancestor: table.ancestor[id],
      born: table.born[id],
      died: table.died[id],
      hue: table.hue[id],
      count: table.count[id],
    };
  }

  /**
   * `intervene(event)` queues for the next tick at the earliest (SPEC
   * §6.4): a caller cannot retroactively affect a tick already run.
   * @param {import('../core/interventions.js').InterventionEvent} event
   * @returns {void}
   */
  _intervene(event) {
    const world = this._requireWorld();
    queueIntervention(world, { ...event, tick: Math.max(event.tick ?? 0, world.tick + 1) });
  }

  /**
   * Encode the current world's full state (SPEC §5.6) and post it,
   * transferred, alongside its hash, tick and an encoded save record —
   * everything a caller needs to cache a fast-resume point and verify it
   * later with a background replay.
   * @returns {void}
   */
  _snapshotState() {
    const world = this._requireWorld();
    const state = encodeState(world);
    const record = encodeRecord({
      seed: world.seed,
      config: world.cfg,
      interventions: world.interventions,
    });
    this._post({ type: MSG.STATE_SNAPSHOT, state, hash: world.hash(), tick: world.tick, record }, [
      state,
    ]);
  }

  /**
   * Run one batch of ticks, post any due snapshot/chronicle/stats/status
   * events, and return how many ticks ran this call.
   * @returns {{ ticks: number, behind: boolean }}
   */
  pump() {
    const world = this.world;
    const now = this._now();
    const dt = now - this.lastNow;
    this.lastNow = now;

    if (!world || this.paused) {
      return { ticks: 0, behind: false };
    }

    const cfg = world.cfg;
    this.acc += (dt / 1000) * this.speed * cfg.sim.tps;

    let behind = false;
    if (this.acc > cfg.sim.tps) {
      this.acc = cfg.sim.tps;
      behind = true;
    }

    const budgetMs = this._budgetMsOverride ?? cfg.sim.batchBudgetMs;
    const batchStart = this._now();
    let ticks = 0;
    while (this.acc >= 1 && this._now() - batchStart < budgetMs) {
      world.step();
      this.acc -= 1;
      ticks++;
    }

    this._tpsTickAccum += ticks;
    this._tpsTimeAccum += dt / 1000;

    this._maybeSendSnapshot();
    this._flushChronicle();
    this._sendPhylogeny();
    this._maybeSendStats();
    this._maybeSendStatus(now, behind);

    return { ticks, behind };
  }

  /**
   * @returns {void}
   */
  _maybeSendSnapshot() {
    if (this._pendingSnapshotFlags === null || !this.pool) return;
    const buffer = this.pool.acquire();
    if (!buffer) return; // no free buffer; retried on the next pump().

    const world = this._requireWorld();
    const flags = this._pendingSnapshotFlags;
    encodeSnapshot(world, buffer, {
      flags,
      selectedId: this.selectedId,
      terrainDirty: this._terrainDirty,
      tps: this.achievedTps,
      speed: this.speed,
    });
    this._terrainDirty = false;
    this._pendingSnapshotFlags = null;
    this._post({ type: MSG.SNAPSHOT, buffer }, [buffer]);
  }

  /**
   * @returns {void}
   */
  _flushChronicle() {
    const world = this._requireWorld();
    const entries = world.chronicle.flush();
    if (entries) this._post({ type: MSG.CHRONICLE, entries });
  }

  /**
   * @returns {void}
   */
  _maybeSendStats() {
    const world = this._requireWorld();
    const stats = world.stats;
    if (stats.n === this._lastStatsN) return;
    this._lastStatsN = stats.n;

    const idx = (stats.head - 1 + stats.capacity) % stats.capacity;
    /** @type {[number, number][]} every species ever created, [id, current count] (0 for extinct — P3-08's Charts pane draws those thinner). */
    const species = [];
    for (let id = 0; id < world.species.n; id++) {
      species.push([id, world.species.count[id]]);
    }
    this._post({
      type: MSG.STATS,
      tick: stats.tick[idx],
      light: stats.light[idx],
      pop: stats.pop[idx],
      herb: stats.herb[idx],
      omni: stats.omni[idx],
      carn: stats.carn[idx],
      plantsFraction: stats.plantsFraction[idx],
      diversity: stats.diversity[idx],
      speciesLiving: stats.speciesLiving[idx],
      species,
    });
  }

  /**
   * @param {number} now
   * @param {boolean} behind
   * @returns {void}
   */
  _maybeSendStatus(now, behind) {
    if (now - this._lastStatusPostAt < 250) return;
    this._lastStatusPostAt = now;

    this.achievedTps = this._tpsTimeAccum > 0 ? this._tpsTickAccum / this._tpsTimeAccum : 0;
    this._tpsTickAccum = 0;
    this._tpsTimeAccum = 0;

    const world = this._requireWorld();
    const stats = world.stats;
    const idx = stats.n > 0 ? (stats.head - 1 + stats.capacity) % stats.capacity : -1;
    this._post({
      type: MSG.STATUS,
      tick: world.tick,
      tps: this.achievedTps,
      speed: this.speed,
      pop: world.store.count,
      behind,
      light: world.light,
      season: season(world.tick, world.cfg),
      dayFraction: dayFraction(world.tick, world.cfg),
      herb: idx === -1 ? 0 : stats.herb[idx],
      omni: idx === -1 ? 0 : stats.omni[idx],
      carn: idx === -1 ? 0 : stats.carn[idx],
      plantsFraction: idx === -1 ? 0 : stats.plantsFraction[idx],
      speciesLiving: idx === -1 ? 0 : stats.speciesLiving[idx],
      speciesTotal: world.species.n,
    });
  }
}
