/**
 * Share links (SPEC §5.6): `?w=<base64url of [version, seed, configDiff,
 * ops]>`. This is a distinct, more compact encoding from `core/save.js`'s
 * `encodeRecord`/`decodeRecord` (plain JSON, meant for IndexedDB) — a URL
 * has no practical size budget for repeating `{tick, kind, ...}` objects
 * verbatim, so the intervention log is compacted into a short array of
 * `["ff", n]` (advance n ticks) and `[kind, ...positionalParams]` entries,
 * with every intervention-free stretch folded into one `ff` record.
 *
 * `CLAUDE.md` rule 4 still holds here: a share link is a seed plus its
 * history, never a state snapshot — replaying it from genesis is what
 * makes the link byte-for-byte reproducible regardless of who opens it.
 */

const VERSION = 1;

/**
 * Positional parameter names per intervention kind, in encoding order.
 * Duplicated from `core/interventions.js`'s `REQUIRED_FIELDS` (not
 * exported there, and this task's Files touched doesn't include that
 * module) — every kind here has exactly the fields `queueIntervention`
 * requires, so the two can never drift silently: a new required field
 * there without a matching update here would just fail to round-trip,
 * caught by `test/unit/share.test.js`.
 * @type {Record<string, string[]>}
 */
const PARAM_FIELDS = Object.freeze({
  rain: [],
  fire: ['x', 'y'],
  meteor: ['x', 'y'],
  plague: ['x', 'y'],
  river: ['x', 'y'],
  meadow: ['x', 'y'],
  rename: ['speciesId', 'name'],
  config: ['diff'],
});

/**
 * UTF-8 JSON -> base64url (no padding), so the string is safe unescaped
 * in a URL query parameter.
 * @param {*} value
 * @returns {string}
 */
function toBase64Url(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The inverse of `toBase64Url`.
 * @param {string} str
 * @returns {*}
 */
function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Encode a world's share record into the compact `?w=` payload string.
 * @param {{ seed: number, configDiff: *, interventions: import('../core/interventions.js').InterventionEvent[], tick: number }} share
 * @returns {string}
 */
export function encodeShare({ seed, configDiff, interventions, tick }) {
  const ops = [];
  let at = 0;
  for (const ev of interventions) {
    const delta = ev.tick - at;
    if (delta > 0) ops.push(['ff', delta]);
    at = ev.tick;
    const fields = PARAM_FIELDS[ev.kind];
    if (!fields) throw new Error(`encodeShare: unknown intervention kind "${ev.kind}"`);
    ops.push([ev.kind, ...fields.map((f) => ev[f])]);
  }
  if (tick > at) ops.push(['ff', tick - at]);

  return toBase64Url([VERSION, seed, configDiff, ops]);
}

/**
 * Decode a `?w=` payload string back into `{ seed, configDiff,
 * interventions, tick }`, with every intervention's `tick` restored to
 * its absolute value.
 * @param {string} str
 * @returns {{ seed: number, configDiff: *, interventions: import('../core/interventions.js').InterventionEvent[], tick: number }}
 */
export function decodeShare(str) {
  const [version, seed, configDiff, ops] = fromBase64Url(str);
  if (version !== VERSION) {
    throw new Error(`decodeShare: unsupported version ${version} (expected ${VERSION})`);
  }

  /** @type {import('../core/interventions.js').InterventionEvent[]} */
  const interventions = [];
  let at = 0;
  for (const op of ops) {
    const [kind, ...params] = op;
    if (kind === 'ff') {
      at += params[0];
      continue;
    }
    const fields = PARAM_FIELDS[kind];
    if (!fields) throw new Error(`decodeShare: unknown intervention kind "${kind}"`);
    /** @type {import('../core/interventions.js').InterventionEvent} */
    const ev = { tick: at, kind };
    fields.forEach((f, i) => (ev[f] = params[i]));
    interventions.push(ev);
  }

  return { seed, configDiff, interventions, tick: at };
}
