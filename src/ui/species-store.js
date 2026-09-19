/**
 * The UI-side phylogeny cache (SPEC §6.4, P2-06): merges `phylogeny`
 * protocol events (a full table on `loaded`, deltas afterward) into one
 * map, so panes (P2-11) can look up a species by id without re-deriving
 * it from a snapshot every frame.
 */
export class SpeciesStore {
  constructor() {
    /** @type {Map<number, { id: number, name: string, ancestor: number, born: number, died: number, hue: number, count: number }>} */
    this.byId = new Map();
  }

  /**
   * Merge one `phylogeny` event's rows in, by id (SPEC §6.4: a delta only
   * touches the ids it lists; every other species is untouched).
   * @param {{ species: { id: number, name: string, ancestor: number, born: number, died: number, hue: number, count: number }[] }} event
   * @returns {void}
   */
  apply(event) {
    for (const row of event.species) {
      this.byId.set(row.id, row);
    }
  }

  /**
   * @param {number} id
   * @returns {string|undefined}
   */
  name(id) {
    return this.byId.get(id)?.name;
  }

  /**
   * @param {number} id
   * @returns {number|undefined}
   */
  hue(id) {
    return this.byId.get(id)?.hue;
  }

  /**
   * @returns {*[]} every known species row, in insertion (id) order.
   */
  list() {
    return Array.from(this.byId.values());
  }
}
