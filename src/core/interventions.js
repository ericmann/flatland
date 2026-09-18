/**
 * The intervention queue (SPEC §3.6, §5.3): every Hand of God action,
 * config change or rename is an event, queued for a future tick, applied
 * in order, and appended to the permanent log. Only `rain` exists until
 * P4-02 adds the rest.
 */

/**
 * @typedef {{ tick: number, kind: string, [key: string]: * }} InterventionEvent
 */

/**
 * Queue an intervention for a future tick. Keeps `world.pending` sorted by
 * `(tick, insertion order)` — `Array.prototype.sort` is stable (ES2019+),
 * so re-sorting after each push preserves insertion order among equal
 * ticks.
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
export function queueIntervention(world, ev) {
  if (ev.tick < world.tick + 1) {
    throw new Error(
      `intervention tick ${ev.tick} must be >= ${world.tick + 1} (current tick ${world.tick})`,
    );
  }
  world.pending.push(ev);
  world.pending.sort((a, b) => a.tick - b.tick);
}

/**
 * Apply one intervention's effect. Only `rain` is implemented until P4-02.
 * @param {import('./world.js').World} world
 * @param {InterventionEvent} ev
 * @returns {void}
 */
function applyIntervention(world, ev) {
  switch (ev.kind) {
    case 'rain':
      applyRain(world);
      break;
    default:
      throw new Error(`unknown intervention kind: ${ev.kind}`);
  }
}

/**
 * Rain (SPEC §5.3): every tile with plant capacity gets a drink, capped at
 * its cap. The realised delta is counted as `ledger.hand`.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
function applyRain(world) {
  const caps = world.cfg.terrain.plantCap;
  const amount = world.cfg.interventions.rain.amount;
  const plants = world.plants;
  const terrain = world.terrain;
  const ledger = world.ledger;

  for (let i = 0; i < plants.length; i++) {
    const cap = caps[terrain[i]];
    if (cap <= 0) continue;
    const before = plants[i];
    const target = Math.min(cap, before + amount);
    plants[i] = Math.fround(target);
    ledger.hand += plants[i] - before;
  }
}

/**
 * Apply every pending event whose tick equals `world.tick`, in order, and
 * move each into `world.interventions` (the permanent log). This is the
 * first stage of `step()`, after `tick++` and light (SPEC §6.3).
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function applyDue(world) {
  const pending = world.pending;
  let n = 0;
  while (n < pending.length && pending[n].tick === world.tick) {
    n++;
  }
  for (let i = 0; i < n; i++) {
    applyIntervention(world, pending[i]);
    world.interventions.push(pending[i]);
  }
  if (n > 0) {
    pending.splice(0, n);
  }
}
