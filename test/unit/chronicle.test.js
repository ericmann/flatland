import { describe, it, expect } from 'vitest';
import { Chronicle, KIND, sentence, deathVerb } from '../../src/core/chronicle.js';
import { checkFamine } from '../../src/core/ecology.js';
import {
  recordKill,
  flushKillTable,
  FIRST_HUNTERS,
  FIRST_NIGHT,
  FIRST_SWIM,
} from '../../src/core/world.js';
import { TRAIT, TRAIT_COUNT, BRAIN_OUTPUTS } from '../../src/core/genome.js';
import { act, OUTPUT } from '../../src/core/reflex.js';
import { TERRAIN } from '../../src/core/terrain.js';
import { makeWorld, makeOrganism } from '../helpers.js';

describe('genesis chronicle entry', () => {
  // Found by kind, not by index 0 (P3-07): a genesis founder can already
  // qualify for a `first` entry (e.g. first-night), which species.create()
  // logs *during* runGenesis's per-lineage loop, before the genesis entry
  // itself is appended at the end.
  function genesisEntry(world) {
    return world.chronicle.entries.find((e) => e.kind === KIND.GENESIS);
  }

  it('exists at tick 0 with kind genesis and a place', () => {
    const world = makeWorld({ seed: 5 });
    expect(world.chronicle.entries.length).toBeGreaterThanOrEqual(1);
    const entry = genesisEntry(world);
    expect(entry.tick).toBe(0);
    expect(entry.kind).toBe(KIND.GENESIS);
    expect(typeof entry.place).toBe('string');
    expect(entry.place.length).toBeGreaterThan(0);
    expect(entry.text).toMatch(/^Genesis\. \d+ lineages seeded: .+\.$/);
  });

  it('genesis lists lineage names', () => {
    const world = makeWorld({ seed: 5 });
    const entry = genesisEntry(world);
    for (const name of world.species.names) {
      expect(entry.text).toContain(name);
    }
    expect(world.species.names.length).toBe(
      world.cfg.genesis.herbivoreLineages + world.cfg.genesis.carnivoreLineages,
    );
  });
});

describe('sentence (P2-04)', () => {
  it('split and extinct sentences name both lineages and a place', () => {
    const split = sentence(KIND.SPLIT, {
      name: 'Meadow Grazers II',
      parent: 'Meadow Grazers',
      place: 'the northern meadow',
    });
    expect(split).toContain('Meadow Grazers II');
    expect(split).toContain('Meadow Grazers');
    expect(split).toContain('the northern meadow');

    const extinct = sentence(KIND.EXTINCT, {
      name: 'Rock Stalkers',
      verb: deathVerb(1), // DEATH.STARVED
      place: 'the eastern rocks',
    });
    expect(extinct).toContain('Rock Stalkers');
    expect(extinct).toContain('starved');
    expect(extinct).toContain('the eastern rocks');
  });
});

describe('Chronicle', () => {
  it('flush returns only new entries and then null', () => {
    const c = new Chronicle();
    expect(c.flush()).toBeNull();
    c.add(0, KIND.GENESIS, 'a', 'place a');
    c.add(1, KIND.SPLIT, 'b', 'place b');
    const first = c.flush();
    expect(first).not.toBeNull();
    expect(first.map((e) => e.text)).toEqual(['a', 'b']);
    expect(c.flush()).toBeNull();
    c.add(2, KIND.EXTINCT, 'c', 'place c');
    const second = c.flush();
    expect(second.map((e) => e.text)).toEqual(['c']);
    expect(c.flush()).toBeNull();
  });

  it('entries are append-only and ordered by tick', () => {
    const c = new Chronicle();
    c.add(5, KIND.GENESIS, 'a', 'x');
    c.add(10, KIND.SPLIT, 'b', 'y');
    c.add(20, KIND.EXTINCT, 'c', 'z');
    expect(c.entries.map((e) => e.tick)).toEqual([5, 10, 20]);
    expect(c.entries.length).toBe(3);
    // flush() does not remove or mutate entries.
    c.flush();
    expect(c.entries.length).toBe(3);
    expect(c.entries[0].text).toBe('a');
  });

  it('add() defaults subjects to an empty array', () => {
    const c = new Chronicle();
    c.add(0, KIND.GENESIS, 'a', 'x');
    expect(c.entries[0].subjects).toEqual([]);
  });
});

