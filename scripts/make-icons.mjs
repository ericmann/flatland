#!/usr/bin/env node
// P4-08 (SPEC §2, §6.6, §10): generate the PWA icon set — icon-192.png,
// icon-512.png, maskable-512.png and icon.svg — from one 16×16 pixel-art
// bitmap (a green tile with a small orange creature), nearest-neighbour
// scaled up. No image library: PNGs are hand-encoded with only
// `node:zlib`'s `deflateSync` and a local CRC32 table. Every step here is a
// pure function of fixed constants, so re-running this script reproduces
// byte-identical files (deflate, unlike gzip, carries no timestamp).
//
//   node scripts/make-icons.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SIZE = 16; // the source pixel-art grid, in tiles.

// Palette (SPEC §5.5): "good" green for the tile, "sun accent" orange for
// the creature, "critical" for its shading ring, the moss-ground background
// for its eye.
const TILE_LIGHT = [0x7f, 0xbb, 0x6a];
const TILE_DARK = [0x2b, 0x6c, 0x3f];
const BODY = [0xe3, 0xa8, 0x3a];
const BODY_SHADE = [0xd8, 0x57, 0x3f];
const EYE = [0x0e, 0x14, 0x10];

/**
 * The 16×16 RGBA source bitmap: a green tile — framed by a 1px darker
 * border when `border` is set — with a small round orange creature
 * centred on it. Pure: same inputs, same bytes, every time.
 * @param {{ border: boolean }} opts
 * @returns {Buffer} `SIZE * SIZE * 4` bytes, row-major RGBA.
 */
function buildSource({ border }) {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const cx = 7.5;
  const cy = 8.5;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const isBorder = border && (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1);
      let color = isBorder ? TILE_DARK : TILE_LIGHT;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 3.2) color = BODY;
      else if (dist <= 4.3) color = BODY_SHADE;

      if (x === 6 && y === 7) color = EYE; // one dark eye pixel, upper-left of the body's centre.

      const i = (y * SIZE + x) * 4;
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = 255;
    }
  }
  return buf;
}

/**
 * Nearest-neighbour scale `src` (a `srcSize`-square RGBA buffer) up to
 * `dstSize`, writing into `canvas` (a `canvasSize`-square RGBA buffer
 * already filled with the desired background) at `(offsetX, offsetY)`.
 * @param {Buffer} canvas
 * @param {number} canvasSize
 * @param {Buffer} src
 * @param {number} srcSize
 * @param {number} dstSize
 * @param {number} offsetX
 * @param {number} offsetY
 * @returns {void}
 */
function scaleInto(canvas, canvasSize, src, srcSize, dstSize, offsetX, offsetY) {
  for (let y = 0; y < dstSize; y++) {
    const sy = Math.floor((y * srcSize) / dstSize);
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.floor((x * srcSize) / dstSize);
      const si = (sy * srcSize + sx) * 4;
      const di = ((y + offsetY) * canvasSize + (x + offsetX)) * 4;
      canvas[di] = src[si];
      canvas[di + 1] = src[si + 1];
      canvas[di + 2] = src[si + 2];
      canvas[di + 3] = src[si + 3];
    }
  }
}

/** The standard PNG CRC32 table, built once. @type {Uint32Array} */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * PNG's CRC32 (used to checksum each chunk's type + data).
 * @param {Buffer} buf
 * @returns {number} unsigned 32-bit.
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * One length-prefixed, CRC-suffixed PNG chunk.
 * @param {string} type four-letter chunk type, e.g. `'IHDR'`.
 * @param {Buffer} data
 * @returns {Buffer}
 */
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Encode a `width × height` RGBA buffer as a minimal 8-bit truecolour+alpha
 * PNG (colour type 6), filter type None on every scanline.
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba `width * height * 4` bytes, row-major.
 * @returns {Buffer}
 */
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method: none

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }
  // Deterministic: deflate (unlike gzip) has no timestamp field, so a fixed
  // input at a fixed level always produces the same compressed bytes.
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A tiny inline SVG matching the (bordered) icon source — one `<rect>` per
 * source pixel — for use as the browser-tab favicon.
 * @param {Buffer} rgba
 * @returns {string}
 */
function toSvg(rgba) {
  const rects = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const hex =
        '#' +
        [rgba[i], rgba[i + 1], rgba[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('');
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${hex}"/>`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">\n  ` +
    rects.join('\n  ') +
    '\n</svg>\n'
  );
}

const iconSource = buildSource({ border: true });
const flatSource = buildSource({ border: false });

/**
 * A square "any"-purpose icon: the bordered tile scaled straight to fill
 * the canvas.
 * @param {number} size
 * @returns {Buffer} PNG bytes.
 */
function makeIcon(size) {
  const canvas = Buffer.alloc(size * size * 4);
  scaleInto(canvas, size, iconSource, SIZE, size, 0, 0);
  return encodePNG(size, size, canvas);
}

/**
 * A maskable icon: flat background fill, with the borderless tile+creature
 * scaled down and centred inside an 80% "safe zone" (20% total padding) so
 * an OS mask crop never clips the creature.
 * @param {number} size
 * @returns {Buffer} PNG bytes.
 */
function makeMaskable(size) {
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = TILE_LIGHT[0];
    canvas[i + 1] = TILE_LIGHT[1];
    canvas[i + 2] = TILE_LIGHT[2];
    canvas[i + 3] = 255;
  }
  const contentSize = Math.round(size * 0.8);
  const offset = Math.round((size - contentSize) / 2);
  scaleInto(canvas, size, flatSource, SIZE, contentSize, offset, offset);
  return encodePNG(size, size, canvas);
}

const rootDir = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const outDir = path.join(rootDir, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

writeFileSync(path.join(outDir, 'icon-192.png'), makeIcon(192));
writeFileSync(path.join(outDir, 'icon-512.png'), makeIcon(512));
writeFileSync(path.join(outDir, 'maskable-512.png'), makeMaskable(512));
writeFileSync(path.join(outDir, 'icon.svg'), toSvg(iconSource));

console.log('Wrote public/icons/{icon-192,icon-512,maskable-512}.png and icon.svg');
