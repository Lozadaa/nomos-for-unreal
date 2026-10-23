import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import { decodePng, pixelDiffRatio } from '../../service/src/checks/png.ts';

/** PNG de prueba: `pixel(x, y)` devuelve RGBA; cada fila usa el filtro `filter` (0-4) y el color 6 (RGBA) o 2 (RGB). */
function encode(width: number, height: number, pixel: (x: number, y: number) => number[], filter = 0, color = 6): Buffer {
  const bpp = color === 6 ? 4 : 3, stride = width * bpp;
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const raw = Buffer.alloc(stride);
    for (let x = 0; x < width; x++) raw.set(pixel(x, y).slice(0, bpp), x * bpp);
    const out = Buffer.alloc(stride + 1); out[0] = filter;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? raw[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      out[i + 1] = (raw[i] - predictor) & 255;
    }
    rows.push(out); prev = raw;
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, color, 0, 0, 0], 8);
  const data = deflateSync(Buffer.concat(rows));
  // dos IDAT para comprobar que se concatenan
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', data.subarray(0, 5)), chunk('IDAT', data.subarray(5)), chunk('IEND', Buffer.alloc(0))]);
}
const gradient = (x: number, y: number) => [x * 20 % 256, y * 30 % 256, (x * y) % 256, 255];

test('decodifica RGBA con los cinco filtros y dos IDAT', () => {
  for (const filter of [0, 1, 2, 3, 4]) {
    const image = decodePng(encode(7, 5, gradient, filter));
    assert.deepEqual([image.width, image.height], [7, 5]);
    for (const [x, y] of [[0, 0], [6, 4], [3, 2]])
      assert.deepEqual([...image.data.subarray((y * 7 + x) * 4, (y * 7 + x) * 4 + 4)], gradient(x, y), `filtro ${filter} en ${x},${y}`);
  }
});

test('RGB sin alfa se expande a RGBA opaco; otros formatos fallan con error claro', () => {
  const image = decodePng(encode(3, 2, gradient, 1, 2));
  assert.deepEqual([...image.data.subarray(4, 8)], [20, 0, 0, 255]);
  assert.throws(() => decodePng(Buffer.from('no es png')), /png_invalid/);
  const palette = encode(2, 2, gradient); palette[25] = 3;
  assert.throws(() => decodePng(palette), /png_unsupported/);
});

test('pixelDiffRatio: idénticas 0, una barra del 6,7 % la detecta, tamaños distintos 1', () => {
  const base = encode(30, 10, () => [90, 90, 90, 255]);
  const bar = encode(30, 10, (x, y) => x < 10 && y < 2 ? [220, 40, 40, 255] : [90, 90, 90, 255]);
  const noise = encode(30, 10, (x) => [90 + (x % 2) * 3, 90, 90, 255]);
  assert.equal(pixelDiffRatio(decodePng(base), decodePng(base)), 0);
  assert.equal(pixelDiffRatio(decodePng(base), decodePng(bar)).toFixed(3), (20 / 300).toFixed(3));
  assert.equal(pixelDiffRatio(decodePng(base), decodePng(noise)), 0, 'el ruido de compresión no cuenta');
  assert.equal(pixelDiffRatio(decodePng(base), decodePng(encode(10, 10, () => [0, 0, 0, 255]))), 1);
});
