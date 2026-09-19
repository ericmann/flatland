/**
 * Rare discrete weather events (SPEC §4.3, Phase 5): rain (a moisture
 * pulse that boosts plant growth-rate) and fog (a temporary global vision
 * penalty). Not a continuous system — each event is a single chronicle
 * entry, and `enabled = false` never rolls.
 *
 * Determinism (SPEC §3.1): exactly one `rng.chance` per event type is
 * drawn every tick (rain, then fog), at a fixed point in `step()` (right
 * after `applyDue`), so the rng stream never depends on which events are
 * currently active — only whether the draw is acted on does.
 */
import { KIND, sentence } from './chronicle.js';
import { regionName } from './names.js';

/** Fixed place name for a rain chronicle entry (SPEC §4.3: "Rain over the valley."). */
const RAIN_PLACE = 'the valley';

/**
 * Roll for one tick's rain and fog events and advance their state
 * (`world.moisture`, `world.fogTicks`). Called once per tick, right
 * after `applyDue`.
 * @param {import('./world.js').World} world
 * @returns {void}
 */
export function weatherTick(world) {
  const cfg = world.cfg.weather;
  if (!cfg.enabled) return;

  // Rain: moisture decays every tick regardless of whether a new event
  // fires this tick, and snaps to 0 once it drops below the "cleared"
  // threshold so the not-while-active gate and the growth multiplier
  // agree on when rain is over.
  if (world.moisture > 0) {
    const decayed = Math.fround(world.moisture * cfg.moistureDecay);
    world.moisture = decayed < cfg.moistureThreshold ? 0 : decayed;
  }
  const rainFires = world.rng.chance(cfg.rainRate);
  if (rainFires && world.moisture <= 0) {
    world.moisture = Math.fround(cfg.rainMoisture);
    const text = sentence(KIND.WEATHER, { text: 'Rain over the valley.' });
    world.chronicle.add(world.tick, KIND.WEATHER, text, RAIN_PLACE, []);
  }

  // Fog: fogTicks counts down every tick regardless of whether a new
  // event fires this tick.
  if (world.fogTicks > 0) world.fogTicks--;
  const fogFires = world.rng.chance(cfg.fogRate);
  if (fogFires && world.fogTicks <= 0) {
    world.fogTicks = cfg.fogTicks;
    const cx = world.width / 2;
    const cy = world.height / 2;
    const place = regionName(cx, cy, world.terrain, world.width, world.height);
    const text = sentence(KIND.WEATHER, { text: `Fog settles on ${place}.` });
    world.chronicle.add(world.tick, KIND.WEATHER, text, place, []);
  }
}
