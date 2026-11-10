// revisar_imagen.py (jam vista): cada medida con una imagen que la incumple y otra que la cumple, más los casos de Review
// Focus y la regresión con las capturas reales de Candela (A se lee, B no). Imágenes sintéticas a 320×180 con Pillow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pythonBin } from '../../service/src/config.ts';
import { nomosSkills } from '../../service/src/skills-install.ts';
import { removeDir } from '../remove-dir.ts';

const script = join(nomosSkills, 'ue-oficio', 'scripts', 'revisar_imagen.py');
const [py, ...pre] = pythonBin();
type Rect = [number, number, number, number, number];  // x0, y0, x1, y1, gris
type Shot = {fondo?: number; rects?: Rect[]; json?: unknown};
const W = 320, H = 180;
// la base se lee: fondo gris medio, un punto brillante y el protagonista blanco de 16 px en el centro (tam 100 a 10 m, FOV 90)
const pawn = {clase: 'P', pos: [0, 0, 0], tam: [100, 100, 100], dist: 1000, px: [160, 90]};
const actores = [[40, 40], [280, 40], [40, 140], [280, 140]].map((px, i) => ({nombre: `A${i}`, px}));
const base = (luz: Rect): Shot => ({fondo: 90, rects: [luz, [152, 82, 168, 98, 255]],
  json: {camara: {fov: 90}, imagen: [W, H], pawn, actores}});
const bien = {inicio: base([10, 10, 50, 30, 255]), mitad: base([100, 10, 140, 30, 255]), final: {...base([200, 10, 240, 30, 255]), fondo: 110}};
const gen = `import json,sys
from PIL import Image,ImageDraw
d,shots=sys.argv[1],json.loads(open(sys.argv[2],encoding='utf-8').read())
for n,s in shots.items():
  im=Image.new('RGB',(${W},${H}),(s.get('fondo',90),)*3);dr=ImageDraw.Draw(im)
  for x0,y0,x1,y1,g in s.get('rects',[]): dr.rectangle([x0,y0,x1-1,y1-1],fill=(g,g,g))
  im.save(d+'/'+n+'.png')
  if s.get('json') is not None: open(d+'/'+n+'.png.json','w',encoding='utf-8').write(json.dumps(s['json']))
`;
function revisar(shots: Record<string, Shot>) {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-imagen-'));
  try {
    writeFileSync(join(dir, 'shots.json'), JSON.stringify({...bien, ...shots}));
    const made = spawnSync(py, [...pre, '-c', gen, dir, join(dir, 'shots.json')], {encoding: 'utf8'});
    assert.equal(made.status, 0, made.stderr);
    const r = spawnSync(py, [...pre, script, dir], {encoding: 'utf8'});
    return {code: r.status, out: r.stdout + r.stderr};
  } finally { removeDir(dir); }
}
const con = (s: Shot, extra: Partial<Shot> & {pawn?: unknown; actores?: unknown}) => {
  const json = {...(s.json as object), ...(extra.pawn !== undefined ? {pawn: extra.pawn} : {}), ...(extra.actores ? {actores: extra.actores} : {})};
  return {fondo: extra.fondo ?? s.fondo, rects: extra.rects ?? s.rects, json};
};

test('revisar_imagen: la base se lee y sale con 0', () => {
  const r = revisar({});
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /FALLO/);
});

const casos: [string, Record<string, Shot>, RegExp][] = [
  ['negro puro > 35 %', {mitad: con(bien.mitad, {rects: [[0, 0, 160, 180, 0], [10, 10, 50, 30, 255], [152, 82, 168, 98, 255]]})}, /FALLO mitad: negro puro/],
  ['nada brilla', {mitad: con(bien.mitad, {rects: [[152, 82, 168, 98, 140]]})}, /FALLO mitad: nada brilla/],
  ['pantalla vacía', {inicio: con(bien.inicio, {fondo: 4, rects: [[0, 0, 40, 30, 255]]})}, /FALLO inicio: pantalla casi vacía/],
  ['protagonista diminuto', {mitad: con(bien.mitad, {pawn: {...pawn, dist: 5000}})}, /FALLO mitad: el protagonista mide/],
  ['protagonista en el borde', {mitad: con(bien.mitad, {pawn: {...pawn, px: [5, 90]}})}, /FALLO mitad: el protagonista está en el borde/],
  ['protagonista sin contraste', {mitad: con(bien.mitad, {rects: [[10, 10, 50, 30, 255], [152, 82, 168, 98, 95]]})}, /FALLO mitad: el protagonista no se distingue/],
  ['escena fuera del cuadro', {mitad: con(bien.mitad, {actores: [...actores.slice(0, 2), {nombre: 'X', px: [-50, 90]}, {nombre: 'Y', px: [160, 400]}]})}, /FALLO mitad: 2 de 4 actores fuera/],
  ['nada cambia', {final: bien.inicio}, /FALLO final: nada cambia/],
];
for (const [nombre, shots, fallo] of casos) test(`revisar_imagen: ${nombre} falla con 1`, () => {
  const r = revisar(shots);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, fallo);
});

test('Review Focus: una escena oscura con un punto brillante del 1 % y 20 % de negro puro no falla', () => {
  const noche = (luz: Rect, fondo = 30): Shot => con(base(luz), {fondo, rects: [[0, 0, 64, 180, 0], luz, [152, 82, 168, 98, 255]]});
  const r = revisar({inicio: noche([70, 10, 94, 34, 255]), mitad: noche([100, 10, 124, 34, 255]), final: noche([200, 10, 224, 34, 255], 45)});
  assert.equal(r.code, 0, r.out);
});

test('Review Focus: sin pawn en el JSON, las medidas del protagonista se saltan con AVISO y sale 0', () => {
  const r = revisar({inicio: con(bien.inicio, {pawn: null}), mitad: con(bien.mitad, {pawn: null}), final: con(bien.final, {pawn: null})});
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /AVISO inicio: sin pawn/);
});

test('regresión: la captura real de Candela B (segundo 30) falla por negro puro y la de A no', () => {
  for (const [rama, falla] of [['B', true], ['A', false]] as const) {
    const dir = mkdtempSync(join(tmpdir(), 'nomos-imagen-real-'));
    try {
      for (const n of ['inicio', 'mitad', 'final']) copyFileSync(join(import.meta.dirname, 'fixtures', `Candela-${rama}-30.png`), join(dir, `${n}.png`));
      const r = spawnSync(py, [...pre, script, dir], {encoding: 'utf8'});
      if (falla) assert.match(r.stdout, /FALLO inicio: negro puro/, r.stdout);
      else assert.doesNotMatch(r.stdout, /negro puro|nada brilla|casi vacía/, r.stdout);
    } finally { removeDir(dir); }
  }
});

test('falta una captura: sale con 2 y dice cómo sacarla', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-imagen-vacia-'));
  try {
    mkdirSync(dir, {recursive: true});
    const r = spawnSync(py, [...pre, script, dir], {encoding: 'utf8'});
    assert.equal(r.status, 2);
    assert.match(r.stdout, /capturar\.ps1 -Demo/);
  } finally { removeDir(dir); }
});
