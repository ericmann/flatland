import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Determinism (SPEC §3.1): src/core/** gets no environment globals beyond
// ECMAScript builtins (Math, JSON, Array, Promise, …). Date, window, document,
// fetch, performance and setTimeout are explicitly undefined there, on top of
// the no-restricted-properties/no-restricted-syntax rules below, so a stray
// reference is a lint error, not a runtime surprise.
const CORE_DENYLIST = ['Date', 'window', 'document', 'fetch', 'performance', 'setTimeout'];

const noMathRandomDateNow = [
  {
    object: 'Math',
    property: 'random',
    message: 'use world.rng — see CLAUDE.md determinism rules',
  },
  {
    object: 'Date',
    property: 'now',
    message: 'use world.rng or an injected clock — no wall-clock time in core/sim',
  },
];

const noTranscendentalMath = ['sin', 'cos', 'exp', 'tanh', 'atan2', 'log', 'pow', 'hypot'].map(
  (property) => ({
    object: 'Math',
    property,
    message: 'use fmath — Math.* transcendentals are not guaranteed bit-identical across engines',
  }),
);

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'docs/sweeps/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.builtin },
    },
  },
  // Browser-facing code.
  {
    files: [
      'src/render/**/*.js',
      'src/ui/**/*.js',
      'src/persist/**/*.js',
      'src/platform/**/*.js',
      'src/main.js',
    ],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // The Worker entry point and the main-thread fallback may use timers and
  // performance directly; everything else in src/sim may not (see below).
  {
    files: ['src/sim/worker.js'],
    languageOptions: {
      globals: { ...globals.worker },
    },
  },
  {
    files: ['src/sim/main-thread.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // Node-side tooling.
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', 'test/**/*.js', 'playwright.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Playwright e2e specs run under Node, but page.evaluate/waitForFunction
  // callbacks are strings/closures executed inside the browser, so these
  // files reference both node and browser globals.
  {
    files: ['test/e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // src/core and src/sim: no Math.random, no Date.now, no wall-clock.
  {
    files: ['src/core/**/*.js', 'src/sim/**/*.js'],
    rules: {
      'no-restricted-properties': ['error', ...noMathRandomDateNow],
    },
  },
  // src/core only: no transcendental Math, no for..in, and the explicit
  // browser/timer global denylist.
  {
    files: ['src/core/**/*.js'],
    languageOptions: {
      globals: Object.fromEntries(CORE_DENYLIST.map((name) => [name, 'off'])),
    },
    rules: {
      'no-restricted-properties': ['error', ...noMathRandomDateNow, ...noTranscendentalMath],
      'no-restricted-syntax': [
        'error',
        { selector: 'ForInStatement', message: 'no for..in — iteration must be in slot order' },
      ],
    },
  },
  prettier,
];
