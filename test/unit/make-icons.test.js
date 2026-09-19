// P4-08: scripts/make-icons.mjs writes the PWA icon set as hand-rolled PNGs
// (node:zlib deflate + a local CRC32 — no image library). This runs the
// real script as a subprocess (the build-output.test.js pattern) and checks
// the bytes it wrote, rather than re-implementing the encoder here.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../..');
const iconsDir = path.join(rootDir, 'public', 'icons');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * A PNG's width/height, read straight from the IHDR chunk (bytes 16..24,
 * two big-endian uint32s), independent of whatever encoder wrote the file.
 * @param {Buffer} buf
 * @returns {{ width: number, height: number }}
 */
function pngDimensions(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('make-icons', () => {
  it('produces valid PNG signatures and the expected dimensions', () => {
    execFileSync('node', ['scripts/make-icons.mjs'], { cwd: rootDir, stdio: 'pipe' });

    const expected = [
      ['icon-192.png', 192],
      ['icon-512.png', 512],
      ['maskable-512.png', 512],
    ];
    for (const [name, size] of expected) {
      const buf = readFileSync(path.join(iconsDir, name));
      expect(buf.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      expect(pngDimensions(buf)).toEqual({ width: size, height: size });
    }
  });

  it('is deterministic: re-running the script byte-for-byte reproduces its output', () => {
    execFileSync('node', ['scripts/make-icons.mjs'], { cwd: rootDir, stdio: 'pipe' });
    const before = readFileSync(path.join(iconsDir, 'icon-512.png'));
    execFileSync('node', ['scripts/make-icons.mjs'], { cwd: rootDir, stdio: 'pipe' });
    const after = readFileSync(path.join(iconsDir, 'icon-512.png'));
    expect(after.equals(before)).toBe(true);
  });

  it('writes an SVG source icon', () => {
    execFileSync('node', ['scripts/make-icons.mjs'], { cwd: rootDir, stdio: 'pipe' });
    const svg = readFileSync(path.join(iconsDir, 'icon.svg'), 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');
  });
});
