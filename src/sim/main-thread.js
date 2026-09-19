/**
 * The Worker-less fallback (SPEC §6.4, §10): some embedded WebViews have
 * no `Worker`. Runs the identical `Scheduler` in-process behind the same
 * `{ postMessage, onmessage, terminate }` surface a real `Worker` exposes,
 * so `sim-client.js` never has to know which one it has.
 */
import { DEFAULTS } from '../core/config.js';
import { Scheduler } from './scheduler.js';
import { MSG } from './protocol.js';

/**
 * @returns {{ postMessage: (msg: *, transfer?: Transferable[]) => void, onmessage: ((e: { data: * }) => void) | null, terminate: () => void }}
 */
export function createMainThreadSim() {
  /** @type {((e: { data: * }) => void) | null} */
  let onmessage = null;

  const scheduler = new Scheduler({
    now: () => performance.now(),
    post: (msg) => {
      if (onmessage) onmessage({ data: msg });
    },
    budgetMs: DEFAULTS.sim.fallbackBudgetMs,
  });

  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  function loop() {
    scheduler.pump();
    timer = scheduler.paused ? null : setTimeout(loop, 0);
  }

  function startLoopIfNeeded() {
    if (timer === null && !scheduler.paused) timer = setTimeout(loop, 0);
  }

  return {
    postMessage(msg) {
      scheduler.handle(msg);
      if (msg.type === MSG.LOAD || msg.type === MSG.RESUME) startLoopIfNeeded();
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn) {
      onmessage = fn;
    },
    terminate() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
