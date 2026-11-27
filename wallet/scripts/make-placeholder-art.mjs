// Draws the wallet's PLACEHOLDER artwork (app icon, Android adaptive-icon foreground, splash
// marks) as PNGs: a simple vault-door mark in the UniVault token colours. No third-party logo,
// no image library: shapes are rasterised here (4×4 supersampling) and encoded with node:zlib.
//
//   npm run art:placeholder   (node scripts/make-placeholder-art.mjs)
//
// Colours come from the shared tokens (portal-ui/src/tokens.ts, loaded with Node's built-in
// TypeScript type stripping, Node 22.18+ / 23.6+), never copied.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { brandColors, semanticColors } from '../../portal-ui/src/tokens.ts';

const OUT = fileURLToPath(new URL('../assets/images/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const hex = (value) => {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const TRANSPARENT = [0, 0, 0, 0];

// ---- PNG encoding (RGBA, 8 bit) ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- The mark: door ring, door disc, keyhole (coordinates relative to the centre) ----
// Returns which layer a point (u, v in -0.5..0.5, scaled by `scale`) falls in.
function layerAt(u, v, scale) {
  const x = u / scale;
  const y = v / scale;
  const d = Math.hypot(x, y);
  const keyholeCircle = Math.hypot(x, y + 0.06) < 0.075;
  const stemTop = -0.02;
  const stemBottom = 0.17;
  const t = (y - stemTop) / (stemBottom - stemTop);
  const keyholeStem = t >= 0 && t <= 1 && Math.abs(x) < 0.032 + t * 0.03;
  if (d < 0.33 && (keyholeCircle || keyholeStem)) return 'keyhole';
  if (d < 0.33) return 'disc';
  if (d > 0.39 && d < 0.44) return 'ring';
  return 'background';
}

function draw(size, scale, colours) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = 4; // supersampling
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (px + (sx + 0.5) / S) / size - 0.5;
          const v = (py + (sy + 0.5) / S) / size - 0.5;
          const c = colours[layerAt(u, v, scale)];
          // premultiplied accumulation, so transparent edges stay clean
          acc[0] += c[0] * c[3];
          acc[1] += c[1] * c[3];
          acc[2] += c[2] * c[3];
          acc[3] += c[3];
        }
      }
      const i = (py * size + px) * 4;
      const a = acc[3] / (S * S);
      rgba[i] = acc[3] ? Math.round(acc[0] / acc[3]) : 0;
      rgba[i + 1] = acc[3] ? Math.round(acc[1] / acc[3]) : 0;
      rgba[i + 2] = acc[3] ? Math.round(acc[2] / acc[3]) : 0;
      rgba[i + 3] = Math.round(a);
    }
  }
  return encodePng(size, rgba);
}

const primary = hex(semanticColors.primary);
const onPrimary = hex(semanticColors.primaryForeground);
const accent = hex(semanticColors.accent);
const light = hex(brandColors[100]);

const files = {
  // App icon (iOS and the default): opaque, full-bleed brand teal
  'icon.png': draw(1024, 1, {
    background: primary,
    ring: onPrimary,
    disc: onPrimary,
    keyhole: primary,
  }),
  // Android adaptive icon foreground: transparent, inside the 66 % safe zone
  // (the background colour is set in app.config.ts from the same token)
  'adaptive-icon.png': draw(1024, 0.62, {
    background: TRANSPARENT,
    ring: onPrimary,
    disc: onPrimary,
    keyhole: primary,
  }),
  // Splash marks: teal on the light background, light teal on the dark one
  'splash-icon.png': draw(512, 1, {
    background: TRANSPARENT,
    ring: primary,
    disc: primary,
    keyhole: accent,
  }),
  'splash-icon-dark.png': draw(512, 1, {
    background: TRANSPARENT,
    ring: light,
    disc: light,
    keyhole: hex(brandColors[900]),
  }),
};

for (const [name, png] of Object.entries(files)) {
  writeFileSync(new URL(name, `file://${OUT.replace(/\\/g, '/')}/`), png);
  console.log(`wrote assets/images/${name} (${png.length} bytes)`);
}
