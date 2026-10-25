import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { openDb } from '../service/src/db.ts';
import { readServiceInfo } from '../service/src/service-info.ts';
import { cli, cliFixture } from './cli-helpers.ts';

// hito 18: con una base como la de Block Kings (100 000 eventos, 0,6 KB cada uno) el panel al abrir (SSE desde 0)
// y el vigilante (`/status` cada 2 s) paraban el bucle de eventos ~0,5 s por petición; `/health` no debe notarlo
function seed(dataDir: string, count: number) {
  const db = openDb(join(dataDir, 'nomos.db'));
  const insert = db.prepare("insert into events(id,type,message_id,payload,created_at) values (?,?,null,?,?)");
  const payload = JSON.stringify({ runId: randomUUID(), text: 'x'.repeat(600) }), at = new Date().toISOString();
  db.exec('begin');
  for (let i = 0; i < count; i++) insert.run(randomUUID(), i % 3 ? 'worker.output' : 'tool.completed', payload, at);
  db.exec('commit'); db.close();
}

test('/health contesta en < 200 ms con el servicio ocupado sirviendo SSE desde 0 y /status', { timeout: 120_000 }, async t => {
  const { dataDir, port } = await cliFixture(t);
  seed(dataDir, 100_000);
  assert.equal(cli(dataDir, 'start', '--port', String(port)).status, 0);
  const info = readServiceInfo(dataDir)!, base = `http://127.0.0.1:${info.port}`, auth = { Authorization: `Bearer ${info.token}` };
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.ok, true); assert.equal(health.pid, info.pid); assert.equal(typeof health.uptime, 'number');
  assert.deepEqual(Object.keys(health).sort(), ['ok', 'pid', 'uptime'], 'solo eso: sin base ni Git');
  const streams: AbortController[] = [];
  const load = (async () => {
    for (let i = 0; i < 4; i++) {
      const stream = new AbortController(); streams.push(stream);
      void fetch(base + '/events?since=0', { headers: auth, signal: stream.signal }).then(r => r.body?.cancel()).catch(() => {});
      await fetch(base + '/status', { headers: auth }).then(r => r.json());
    }
  })();
  const latencies: number[] = [];
  let loading = true; void load.finally(() => { loading = false; });
  while (loading || latencies.length < 10) {
    const began = performance.now();
    await fetch(base + '/health').then(r => r.json());
    latencies.push(performance.now() - began);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await load; for (const stream of streams) stream.abort();
  const worst = Math.max(...latencies);
  assert.ok(worst < 200, `peor /health ${Math.round(worst)} ms en ${latencies.length} sondas`);
});
