import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDb } from '../../service/src/db.ts';
import { createServer } from '../../service/src/server.ts';
import { removeDir } from '../remove-dir.ts';

async function statusOf(dataDir: string) {
  const db = openDb(':memory:');
  const server = createServer(db, 'secret', 'service/web', dataDir);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/status`,
      {headers: {Authorization: 'Bearer secret'}});
    return await response.json();
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
}

test('/status expone el proyecto del .uproject de la carpeta de datos', () => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-project-'));
  return (async () => {
    try {
      writeFileSync(join(root, 'CrazyPadel.uproject'), '{}');
      const data = join(root, '.nomos');
      mkdirSync(data);
      // en el padre (lo habitual: .nomos dentro del proyecto)
      assert.deepEqual((await statusOf(data)).project, {name: 'CrazyPadel', uproject: 'CrazyPadel.uproject'});
      // en la propia carpeta de datos
      writeFileSync(join(data, 'Otro.uproject'), '{}');
      assert.deepEqual((await statusOf(data)).project, {name: 'Otro', uproject: 'Otro.uproject'});
    } finally { removeDir(root); }
  })();
});

test('/status sin .uproject deja el proyecto en null', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-project-'));
  try {
    const data = join(root, '.nomos');
    mkdirSync(data);
    assert.equal((await statusOf(data)).project, null);
  } finally { removeDir(root); }
});

test('/status dice el disco libre de la unidad del proyecto (hito 19)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-project-'));
  try {
    const data = join(root, '.nomos'); mkdirSync(data);
    const {disk} = await statusOf(data);
    assert.ok(Number.isFinite(disk.free) && disk.free > 0);
    assert.match(disk.text, /^Disco: [\d.,]+ GB libres( · ejecuta nomos clean)?$/);
    assert.equal(disk.low, disk.free < 30 * 1024 ** 3);
  } finally { removeDir(root); }
});
