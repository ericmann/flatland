/**
 * Region and lineage naming (SPEC §4.10). Pure, deterministic string
 * generation from position and terrain — no randomness of its own.
 */
import { TERRAIN } from './terrain.js';

/** Capitalised terrain word, indexed by TERRAIN enum, for species names. */
const TERRAIN_WORD = Object.freeze(['Shallow', 'Shore', 'Marsh', 'Meadow', 'Scrub', 'Rock']);

/** Lowercase terrain word, indexed by TERRAIN enum, for region sentences. */
const REGION_TERRAIN_WORD = Object.freeze([
  'shallows',
  'shore',
  'marsh',
  'meadow',
  'scrub',
  'rocks',
]);

/**
 * The capitalised terrain word used in species names, e.g. "Meadow" in
 * "Meadow Grazers".
 * @param {number} type a TERRAIN value
 * @returns {string}
 */
export function regionWord(type) {
  return TERRAIN_WORD[type];
}

/**
 * A region sentence for a position: "the [northern|southern|][western|
 * central|eastern] [shallows|shore|marsh|meadow|scrub|rocks]" (SPEC
 * §4.10), using thirds of the map and the terrain at that tile.
 * @param {number} x
 * @param {number} y
 * @param {Uint8Array} terrain flat w*h grid of TERRAIN values
 * @param {number} w
 * @param {number} h
 * @returns {string}
 */
export function regionName(x, y, terrain, w, h) {
  const ns = y < h / 3 ? 'northern ' : y >= (2 * h) / 3 ? 'southern ' : '';
  const ew = x < w / 3 ? 'western' : x >= (2 * w) / 3 ? 'eastern' : 'central';
  const tx = Math.min(w - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(h - 1, Math.max(0, Math.floor(y)));
  const type = terrain[ty * w + tx];
  const terrainWord = REGION_TERRAIN_WORD[type];
  return `the ${ns}${ew} ${terrainWord}`;
}

/** Species nouns for herbivores (SPEC §4.10). */
export const HERB_NOUNS = Object.freeze(['Grazers', 'Browsers', 'Nibblers', 'Drifters', 'Herds']);

/** Species nouns for carnivores (SPEC §4.10). */
export const CARN_NOUNS = Object.freeze(['Stalkers', 'Hunters', 'Lurkers', 'Ambushers']);

/** Species nouns for omnivores (SPEC §4.10). */
export const OMNI_NOUNS = Object.freeze(['Foragers', 'Rovers', 'Wanderers']);

/** Roman numerals for the 1st through 10th repeat of an exhausted name (SPEC §4.10); beyond that, a plain number. */
const ROMAN_SUFFIX = Object.freeze([
  '',
  ' II',
  ' III',
  ' IV',
  ' V',
  ' VI',
  ' VII',
  ' VIII',
  ' IX',
  ' X',
]);

/**
 * A unique species name (SPEC §4.10): `${regionWord(terrainType)}
 * ${noun}`, the noun from the diet class's noun list, starting at
 * `ordinal % nouns.length` and advancing until an unused name is found;
 * once every noun for that region word is taken, appends a roman-numeral
 * (then decimal) suffix and starts again.
 * @param {{ names: string[] }} table anything with a `names` array to check for collisions.
 * @param {'herbivore'|'omnivore'|'carnivore'} dietClass
 * @param {number} terrainType a TERRAIN value
 * @param {number} ordinal a monotonic counter (e.g. the species id), spreading names across the noun list.
 * @returns {string}
 */
export function speciesName(table, dietClass, terrainType, ordinal) {
  const nouns =
    dietClass === 'herbivore' ? HERB_NOUNS : dietClass === 'carnivore' ? CARN_NOUNS : OMNI_NOUNS;
  const word = regionWord(terrainType);
  const used = new Set(table.names);

  for (let suffixIndex = 0; ; suffixIndex++) {
    const suffix =
      suffixIndex < ROMAN_SUFFIX.length ? ROMAN_SUFFIX[suffixIndex] : ` ${suffixIndex + 1}`;
    for (let i = 0; i < nouns.length; i++) {
      const noun = nouns[(ordinal + i) % nouns.length];
      const name = `${word} ${noun}${suffix}`;
      if (!used.has(name)) return name;
    }
  }
}

// Re-exported so callers of names.js don't also need to import terrain.js
// just to pass a TERRAIN value in.
export { TERRAIN };
