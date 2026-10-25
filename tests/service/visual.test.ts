import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePng, type Rgba } from '../../service/src/checks/png.ts';
import { compareBaseline, encodePng } from '../../service/src/checks/visual.ts';
import { removeDir } from '../remove-dir.ts';

/** HUD sintético 200×100: fondo con degradado y barra de vida verde de 100 px a `health` %. */
function hud(health: number, brightness = 0, noise = 0): Rgba {
  const width = 200, height = 100, data = new Uint8Array(width * height * 4);
  let seed = 7;
  const jitter = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return noise ? (seed % (2 * noise + 1)) - noise : 0; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bar = y >= 10 && y < 20 && x >= 10 && x < 10 + health;
    const base = bar ? [40, 200, 60] : [30 + x / 4, 40 + y / 4, 70];
    data.set([...base.map(c => Math.max(0, Math.min(255, Math.round(c + brightness + jitter())))), 255], (y * width + x) * 4);
  }
  return {width, height, data};
}

test('el codificador PNG mínimo produce un archivo que el decodificador propio lee igual', () => {
  const image = hud(100);
  const back = decodePng(encodePng(image));
  assert.equal(back.width, 200);
  assert.deepEqual(Buffer.from(back.data), Buffer.from(image.data));
});

test('sin línea base la crea y no juzga; variación de render pasa; la barra de vida de 100 a 50 falla con imagen de diferencia', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-visual-')), baselines = join(dir, 'docs', 'baseline');
  try {
    const shot = (name: string, image: Rgba) => { const path = join(dir, `${name}.png`); writeFileSync(path, encodePng(image)); return path; };
    const first = compareBaseline(shot('base', hud(100)), baselines, 'build-1280x720', 0.02, join(dir, 'diff-1.png'));
    assert.deepEqual([first.result, first.summary], ['skipped', 'Línea base creada: build-1280x720']);
    assert.ok(existsSync(join(baselines, 'build-1280x720.png')));
    const render = compareBaseline(shot('exposicion', hud(100, 5, 3)), baselines, 'build-1280x720', 0.02, join(dir, 'diff-2.png'));
    assert.equal(render.result, 'passed', 'exposición +5 y ruido ±3 son variación de render');
    assert.equal(existsSync(join(dir, 'diff-2.png')), false);
    const half = compareBaseline(shot('mitad', hud(50)), baselines, 'build-1280x720', 0.02, join(dir, 'diff-3.png'));
    assert.equal(half.result, 'failed');
    assert.match(half.summary, /difiere un 2,5 % de la línea base \(tolerancia 2 %\)/);
    const diff = decodePng(readFileSync(half.diff!));
    assert.deepEqual([diff.width, diff.height], [200, 100]);
    const at = (x: number, y: number) => [...diff.data.slice((y * 200 + x) * 4, (y * 200 + x) * 4 + 3)];
    assert.deepEqual(at(80, 15), [255, 0, 0], 'lo que cambió va en rojo');
    assert.notDeepEqual(at(150, 60), [255, 0, 0]);
    assert.equal(compareBaseline(shot('tolerante', hud(50)), baselines, 'build-1280x720', 0.05, join(dir, 'diff-4.png')).result, 'passed',
      'la tolerancia viene de config.json');
  } finally { removeDir(dir); }
});
