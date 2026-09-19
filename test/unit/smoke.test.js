import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');

describe('the test runner runs', () => {
  it('1 + 1 === 2', () => {
    expect(1 + 1).toBe(2);
  });
});

describe('package.json scripts match SPEC §6.6', () => {
  const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  const requiredScripts = [
    'dev',
    'build',
    'preview',
    'test',
    'test:watch',
    'test:soak',
    'test:all',
    'test:ui',
    'typecheck',
    'lint',
    'format',
    'headless',
    'sweep',
  ];

  it.each(requiredScripts)('has a "%s" script', (name) => {
    expect(pkg.scripts).toHaveProperty(name);
    expect(typeof pkg.scripts[name]).toBe('string');
    expect(pkg.scripts[name].length).toBeGreaterThan(0);
  });
});
