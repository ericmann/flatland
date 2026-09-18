/**
 * The main-thread side of the sim protocol (SPEC §6.4): wraps a `Worker`
 * or the main-thread fallback (both expose `postMessage`/`onmessage`) with
 * a typed send/subscribe API. Never touches `src/core` state directly.
 */
import { createMainThreadSim } from '../sim/main-thread.js';

export class SimClient {
  /**
   * @param {{ postMessage: (msg: *, transfer?: Transferable[]) => void, onmessage: ((e: { data: * }) => void) | null }} transport
   *   a `Worker` or `createMainThreadSim()`'s return value.
   */
  constructor(transport) {
    this.transport = transport;
    /** @type {Map<string, Set<(msg: *) => void>>} */
    this._handlers = new Map();
    transport.onmessage = (e) => this._dispatch(e.data);
  }

  /**
   * Send one command: `{ type, ...payload }`, with any transferables.
   * @param {string} type
   * @param {*} [payload]
   * @param {Transferable[]} [transfer]
   * @returns {void}
   */
  send(type, payload = {}, transfer = []) {
    this.transport.postMessage({ type, ...payload }, transfer);
  }

  /**
   * Subscribe to every event of `type`.
   * @param {string} type
   * @param {(msg: *) => void} handler
   * @returns {() => void} unsubscribe
   */
  on(type, handler) {
    let set = this._handlers.get(type);
    if (!set) {
      set = new Set();
      this._handlers.set(type, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  /**
   * @param {*} msg
   * @returns {void}
   */
  _dispatch(msg) {
    const set = this._handlers.get(msg.type);
    if (!set) return;
    for (const handler of set) handler(msg);
  }
}

/**
 * Pick a `Worker` transport when available, else the main-thread fallback
 * (SPEC §6.4, §10: some embedded WebViews have no `Worker`). Both expose
 * the same `postMessage`/`onmessage` surface, so `SimClient` never knows
 * which one it has.
 * @returns {*}
 */
export function createSim() {
  if (typeof Worker === 'function') {
    return new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
  }
  return createMainThreadSim();
}
