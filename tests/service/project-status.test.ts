import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDb } from '../../service/src/db.ts';
import { createServer } from '../../service/src/server.ts';

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
  const root = mkdtempSync(join(tmpdir(), 'kratos-project-'));
  return (async () => {
    try {
      writeFileSync(join(root, 'CrazyPadel.uproject'), '{}');
      const data = join(root, '.kratos');
      mkdirSync(data);
      // en el padre (lo habitual: .kratos dentro del proyecto)
      assert.deepEqual((await statusOf(data)).project, {name: 'CrazyPadel', uproject: 'CrazyPadel.uproject'});
      // en la propia carpeta de datos
      writeFileSync(join(data, 'Otro.uproject'), '{}');
      assert.deepEqual((await statusOf(data)).project, {name: 'Otro', uproject: 'Otro.uproject'});
    } finally { rmSync(root, {recursive: true, force: true}); }
  })();
});

test('/status sin .uproject deja el proyecto en null', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kratos-project-'));
  try {
    const data = join(root, '.kratos');
    mkdirSync(data);
    assert.equal((await statusOf(data)).project, null);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