describe('famine (P3-05)', () => {
  it('fires once on crossing below the threshold and re-arms above twice the threshold', () => {
    const world = makeWorld({ width: 8, height: 8, terrain: TERRAIN.GRASS, organisms: [] });
    world.chronicle.flush(); // discard the genesis entry.
    const threshold = world.cfg.famine.plantFraction;

    function sampleAt(fraction) {
      world.stats.sample(world);
      const idx = (world.stats.head - 1 + world.stats.capacity) % world.stats.capacity;
      world.stats.plantsFraction[idx] = fraction;
      checkFamine(world);
    }
    function famineEntries() {
      return (world.chronicle.flush() ?? []).filter((e) => e.kind === KIND.FAMINE);
    }

    expect(world.famineArmed).toBe(1);

    sampleAt(threshold - 0.01);
    expect(famineEntries()).toHaveLength(1);
    expect(world.famineArmed).toBe(0);

    // Still below threshold, but disarmed: no re-fire.
    sampleAt(threshold - 0.01);
    expect(famineEntries()).toHaveLength(0);

    // Recovers above 2x the threshold: re-arms, no entry.
    sampleAt(2.1 * threshold);
    expect(world.famineArmed).toBe(1);
    expect(famineEntries()).toHaveLength(0);

    // Crosses below again: fires again.
    sampleAt(threshold - 0.01);
    expect(famineEntries()).toHaveLength(1);
  });
});

