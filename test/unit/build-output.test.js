import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');

describe('build output', () => {
  it('build copies _headers into dist', () => {
    execFileSync('npm', ['run', 'build'], { cwd: rootDir, stdio: 'pipe' });
    const headers = readFileSync(path.join(rootDir, 'dist', '_headers'), 'utf8');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
  }, 120000);
});
