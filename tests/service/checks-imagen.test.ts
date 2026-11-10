// Comprobación imagen (jam vista): tres capturas del modo demo con el editor en -game y revisar_imagen.py sobre ellas.
// Candela B salió ilegible porque ninguna puerta miraba la imagen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loteIds } from '../../service/src/handlers/checks.ts';
import { demoConfig } from '../../service/src/config.ts';
import { checksFixture } from './checks-fixture.ts';

test('imagen: va tras acabado y la compilación, y solo en la tarea que empaqueta', () => {
  assert.deepEqual(loteIds(['cpp', 'build'], {acabado: true, imagen: true}), ['acabado', 'cpp', 'imagen', 'build']);
  assert.deepEqual(loteIds(['build'], {acabado: true, imagen: true}), ['acabado', 'imagen', 'build']);
  assert.deepEqual(loteIds(['cpp'], {acabado: true, imagen: true}), ['acabado', 'cpp'], 'sin build no hay imagen');
  assert.deepEqual(loteIds(['cpp', 'build'], {acabado: false, imagen: false}), ['cpp', 'build']);
});

test('imagen: config checks.demo con la variable <NOMBRE>_AUTO y 3, 20, 45 s por defecto', () => {
  assert.deepEqual(demoConfig({}, 'Trompo'), {env: 'TROMPO_AUTO', segundos: [3, 20, 45]});
  assert.deepEqual(demoConfig({checks: {demo: {env: 'X_DEMO', segundos: [1, 2, 3]}}} as never, 'Trompo'), {env: 'X_DEMO', segundos: [1, 2, 3]});
});

/** Script falso de revisar_imagen: imprime `salida` y sale con `codigo`. */
function script(codigo: number, salida: string) {
  const file = join(mkdtempSync(join(tmpdir(), 'nomos-revisar-')), 'revisar.py');
  writeFileSync(file, `import sys\nprint(${JSON.stringify(salida)})\nsys.exit(${codigo})\n`);
  return file;
}
async function lote(codigo: number, salida: string, fake?: string) {
  const f = checksFixture({files: ['Config/DefaultGame.ini'], deps: {imagen: true, imagenScript: script(codigo, salida)}});
  if (fake) process.env.NOMOS_FAKE = fake;
  try {
    const result = await f.run();
    const filas = f.db.prepare('select check_id, result from test_runs order by rowid').all() as {check_id: string; result: string}[];
    return {f, result, filas};
  } finally { delete process.env.NOMOS_FAKE; }
}

test('imagen: revisar_imagen sale con 0 → passed', async () => {
  const {f, filas} = await lote(0, 'revisar_imagen: 0 fallos');
  try { assert.deepEqual(filas.map(r => [r.check_id, r.result]), [['imagen', 'passed'], ['build', 'passed']]); } finally { f.close(); }
});

test('imagen: revisar_imagen sale con 1 → la tarea vuelve al worker con las líneas FALLO', async () => {
  const {f, filas} = await lote(1, 'FALLO mitad: negro puro en el 53% de la imagen');
  try {
    assert.deepEqual(filas.map(r => [r.check_id, r.result]), [['imagen', 'failed'], ['build', 'pending']]);
    const send = f.db.prepare("select payload from commands where type='worker.send'").get() as {payload: string};
    assert.match(JSON.parse(send.payload).text, /FALLO mitad: negro puro/);
  } finally { f.close(); }
});

test('imagen: sin Pillow (salida 3) → unavailable con pip install pillow', async () => {
  const {f, filas} = await lote(3, 'Falta Pillow: pip install pillow');
  try {
    assert.equal(filas[0].result, 'unavailable');
    assert.match(f.events('test.unavailable')[0].summary, /pip install pillow/);
  } finally { f.close(); }
});

test('imagen: el juego no escribe NOMOS_DEMO activo → unavailable y pide la variable', async () => {
  const {f, filas} = await lote(0, 'revisar_imagen: 0 fallos', 'sin_demo');
  try {
    assert.equal(filas[0].result, 'unavailable');
    assert.match(f.events('test.unavailable')[0].summary, /El juego no tiene modo demo: variable `JUEGO_AUTO`/);
  } finally { f.close(); }
});