describe('kill aggregation (P3-07)', () => {
  it('kills are aggregated per prey lineage per day and flushed at dawn', () => {
    const world = makeWorld({ width: 8, height: 8, terrain: TERRAIN.GRASS, organisms: [] });
    world.chronicle.flush();
    const preyId = world.species.create(world, 0, -1, 2, 2);
    const predId = world.species.create(world, 0, -1, 3, 3);
    world.chronicle.flush(); // discard any `first` entries these two triggered.

    recordKill(world, preyId, predId, 2, 2);
    recordKill(world, preyId, predId, 2, 2);
    recordKill(world, preyId, predId, 3, 3);

    expect(world.chronicle.flush()).toBeNull(); // not flushed until dawn.

    flushKillTable(world);
    const hunts = (world.chronicle.flush() ?? []).filter((e) => e.kind === KIND.HUNT_SUMMARY);
    expect(hunts).toHaveLength(1);
    expect(hunts[0].text).toContain('3');
    expect(hunts[0].subjects).toEqual([preyId, predId]);

    // The table resets after a flush.
    flushKillTable(world);
    expect(world.chronicle.flush()).toBeNull();
  });

  it('singular and plural hunt sentences', () => {
    const ctx = { prey: 'Meadow Grazers', pred: 'Rock Lurkers', place: 'the meadow' };
    expect(sentence(KIND.HUNT_SUMMARY, { ...ctx, n: 1, others: false })).toBe(
      'One of the Meadow Grazers was taken by Rock Lurkers near the meadow.',
    );
    expect(sentence(KIND.HUNT_SUMMARY, { ...ctx, n: 5, others: false })).toBe(
      'A hard night for the Meadow Grazers — 5 taken by Rock Lurkers.',
    );
    expect(sentence(KIND.HUNT_SUMMARY, { ...ctx, n: 5, others: true })).toBe(
      'A hard night for the Meadow Grazers — 5 taken by Rock Lurkers and others.',
    );
  });

  it('every KIND produces a non-empty sentence with a place', () => {
    const place = 'the meadow';
    /** @type {Record<string, *>} */
    const ctxByKind = {
      [KIND.GENESIS]: { n: 2, names: ['A', 'B'] },
      [KIND.SPLIT]: { name: 'B', parent: 'A', place },
      [KIND.EXTINCT]: { name: 'A', verb: 'starved', place },
      [KIND.MIGRATION]: { name: 'A', edge: 'west', carn: false },
      [KIND.HUNT_SUMMARY]: { n: 1, prey: 'A', pred: 'B', others: false, place },
      [KIND.FAMINE]: { pct: 5, season: 'Winter' },
      [KIND.PLAGUE]: { name: 'A', place, n: 12 },
      [KIND.INTERVENTION]: { text: 'Fire in the meadow' },
      [KIND.NAMING]: { old: 'A', new: 'B' },
      [KIND.FIRST]: { variant: 'hunters', name: 'A', ancestor: 'B' },
      [KIND.WEATHER]: { text: 'A storm rolls in.' },
    };
    for (const kind of Object.values(KIND)) {
      const text = sentence(kind, ctxByKind[kind]);
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

describe('first entries (P3-07)', () => {
  /**
   * Write a neutral (0.5) trait block at `offset`, then apply named
   * overrides — a controlled genome for exercising `species.create()`'s
   * first-hunters/first-night checks without genesis's own randomness.
   */
  function setGenome(world, offset, overrides) {
    for (let t = 0; t < TRAIT_COUNT; t++) world.store.genome[offset + t] = 0.5;
    for (const [trait, v] of Object.entries(overrides)) {
      world.store.genome[offset + TRAIT[trait]] = v;
    }
  }

  it('first hunters and first night fire exactly once', () => {
    const world = makeWorld({ width: 8, height: 8, terrain: TERRAIN.GRASS, organisms: [] });
    world.chronicle.flush();
    const gLen = world.store.genomeLength;

    setGenome(world, 0, { diet: 0.1, visionPeak: 0.5 });
    const herbAncestor = world.species.create(world, 0, -1, 2, 2);
    world.chronicle.flush();

    // A carnivore descending from a herbivore: fires FIRST_HUNTERS.
    setGenome(world, gLen, { diet: 0.9, visionPeak: 0.5 });
    world.species.create(world, gLen, herbAncestor, 3, 3);
    expect(world.firsts & FIRST_HUNTERS).toBeTruthy();
    let entries = (world.chronicle.flush() ?? []).filter((e) => e.kind === KIND.FIRST);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toContain('hunters');

    // Another carnivore descending from a non-carnivore: does not re-fire.
    setGenome(world, 2 * gLen, { diet: 0.9, visionPeak: 0.5 });
    world.species.create(world, 2 * gLen, herbAncestor, 4, 4);
    expect((world.chronicle.flush() ?? []).filter((e) => e.kind === KIND.FIRST)).toHaveLength(0);

    // A species with low visionPeak: fires FIRST_NIGHT.
    setGenome(world, 3 * gLen, { diet: 0.1, visionPeak: 0.1 });
    world.species.create(world, 3 * gLen, -1, 5, 5);
    expect(world.firsts & FIRST_NIGHT).toBeTruthy();
    entries = (world.chronicle.flush() ?? []).filter((e) => e.kind === KIND.FIRST);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toContain('night');

    // Another low-visionPeak species: does not re-fire.
    setGenome(world, 4 * gLen, { diet: 0.1, visionPeak: 0.05 });
    world.species.create(world, 4 * gLen, -1, 6, 6);
    expect((world.chronicle.flush() ?? []).filter((e) => e.kind === KIND.FIRST)).toHaveLength(0);
  });

  it('the first water crossing fires once', () => {
    const world = makeWorld({
      width: 20,
      height: 20,
      terrain: (x) => (x >= 12 ? TERRAIN.WATER : TERRAIN.GRASS),
      organisms: [],
    });
    // A named species for the swimmer to belong to (`store.species[slot]`
    // defaults to 0, and this is the first species created, so it also
    // gets id 0 — no extra assignment needed).
    world.species.create(world, 0, -1, 2, 2);
    world.chronicle.flush();

    const startX = 11.9;
    const swimmer = makeOrganism(world, { x: startX, y: 10, traits: { speed: 1, swim: 1 } });
    world.store.heading[swimmer] = 0; // +x, straight into the water
    const outOff = swimmer * BRAIN_OUTPUTS;
    world.outputs[outOff + OUTPUT.turn] = 0;
    world.outputs[outOff + OUTPUT.throttle] = 1;

    act(world, swimmer);

    expect(world.firsts & FIRST_SWIM).toBeTruthy();
    let entries = (world.chronicle.flush() ?? []).filter((e) => e.kind === KIND.FIRST);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe(`The ${world.species.names[0]} are the first to cross water.`);

    // A second swimmer crossing does not re-fire.
    const other = makeOrganism(world, { x: startX, y: 15, traits: { speed: 1, swim: 1 } });
    world.store.heading[other] = 0;
    const otherOff = other * BRAIN_OUTPUTS;
    world.outputs[otherOff + OUTPUT.turn] = 0;
    world.outputs[otherOff + OUTPUT.throttle] = 1;
    act(world, other);
    entries = (world.chronicle.flush() ?? []).filter((e) => e.kind === KIND.FIRST);
    expect(entries).toHaveLength(0);
  });
});
