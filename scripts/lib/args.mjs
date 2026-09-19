// Shared CLI argument parsing for scripts/headless.mjs and scripts/sweep.mjs.
// Node-only tooling; never imported from src/**.

/**
 * The first value following `--<name>` in argv, or `fallback` if absent.
 * @param {string[]} argv
 * @param {string} name
 * @param {string|null} fallback
 * @returns {string|null}
 */
export function flag(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}

/**
 * Every value following a `--<name>` flag, in order (for repeatable flags
 * like `--config a=1 --config b=2`).
 * @param {string[]} argv
 * @param {string} name
 * @returns {string[]}
 */
export function flagAll(argv, name) {
  const out = [];
  const needle = `--${name}`;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === needle) out.push(argv[i + 1]);
  }
  return out;
}

/**
 * Parse a seed spec: `"1..40"` (inclusive range) or `"1,5,9"` (a list).
 * @param {string} spec
 * @returns {number[]}
 */
export function parseSeeds(spec) {
  if (spec.includes('..')) {
    const [a, b] = spec.split('..').map(Number);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return spec.split(',').map(Number);
}

/**
 * Parse a `WxH` size spec into `{ width, height }`, or `null` if `spec` is
 * falsy.
 * @param {string|null} spec
 * @returns {{ width: number, height: number }|null}
 */
export function parseSize(spec) {
  if (!spec) return null;
  const [width, height] = spec.split('x').map(Number);
  return { width, height };
}

/**
 * Parse one `--config` value's raw string: `"true"`/`"false"` to booleans,
 * numeric strings to numbers, everything else stays a string.
 * @param {string} raw
 * @returns {boolean|number|string}
 */
function parseScalar(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

/**
 * Set a dotted path on a plain object, creating intermediate objects.
 * @param {*} obj
 * @param {string} path
 * @param {*} value
 * @returns {void}
 */
function setPath(obj, path, value) {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in node)) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

/**
 * Parse a list of `--config key.path=value` strings into one config
 * override object, e.g. `["a.b=1", "c=true"]` -> `{ a: { b: 1 }, c: true }`.
 * @param {string[]} pairs
 * @returns {*}
 */
export function parseConfigOverrides(pairs) {
  const overrides = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const path = pair.slice(0, eq);
    const value = parseScalar(pair.slice(eq + 1));
    setPath(overrides, path, value);
  }
  return overrides;
}
