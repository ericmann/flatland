/**
 * The main-thread <-> sim Worker message protocol (SPEC §6.4). Every
 * message is `{ type, ...payload }`; transferable buffers travel in a
 * separate `transfer` list alongside the message, never inside it.
 *
 * `hash` is deliberately the same string for both the command (main asks
 * for the current `world.hash()`) and the event (the sim's reply carries
 * it) — a request/reply pair sharing one message type, like the browser's
 * own `postMessage`/`onmessage` pattern. Every other command and event
 * name is used in one direction only.
 */

/** Every command (main -> sim) and event (sim -> main) message type. */
export const MSG = Object.freeze({
  // Commands (main -> sim).
  LOAD: 'load',
  SET_SPEED: 'setSpeed',
  INTERVENE: 'intervene',
  SELECT: 'select',
  REQUEST_SNAPSHOT: 'requestSnapshot',
  RELEASE_SNAPSHOT: 'releaseSnapshot',
  SNAPSHOT_STATE: 'snapshotState',
  PAUSE: 'pause',
  RESUME: 'resume',
  // Shared request/reply.
  HASH: 'hash',
  // Events (sim -> main).
  LOADED: 'loaded',
  SNAPSHOT: 'snapshot',
  STATUS: 'status',
  CHRONICLE: 'chronicle',
  PHYLOGENY: 'phylogeny',
  STATS: 'stats',
  STATE_SNAPSHOT: 'stateSnapshot',
});

/** Snapshot section flag bits (SPEC §6.4), passed to `requestSnapshot` and read back from the header. */
export const FLAG_TERRAIN = 1;
export const FLAG_PHEROMONE = 2;
export const FLAG_SELECTED = 4;
export const FLAG_EVENTS = 8;

/**
 * @typedef {Object} LoadPayload
 * @property {number} seed
 * @property {*} [config] a `makeConfig()` override tree
 * @property {import('../core/interventions.js').InterventionEvent[]} [interventions]
 */

/**
 * @typedef {Object} LoadedEvent
 * @property {number} seed
 * @property {number} tick
 * @property {number} width
 * @property {number} height
 * @property {string} hash
 */

/**
 * @typedef {Object} SetSpeedPayload
 * @property {number} speed 0 pauses; 1 is real-time.
 */

/**
 * @typedef {Object} SelectPayload
 * @property {number} id an organism's stable id, or 0 to clear selection.
 */

/**
 * @typedef {Object} RequestSnapshotPayload
 * @property {number} flags a bitwise-OR of FLAG_TERRAIN/FLAG_PHEROMONE/FLAG_SELECTED/FLAG_EVENTS.
 */

/**
 * @typedef {Object} SnapshotEvent
 * @property {ArrayBuffer} buffer transferred, not copied.
 */

/**
 * @typedef {Object} ReleaseSnapshotPayload
 * @property {ArrayBuffer} buffer returned to the sim's `SnapshotPool`.
 */

/**
 * @typedef {Object} StatusEvent
 * @property {number} tick
 * @property {number} tps achieved ticks/s, not the requested rate.
 * @property {number} speed
 * @property {number} pop
 * @property {boolean} behind true when the wall-clock target was dropped this batch.
 */

/**
 * @typedef {Object} HashEvent
 * @property {string} hash
 */
