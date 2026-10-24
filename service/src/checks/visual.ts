import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { decodePng, pixelDiffRatio, type Rgba } from './png.ts';

/** Diferencia por canal que se considera ruido de render (exposición automática, TAA, partículas). */
export const renderNoise = 12;

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

/** PNG RGBA de 8 bits sin filtros: lo justo para escribir la imagen de diferencia. */
export function encodePng({width, height, data}: Rgba): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Rojo donde cambió; el resto, la captura nueva apagada para situar el cambio. */
function diffImage(a: Rgba, b: Rgba): Rgba {
  const data = new Uint8Array(a.data.length);
  for (let p = 0; p < data.length; p += 4) {
    const changed = [0, 1, 2].some(c => Math.abs(a.data[p + c] - b.data[p + c]) > renderNoise);
    const gray = Math.round((a.data[p] + a.data[p + 1] + a.data[p + 2]) / 9);
    data.set(changed ? [255, 0, 0, 255] : [gray, gray, gray, 255], p);
  }
  return {width: a.width, height: a.height, data};
}

const percent = (ratio: number) => `${(Math.round(ratio * 10000) / 100).toString().replace('.', ',')} %`;
export type VisualResult = {result: 'passed' | 'failed' | 'skipped'; ratio: number | null; baseline: string; diff?: string; summary: string};

/** Regresión visual (hito 7): la captura contra `<juego>/docs/baseline/<nombre>.png`; sin línea base, la crea y no juzga. */
export function compareBaseline(shot: string, baselineDir: string, name: string, tolerance: number, diffPath: string): VisualResult {
  const baseline = join(baselineDir, `${name}.png`);
  if (!existsSync(baseline)) {
    mkdirSync(baselineDir, {recursive: true});
    copyFileSync(shot, baseline);
    return {result: 'skipped', ratio: null, baseline, summary: `Línea base creada: ${name}`};
  }
  const now = decodePng(readFileSync(shot)), before = decodePng(readFileSync(baseline));
  const ratio = pixelDiffRatio(now, before, renderNoise);
  if (ratio <= tolerance) return {result: 'passed', ratio, baseline, summary: `${name}: igual a la línea base (${percent(ratio)} distinto)`};
  if (now.width === before.width && now.height === before.height) {
    mkdirSync(dirname(diffPath), {recursive: true});
    writeFileSync(diffPath, encodePng(diffImage(now, before)));
  }
  return {result: 'failed', ratio, baseline, ...(existsSync(diffPath) ? {diff: diffPath} : {}),
    summary: now.width === before.width && now.height === before.height
      ? `${name}: la captura difiere un ${percent(ratio)} de la línea base (tolerancia ${percent(tolerance)})`
      : `${name}: la captura mide ${now.width}×${now.height} y la línea base ${before.width}×${before.height}`};
}
