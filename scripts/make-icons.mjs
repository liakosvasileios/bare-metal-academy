// Generates the PWA / iOS home-screen icons as PNGs with no dependencies.
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [10, 15, 13];
const ACCENT = [57, 217, 138];
const ACCENT2 = [245, 182, 66];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 4; // supersampling for anti-aliasing
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb] = pixel((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += pr; g += pg; b += pb;
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r / (SS * SS); raw[o + 1] = g / (SS * SS); raw[o + 2] = b / (SS * SS); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// IC package: outlined chip body, pins on all four sides and a filled die in the middle.
function chip(scale) {
  return (u, v) => {
    const x = (u - 0.5) / scale, y = (v - 0.5) / scale;
    const ax = Math.abs(x), ay = Math.abs(y);
    const t = Math.max(0, Math.min(1, (x + y + 0.7) / 1.4));
    const accent = ACCENT.map((c, i) => c + (ACCENT2[i] - c) * t);
    const body = 0.24, wall = 0.035;
    const inBody = ax < body && ay < body;
    if (inBody && (ax > body - wall || ay > body - wall)) return accent;
    if (ax < 0.08 && ay < 0.08) return accent;
    const pin = (a, b) => a > body && a < body + 0.13 && [-0.15, -0.05, 0.05, 0.15].some((p) => Math.abs(b - p) < 0.022);
    if (pin(ax, y) || pin(ay, x)) return accent;
    return BG;
  };
}

const out = (name, size, scale) => writeFileSync(new URL(`../icons/${name}`, import.meta.url), png(size, chip(scale)));
out("apple-touch-icon.png", 180, 1);
out("icon-192.png", 192, 1);
out("icon-512.png", 512, 1);
out("icon-maskable-512.png", 512, 0.78);
out("favicon-32.png", 32, 1.1);
console.log("icons written");
