import { inflateSync } from 'node:zlib';

export type Rgba = {width: number; height: number; data: Uint8Array};
const signature = [137, 80, 78, 71, 13, 10, 26, 10];

/** PNG de 8 bits RGB o RGBA sin entrelazar (lo que escribe `Shot` de Unreal) → RGBA; sin dependencias. */
export function decodePng(file: Uint8Array): Rgba {
  const buf = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  if (buf.length < 33 || signature.some((b, i) => buf[i] !== b)) throw new Error('png_invalid');
  let width = 0, height = 0, color = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= buf.length;) {
    const length = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8), body = buf.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); color = body[9];
      if (body[8] !== 8 || ![2, 6].includes(color) || body[12] !== 0) throw new Error('png_unsupported');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!width || !height || !idat.length) throw new Error('png_invalid');
  const bpp = color === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('png_invalid');
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? rows[row + i - bpp] : 0, b = y ? rows[row - stride + i] : 0, c = i >= bpp && y ? rows[row - stride + i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1
        : filter === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      rows[row + i] = (raw[src + i] + predictor) & 255;
    }
  }
  if (bpp === 4) return {width, height, data: rows};
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set([rows[p * 3], rows[p * 3 + 1], rows[p * 3 + 2], 255], p * 4);
  return {width, height, data};
}

/** Fracción de píxeles que cambian más de `tolerance` en algún canal; tamaños distintos cuentan como todo distinto. */
export function pixelDiffRatio(a: Rgba, b: Rgba, tolerance = 8): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  for (let p = 0; p < a.data.length; p += 4)
    if (Math.abs(a.data[p] - b.data[p]) > tolerance || Math.abs(a.data[p + 1] - b.data[p + 1]) > tolerance
      || Math.abs(a.data[p + 2] - b.data[p + 2]) > tolerance) changed++;
  return changed / (a.width * a.height);
}
