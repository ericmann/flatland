/**
 * Auto-save (SPEC §5.6): on an interval, and whenever the tab becomes
 * hidden, ask the sim for its current state and persist it to
 * IndexedDB under the key `'world'`, so a reload can resume instantly
 * without replaying from genesis (P4-06, Decisions §12.4's checkpoint
 * travels alongside it for the resume-time verification replay).
 */

/**
 * @param {{
 *   sim: { send: (type: string, payload?: *) => void, on: (type: string, cb: (msg: *) => void) => (() => void) },
 *   db: { put: (key: string, value: *) => Promise<void> },
 *   cfg: typeof import('../core/config.js').DEFAULTS,
 *   intervalMs?: number,
 *   doc?: Document,
 *   win?: Window & typeof globalThis,
 * }} opts
 * @returns {{ stop: () => void }}
 */
export function startAutosave({
  sim,
  db,
  cfg,
  intervalMs = cfg.persist.autosaveSeconds * 1000,
  doc = document,
  win = window,
}) {
  const off = sim.on('stateSnapshot', (msg) => {
    db.put('world', {
      record: msg.record,
      state: msg.state,
      hash: msg.hash,
      tick: msg.tick,
      checkpoint: msg.checkpoint,
      checkpointTick: msg.checkpointTick,
      savedAt: Date.now(),
    });
  });

  /** @returns {void} */
  function save() {
    sim.send('snapshotState');
  }

  const timer = win.setInterval(save, intervalMs);

  /** @returns {void} */
  function onVisibilityChange() {
    if (doc.hidden) save();
  }
  doc.addEventListener('visibilitychange', onVisibilityChange);

  return {
    stop() {
      win.clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      off();
    },
  };
}
