/**
 * The Phase 1 policy (a stand-in for `brain.forward`, replaced in P2-03),
 * the permanent bootstrap reflex layer, movement, metabolism and aging
 * (SPEC §4.5, §4.7). Reads `world.inputs` (from `senses.gather`), writes
 * `world.outputs`, and mutates organism position/energy/age directly.
 *
 * Determinism (SPEC §3.1, §6.3): slot order throughout; `world.rng` is
 * consumed only in the policy's wander branch; `fmath` only.
 */
import { sin, cos, wrapAngle, clamp, TAU } from './fmath.js';
import { TRAIT, TRAIT_COUNT, BRAIN_INPUTS, BRAIN_OUTPUTS } from './genome.js';
import { INPUT } from './senses.js';
import { TERRAIN } from './terrain.js';
import { DEATH, FIRST_SWIM } from './world.js';
import { KIND, sentence } from './chronicle.js';
import { regionName } from './names.js';

/** Output vector layout (= genome.js's BRAIN_OUTPUTS = 8). */
export const OUTPUT = Object.freeze({
  turn: 0,
  throttle: 1,
  eat: 2,
  emit0: 3,
  emit1: 4,
  emit2: 5,
  emit3: 6,
  breed: 7,
});

/**
 * The Phase 1 reflex policy: flee a sensed threat, else steer toward
 * sensed food, else wander. Stands in for `brain.forward` until P2-03.
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function policy(world, i) {
  const inputs = world.inputs;
  const outputs = world.outputs;
  const inOff = i * BRAIN_INPUTS;
  const outOff = i * BRAIN_OUTPUTS;

  const threatProx = inputs[inOff + INPUT.threatProx];
  const threatCos = inputs[inOff + INPUT.threatCos];
  const threatSin = inputs[inOff + INPUT.threatSin];
  const foodMag = inputs[inOff + INPUT.foodMag];
  const foodSin = inputs[inOff + INPUT.foodSin];
  const hunger = inputs[inOff + INPUT.hunger];

  let turn;
  let throttle;
  let eat;
  if (threatProx > 0) {
    turn = threatCos > 0 ? (threatSin >= 0 ? -1 : 1) : clamp(-2 * threatSin, -1, 1);
    throttle = 1;
    eat = 0;
  } else if (foodMag > 0) {
    turn = clamp(2 * foodSin, -1, 1);
    throttle = hunger > 0.3 ? 0.7 : 0.3;
    eat = hunger > 0.2 ? 1 : 0;
  } else {
    turn = world.rng.range(-0.3, 0.3);
    throttle = 0.4;
    eat = 0;
  }

  outputs[outOff + OUTPUT.turn] = turn;
  outputs[outOff + OUTPUT.throttle] = throttle;
  outputs[outOff + OUTPUT.eat] = eat;
  outputs[outOff + OUTPUT.breed] = 1;
  outputs[outOff + OUTPUT.emit0] = 0;
  outputs[outOff + OUTPUT.emit1] = 0;
  outputs[outOff + OUTPUT.emit2] = 0;
  outputs[outOff + OUTPUT.emit3] = 0;
}

/**
 * The permanent bootstrap reflex (SPEC §4.7 ⚠️): regardless of the policy
 * (or, later, the brain), force-eat on a food tile when hungry enough, and
 * stand still while eating. Always applied.
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function reflexLayer(world, i) {
  const store = world.store;
  const outputs = world.outputs;
  const outOff = i * BRAIN_OUTPUTS;

  const tile = Math.floor(store.y[i]) * world.width + Math.floor(store.x[i]);
  const hunger = 1 - store.energy[i] / store.energyMax[i];
  const hasFood = world.plants[tile] > 0 || world.carcass[tile] > 0;
  if (hasFood && hunger > world.cfg.reflex.hungerGate) {
    outputs[outOff + OUTPUT.eat] = 1;
  }
  if (outputs[outOff + OUTPUT.eat] >= 0.5) {
    outputs[outOff + OUTPUT.throttle] = 0;
  }
}

/**
 * Move the organism per its outputs (SPEC §4.1, §4.7): turn, then step
 * forward at speed*throttle/moveCost. Hard walls stop movement and turn
 * the organism around. Water stops movement and turns it a quarter-turn
 * for a non-swimmer (`pheno.swim < swim.threshold`); a swimmer crosses it
 * instead, paying `swim.moveCost` on the water tile in place of
 * `terrain.moveCost[WATER]` (SPEC §4.2, Phase 5, P5-03). The first
 * organism ever to land on water fires a one-time `first` chronicle entry
 * (SPEC §4.11), following the P3-07 `firsts` bitfield pattern.
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function act(world, i) {
  if (!world.cfg.movement.enabled) return;

  const store = world.store;
  const cfg = world.cfg;
  const outputs = world.outputs;
  const outOff = i * BRAIN_OUTPUTS;
  const turn = outputs[outOff + OUTPUT.turn];
  const throttle = outputs[outOff + OUTPUT.throttle];

  const heading = wrapAngle(store.heading[i] + turn * cfg.organisms.turnRate);
  const hereTile = Math.floor(store.y[i]) * world.width + Math.floor(store.x[i]);
  const hereType = world.terrain[hereTile];
  const moveCost = hereType === TERRAIN.WATER ? cfg.swim.moveCost : cfg.terrain.moveCost[hereType];
  const speed = store.pheno[i * TRAIT_COUNT + TRAIT.speed];
  const v = (speed * throttle) / moveCost;

  // Rounded to float32 *before* the bounds check, not after: store.x/y are
  // Float32Array, so an unrounded double just under width/height (passing
  // the check) can round up to exactly width/height once stored, putting
  // the organism out of bounds (found via P2-01's bounds.test.js — adding
  // mutation's rng draws shifted seed 3's whole sequence enough to finally
  // hit this always-latent P1-06 edge case).
  const nx = Math.fround(store.x[i] + cos(heading) * v);
  const ny = Math.fround(store.y[i] + sin(heading) * v);

  if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) {
    store.heading[i] = wrapAngle(heading + TAU / 2);
    return;
  }

  const destTile = Math.floor(ny) * world.width + Math.floor(nx);
  const destIsWater = world.terrain[destTile] === TERRAIN.WATER;
  if (destIsWater) {
    const swim = store.pheno[i * TRAIT_COUNT + TRAIT.swim];
    if (swim < cfg.swim.threshold) {
      store.heading[i] = wrapAngle(heading + TAU / 4);
      return;
    }
  }

  store.x[i] = nx;
  store.y[i] = ny;
  store.heading[i] = heading;

  if (destIsWater && !(world.firsts & FIRST_SWIM)) {
    world.firsts |= FIRST_SWIM;
    const place = regionName(nx, ny, world.terrain, world.width, world.height);
    const text = sentence(KIND.FIRST, {
      variant: 'swim',
      name: world.species.names[store.species[i]],
    });
    world.chronicle.add(world.tick, KIND.FIRST, text, place, [store.species[i]]);
  }
}

/**
 * Pay the metabolic cost for this tick (SPEC §4.5), inflated by the gap
 * between an organism's preferred temperature and ambient (SPEC §4.3,
 * P5-01); marks the organism `dying` (STARVED) if that empties it. The
 * realised (Float32-rounded) payment is dissipated energy.
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function metabolise(world, i) {
  if (!world.cfg.metabolism.enabled) return;

  const store = world.store;
  const cfg = world.cfg;
  const outOff = i * BRAIN_OUTPUTS;
  const throttle = world.outputs[outOff + OUTPUT.throttle];

  const pOff = i * TRAIT_COUNT;
  const size = store.pheno[pOff + TRAIT.size];
  const metab = store.pheno[pOff + TRAIT.metabolism];
  const speed = store.pheno[pOff + TRAIT.speed];
  const speedMax = cfg.phenotype.speed[1];

  // Temperature cost (SPEC §4.3, P5-01): the further an organism's
  // preferred temperature sits from ambient, the more its metabolism
  // costs. A no-op multiplier (1) when temperature is disabled.
  const tempFactor = cfg.temperature.enabled
    ? 1 + cfg.temperature.costGain * Math.abs(store.pheno[pOff + TRAIT.prefTemp] - world.ambient)
    : 1;

  const cost =
    cfg.metabolism.base *
    metab *
    (0.5 + size) *
    (1 + (cfg.metabolism.moveCost * throttle * speed) / speedMax) *
    tempFactor;

  const before = store.energy[i];
  const intended = Math.min(before, cost);
  store.energy[i] = Math.fround(before - intended);
  const realised = before - store.energy[i];
  world.ledger.dissipated += realised;
  world.ledger.flows.metabolism += realised;

  if (store.energy[i] <= 0) {
    world.dying[i] = DEATH.STARVED;
  }
}

/**
 * Age the organism one tick; marks it `dying` (OLD_AGE) past its lifespan
 * (SPEC §4.5).
 * @param {import('./world.js').World} world
 * @param {number} i
 * @returns {void}
 */
export function ageOrganism(world, i) {
  if (!world.cfg.aging.enabled) return;
  const store = world.store;
  store.age[i]++;
  if (store.age[i] > store.lifespanTicks[i]) {
    world.dying[i] = DEATH.OLD_AGE;
  }
}
