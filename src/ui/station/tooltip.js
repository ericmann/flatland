/**
 * The map tooltip (SPEC §5.4, mockup `#tip`): mouse-only, follows the
 * cursor. Organism → `Name · energy NN`; tile → `terrain · plants NN%`,
 * plus `· scent a/b/c/d` (P3-02) when pheromone data is available (only
 * when at least one scent lens is on — SPEC §6.4's `FLAG_PHEROMONE`).
 *
 * Interpretation: the mockup's tooltip also shows a `goal` and a raw
 * `energy` number for hovered organisms, but the real snapshot protocol
 * (SPEC §6.4) only ever carries brain outputs (a goal's inputs) and raw
 * energy for the *selected* organism's record (`FLAG_SELECTED`), not for
 * arbitrary hovered ones in the compact per-frame SoA — every other
 * organism there only has `energyFrac` (a 0-255 fraction of its energy
 * cap). Requesting the full record for whatever organism the mouse
 * happens to be over would be far heavier than a tooltip warrants, so
 * this tooltip omits `goal` and shows `energy` as a percentage.
 */
const TERRAIN_NAMES = ['water', 'sand', 'mud', 'grass', 'scrub', 'rock'];

/**
 * @param {Document} [doc]
 * @returns {{ el: HTMLElement, move: (x: number, y: number) => void, show: (text: string) => void, hide: () => void }}
 */
export function createTooltip(doc = document) {
  const el = doc.createElement('div');
  el.id = 'tip';
  el.style.display = 'none';

  /**
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  function move(x, y) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  /**
   * @param {string} text
   * @returns {void}
   */
  function show(text) {
    el.textContent = text;
    el.style.display = 'block';
  }

  /** @returns {void} */
  function hide() {
    el.style.display = 'none';
  }

  return { el, move, show, hide };
}

/**
 * @param {number} terrainType
 * @param {number} plantsFraction 0..1
 * @param {number[]} [scentFractions] 0..1 per channel, only when `FLAG_PHEROMONE` data is available
 * @returns {string}
 */
export function tileTooltipText(terrainType, plantsFraction, scentFractions) {
  const name = TERRAIN_NAMES[terrainType] ?? 'unknown';
  let text = `${name} · plants ${Math.round(plantsFraction * 100)}%`;
  if (scentFractions) {
    text += ` · scent ${scentFractions.map((v) => Math.round(v * 100)).join('/')}`;
  }
  return text;
}

/**
 * @param {string} name
 * @param {number} energyFrac 0-255 (SPEC §6.4 snapshot `orgs.energyFrac`)
 * @returns {string}
 */
export function organismTooltipText(name, energyFrac) {
  return `${name} · energy ${Math.round((energyFrac / 255) * 100)}%`;
}
