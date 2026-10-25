import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isAlive } from '../../service/src/service-info.ts';
import { removeDir } from '../remove-dir.ts';

// hito 20: con el equipo cargado, pruebas que pasaban aisladas fallaban por plazos de medio segundo y borrados con EPERM

test('isAlive aguanta un servicio que tarda un segundo en contestar', async t => {
  const server = createServer((req, res) => setTimeout(() => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(req.url === '/health' ? {ok: true} : {service: true}));
  }, 1000));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = (server.address() as {port: number}).port;
  assert.equal(await isAlive({pid: process.pid, port, token: 'x', startedAt: ''}), true);
});

test('removeDir espera a que otro proceso suelte su base SQLite (EPERM/EBUSY en Windows)', {skip: process.platform !== 'win32'}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-retencion-'));
  const holder = spawn(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(${JSON.stringify(join(dir, 'nomos.db'))});
    db.exec('create table t(x)');process.stdout.write('abierta');setTimeout(()=>{db.close();process.exit(0)},600)`], {stdio: ['ignore', 'pipe', 'ignore']});
  await once(holder.stdout!, 'data');
  assert.throws(() => rmSync(dir, {recursive: true, force: true}), /EPERM|EBUSY/, 'sin reintentos falla mientras la base está abierta');
  removeDir(dir);
  assert.equal(existsSync(dir), false);
});
