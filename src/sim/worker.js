/**
 * The sim Worker entry point (SPEC §6.4): the identical `Scheduler`,
 * pumped by a `MessageChannel` self-post loop (faster than
 * `setTimeout(0)`, and this file is the one place allowed to use it).
 */
import { Scheduler } from './scheduler.js';
import { MSG } from './protocol.js';

const scheduler = new Scheduler({
  now: () => performance.now(),
  post: (msg, transfer) => self.postMessage(msg, { transfer: transfer ?? [] }),
});

const channel = new MessageChannel();
let running = false;

channel.port1.onmessage = () => {
  scheduler.pump();
  if (running && !scheduler.paused) {
    channel.port2.postMessage(0);
  } else {
    running = false;
  }
};

/**
 * Start the self-perpetuating pump loop if it isn't already running.
 * @returns {void}
 */
function startLoopIfNeeded() {
  if (running) return;
  running = true;
  channel.port2.postMessage(0);
}

self.onmessage = (e) => {
  const msg = e.data;
  scheduler.handle(msg);
  if (msg.type === MSG.LOAD || msg.type === MSG.RESUME) startLoopIfNeeded();
};
