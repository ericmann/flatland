import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The simulation core is plain node. UI tests opt into jsdom with a
    // docblock (// @vitest-environment jsdom), so nothing else pays for a
    // fake DOM.
    environment: 'node',
    include: ['test/**/*.test.js'],
    testTimeout: 120000,
    pool: 'forks',
    // Vitest 5: pool options are top-level, not nested under `poolOptions`
    // (that nesting was removed in Vitest 4). The no-allocation invariant in
    // P1-09 needs `global.gc`, hence --expose-gc.
    execArgv: ['--expose-gc'],
  },
});
