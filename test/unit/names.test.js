import { describe, it, expect } from 'vitest';
import { TERRAIN } from '../../src/core/terrain.js';
import {
  regionName,
  regionWord,
  HERB_NOUNS,
  CARN_NOUNS,
  OMNI_NOUNS,
} from '../../src/core/names.js';

describe('regionName', () => {
  const w = 300;
  const h = 300;
  // An all-grass terrain isolates the positional wording from the terrain
  // wording.
  const terrain = new Uint8Array(w * h).fill(TERRAIN.GRASS);

  it('is western at x = w/3 - 1 and central at x = w/3', () => {
    const westernName = regionName(w / 3 - 1, h / 2, terrain, w, h);
    const centralName = regionName(w / 3, h / 2, terrain, w, h);
    expect(westernName).toContain('western');
    expect(centralName).toContain('central');
    expect(centralName).not.toContain('western');
  });

  it('has no north/south word at y = 2h/3 - 1 and is southern at y = 2h/3', () => {
    const noWordName = regionName(w / 2, (2 * h) / 3 - 1, terrain, w, h);
    const southernName = regionName(w / 2, (2 * h) / 3, terrain, w, h);
    expect(noWordName).not.toContain('northern');
    expect(noWordName).not.toContain('southern');
    expect(southernName).toContain('southern');
  });

  it('is northern in the top third and eastern in the right third', () => {
    const name = regionName((2 * w) / 3, h / 3 - 1, terrain, w, h);
    expect(name).toContain('northern');
    expect(name).toContain('eastern');
  });

  it('the terrain word follows the tile type at the given position', () => {
    const mixed = new Uint8Array(w * h).fill(TERRAIN.GRASS);
    mixed[Math.floor(h / 2) * w + Math.floor(w / 2)] = TERRAIN.SCRUB;
    const name = regionName(w / 2, h / 2, mixed, w, h);
    expect(name).toContain('scrub');
  });

  it('starts with "the "', () => {
    const name = regionName(w / 2, h / 2, terrain, w, h);
    expect(name.startsWith('the ')).toBe(true);
  });
});

describe('regionWord', () => {
  it('maps each terrain type to its capitalised word, in enum order', () => {
    expect(regionWord(TERRAIN.WATER)).toBe('Shallow');
    expect(regionWord(TERRAIN.SAND)).toBe('Shore');
    expect(regionWord(TERRAIN.MUD)).toBe('Marsh');
    expect(regionWord(TERRAIN.GRASS)).toBe('Meadow');
    expect(regionWord(TERRAIN.SCRUB)).toBe('Scrub');
    expect(regionWord(TERRAIN.ROCK)).toBe('Rock');
  });
});

describe('species noun lists (SPEC §4.10)', () => {
  it('herbivore nouns match the spec list', () => {
    expect(HERB_NOUNS).toEqual(['Grazers', 'Browsers', 'Nibblers', 'Drifters', 'Herds']);
  });

  it('carnivore nouns match the spec list', () => {
    expect(CARN_NOUNS).toEqual(['Stalkers', 'Hunters', 'Lurkers', 'Ambushers']);
  });

  it('omnivore nouns match the spec list', () => {
    expect(OMNI_NOUNS).toEqual(['Foragers', 'Rovers', 'Wanderers']);
  });
});
