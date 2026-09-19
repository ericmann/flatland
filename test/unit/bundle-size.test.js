// P4-08, SPEC §8: cold load budget — bundle ≤ 400 kB gzipped including
// fonts. Builds the real app (the build-output.test.js pattern) and sums
// the gzip size of every JS/CSS/woff2 asset plus index.html.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
const BUDGET_BYTES = 400 * 1024;
const EXTENSIONS = ['.js', '.css', '.woff2'];

/**
 * Every file under `dir` (recursively) whose name ends with one of `exts`.
 * @param {string} dir
 * @param {string[]} exts
 * @returns {string[]} absolute paths.
 */
function collect(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

describe('bundle size budget', () => {
  it('gzipped bundle including fonts is <= 400 kB', () => {
    execFileSync('npm', ['run', 'build'], { cwd: rootDir, stdio: 'pipe' });
    const distDir = path.join(rootDir, 'dist');

    const files = collect(distDir, EXTENSIONS);
    files.push(path.join(distDir, 'index.html'));

    const breakdown = files
      .map((file) => ({
        file: path.relative(distDir, file),
        gz: gzipSync(readFileSync(file)).length,
      }))
      .sort((a, b) => b.gz - a.gz);
    const total = breakdown.reduce((sum, entry) => sum + entry.gz, 0);

    console.log('Bundle size breakdown (gzip):');
    for (const entry of breakdown) {
      console.log(`  ${(entry.gz / 1024).toFixed(1)} kB  ${entry.file}`);
    }
    console.log(
      `  TOTAL: ${(total / 1024).toFixed(1)} kB (budget ${(BUDGET_BYTES / 1024).toFixed(0)} kB)`,
    );

    expect(total).toBeLessThanOrEqual(BUDGET_BYTES);
  }, 120000);
});
