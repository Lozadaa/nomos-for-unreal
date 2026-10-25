import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { cliPath } from './cli-helpers.ts';
import { removeDir } from './remove-dir.ts';

// hito 16: el vigilante distingue ocupado (vivo y lento) de caído
async function watch(t: test.TestContext, service: object, ms: number) {
  const dataDir = mkdtempSync(join(tmpdir(), 'nomos-busy-'));
  writeFileSync(join(dataDir, 'service.json'), JSON.stringify({ token: 'b'.repeat(48), startedAt: new Date().toISOString(), ...service }));
  const child = spawn(process.execPath, [cliPath, 'vigila', '--session', 'director', '--data', dataDir], { windowsHide: true });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; });
  t.after(() => removeDir(dataDir));
  await delay(ms);
  const exited = once(child, 'exit'); child.kill(); await exited;
  return output.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

test('servicio vivo pero lento en /status y /events: el vigilante no grita service_down', { timeout: 30_000 }, async t => {
  const server = createServer((req, res) => {
    const reply = (body: string, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body); };
    if (req.url === '/health') return reply('{"ok":true}');
    if (req.url === '/director/heartbeat') return reply('', 204);
    // un diff de 40 s o un Unreal cargando: /status y /events tardan más que el plazo corto del vigilante
    setTimeout(() => req.url === '/status' ? reply('{"lastAckSeq":0}')
      : (res.writeHead(200, { 'Content-Type': 'text/event-stream' }), res.write(':\n\n')), 2500);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const lines = await watch(t, { pid: process.pid, port: (server.address() as { port: number }).port }, 9000);
  assert.equal(lines.some(line => line.error === 'service_down'), false, JSON.stringify(lines));
});

test('servicio caído: service_down una sola vez por caída, no cada 2 s', { timeout: 30_000 }, async t => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port; server.close(); await once(server, 'close');
  const lines = await watch(t, { pid: 999999, port }, 7000);
  assert.deepEqual(lines, [{ error: 'service_down' }]);
});

// hito 18: un /health que tarda 6 s una vez (bucle ocupado) no es una caída; como mucho un aviso service_slow
test('/health tarda 6 s una vez con el pid vivo: service_slow, nunca service_down', { timeout: 40_000 }, async t => {
  let first = true;
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      const late = first; first = false;
      return setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }, late ? 6000 : 0);
    }
    res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"busy"}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const lines = await watch(t, { pid: process.pid, port: (server.address() as { port: number }).port }, 16_000);
  assert.equal(lines.some(line => line.error === 'service_down'), false, JSON.stringify(lines));
  const slow = lines.filter(line => line.warn === 'service_slow');
  assert.equal(slow.length, 1, 'una vez por minuto: ' + JSON.stringify(lines));
  assert.ok(Number.isInteger(slow[0].ms) && slow[0].ms >= 5000, JSON.stringify(slow));
});

test('pid vivo pero el puerto no acepta conexiones: service_down tras los reintentos', { timeout: 40_000 }, async t => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port; server.close(); await once(server, 'close');
  const lines = await watch(t, { pid: process.pid, port }, 16_000);
  assert.deepEqual(lines, [{ error: 'service_down' }]);
});
