// Генерирует PNG-иконки приложения (PWA) без зависимостей: зелёный фон, белая карта, красный ромб.
// Запуск: node apps/web/scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const BG = [0x1f, 0x6f, 0x50];
const CARD = [0xff, 0xff, 0xff];
const SUIT = [0xd6, 0x3a, 0x3a];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Цвет точки в координатах 0..1. */
function color(x, y, rounded) {
  const inRoundRect = (cx, cy, w, h, r) => {
    const dx = Math.max(Math.abs(x - cx) - (w / 2 - r), 0);
    const dy = Math.max(Math.abs(y - cy) - (h / 2 - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
  if (rounded && !inRoundRect(0.5, 0.5, 1, 1, 0.2)) return null;
  if (Math.abs(x - 0.5) / 0.15 + Math.abs(y - 0.5) / 0.2 <= 1) return SUIT;
  if (inRoundRect(0.5, 0.5, 0.48, 0.64, 0.06)) return CARD;
  return BG;
}

function png(size, rounded) {
  const SS = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = color((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, rounded);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
      const n = SS * SS;
      const covered = a / 255 || 1;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = Math.round(r / covered);
      raw[o + 1] = Math.round(g / covered);
      raw[o + 2] = Math.round(b / covered);
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = [
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['icon-maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
];
for (const [name, size, rounded] of files) {
  writeFileSync(resolve(out, name), png(size, rounded));
  console.log('written', name);
}
