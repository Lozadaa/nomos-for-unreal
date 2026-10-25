import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAtomic, readJson } from '../../service/src/atomic.ts';
import { deliveryCheckpoint } from '../../service/src/watcher-cursors.ts';
import { removeDir } from '../remove-dir.ts';

// Hito 22: el reinicio del 25 dejó watcher-cursors.json lleno de ceros (escrito sin llegar al disco).
function dir(t: any) { const d = mkdtempSync(join(tmpdir(), 'nomos-atomic-')); t.after(() => removeDir(d)); return d; }

test('writeAtomic escribe por archivo temporal propio y rename: no deja .tmp y el contenido es completo', t => {
  const d = dir(t), file = join(d, 'estado.json');
  writeAtomic(file, JSON.stringify({a: 1}));
  writeAtomic(file, JSON.stringify({a: 2}));
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {a: 2});
  assert.deepEqual(readdirSync(d), ['estado.json']);
});

test('readJson ignora con aviso un JSON corrupto o lleno de ceros y devuelve el valor de reserva', t => {
  const d = dir(t), file = join(d, 'estado.json'), warnings: string[] = [];
  writeFileSync(file, Buffer.alloc(64));
  assert.deepEqual(readJson(file, [], m => warnings.push(m)), []);
  assert.match(warnings[0], /corrupto/);
  assert.deepEqual(readJson(join(d, 'no-existe.json'), {x: 1}, m => warnings.push(m)), {x: 1});
  assert.equal(warnings.length, 1, 'que falte no es corrupción');
});

test('cursores llenos de ceros: aviso y cursor nuevo; al avanzar queda un archivo válido', t => {
  const d = dir(t), file = join(d, 'watcher-cursors.json');
  writeFileSync(file, Buffer.alloc(128));
  const errors: string[] = [], original = console.error;
  console.error = (m: string) => { errors.push(m); };
  try {
    const checkpoint = deliveryCheckpoint(d, 'sesion');
    assert.equal(checkpoint.cursor, 0);
    checkpoint.advance(7);
  } finally { console.error = original; }
  assert.match(errors.join('\n'), /watcher_checkpoint_recovery/);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {version: 2, cursors: {sesion: 7}});
  assert.deepEqual(readdirSync(d), ['watcher-cursors.json']);
});
