import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { teamFixture } from './team-fixture.ts';
import { requireTask, getTask, createTask } from '../../service/src/repo/tasks.ts';
import { listLeases, acquire } from '../../service/src/leases.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { listEvents } from '../../service/src/store.ts';
import { createServer } from '../../service/src/server.ts';
import { recordPeers, teamTick, hhmm, identity, type Card } from '../../service/src/team.ts';
import { requestJson, token } from '../helpers.ts';
import { plan } from '../../service/src/scheduler.ts';
import { removeDir } from '../remove-dir.ts';

const hour = 3_600_000;
const card = (over: Partial<Card> = {}): Card => ({id: 'ana1', name: 'Ana', frente: 'UI', updatedAt: new Date().toISOString(),
  tasks: [], leases: [], decisions: [], build: null, requests: [], ...over});
/** Worker con equipo encendido, sin remoto: decide con lo último que vio de los peers. */
function teamWorker(t: any) {
  const f = fixture(t);
  writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({concurrency: {codex: 2, claude: 2}, team: {enabled: true, name: 'Richard', frente: 'combate'}}));
  f.db.prepare('update tasks set leases=? where id=?').run(JSON.stringify(['Content/UI/WBP_HUD.uasset']), f.task.id);
  return f;
}
const lease = (path: string, at: number, until: number) => ({path, taskId: 'tarea-ana', at: new Date(at).toISOString(), until: new Date(until).toISOString()});

test('reserva de un peer: el worker no arranca y la tarea espera «Ana tiene reservado WBP_HUD hasta HH:MM»', async t => {
  const f = teamWorker(t), until = Date.now() + hour;
  recordPeers(f.db, f.dataDir, [card({leases: [lease('Content/UI/WBP_HUD.uasset', Date.now() - 60_000, until)]})]);
  await f.start();
  assert.equal(f.state().creates ?? 0, 0, 'no se creó el worktree');
  assert.equal(requireTask(f.db, f.task.id).waitReason, `Ana tiene reservado WBP_HUD hasta ${hhmm(new Date(until).toISOString())}`);
  assert.deepEqual(listLeases(f.db), [], 'mi reserva se suelta mientras espera');
  assert.equal(listEvents(f.db, 0).filter(e => e.type === 'lease.conflict').length, 1);
});

test('reserva de un peer sobre la carpeta que contiene la ruta también espera; caducada no cuenta', async t => {
  const f = teamWorker(t);
  recordPeers(f.db, f.dataDir, [card({leases: [lease('Content/UI', Date.now() - 60_000, Date.now() + hour)]})]);
  await f.start();
  assert.match(requireTask(f.db, f.task.id).waitReason!, /^Ana tiene reservado UI hasta/);
  recordPeers(f.db, f.dataDir, [card({leases: [lease('Content/UI', Date.now() - 2 * hour, Date.now() - 60_000)]})]);
  await f.invoke('worker.start', {taskId: f.task.id, provider: 'codex', role: 'programmer', skills: [], attempt: 2});
  assert.equal(f.state().creates, 1, 'con la reserva caducada arranca');
});

test('dos reservas casi a la vez: gana la más antigua (la mía), el worker arranca', async t => {
  const f = teamWorker(t);
  recordPeers(f.db, f.dataDir, [card({leases: [lease('Content/UI/WBP_HUD.uasset', Date.now() + 30_000, Date.now() + hour)]})]);
  await f.start();
  assert.equal(f.state().creates, 1);
});

test('binario sin reserva al integrar: libre se reserva al vuelo; si lo tiene un peer, la tarea espera con su nombre', async () => {
  const f = teamFixture();
  try {
    const a = f.clone('Richard', 'combate'), b = f.clone('Ana', 'UI');
    const free = a.task('mapa', {'Content/Mapas/L_Patio.umap': Buffer.from([0, 1, 2])});
    assert.equal((await a.integrate(free.task.id)).integrated, true);
    assert.deepEqual(getTask(a.db, free.task.id)!.leases, ['Content/Mapas/L_Patio.umap']);
    assert.deepEqual(a.events('lease.claimed').map(e => e.paths), [['Content/Mapas/L_Patio.umap']]);
    // Ana reserva L_Arena y lo publica; Richard lo tocó sin reserva
    const anaTask = createTask(b.db, {title: 'Arena', area: 'escenarios'}), run = startRun(b.db, {taskId: anaTask.id, role: 'implementacion', provider: 'claude'});
    acquire(b.db, run.id, anaTask.id, ['Content/Mapas/L_Arena.umap']);
    await teamTick(b.db, b.dataDir, b.dir, {pushedAt: 0, fetchedAt: 0, warned: false});
    const taken = a.task('arena', {'Content/Mapas/L_Arena.umap': Buffer.from([0, 9])});
    const result = await a.integrate(taken.task.id);
    assert.equal(result.reason, 'L_Arena lo tiene Ana');
    assert.equal(getTask(a.db, taken.task.id)!.waitReason, 'L_Arena lo tiene Ana');
    assert.deepEqual(listLeases(a.db), [], 'ni la reserva al vuelo ni la de integración se quedan');
  } finally { f.close(); }
});

async function serve(t: any, db: any, dataDir: string) {
  const web = mkdtempSync(join(tmpdir(), 'nomos-web-'));
  const server = createServer(db, token, web, dataDir);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); removeDir(web); });
  return server;
}

test('tarea con título parecido a una abierta de un peer abre la Decisión «duplicar o pedírsela»; lleva dueño', async t => {
  const f = teamFixture(); t.after(() => f.close());
  const a = f.clone('Richard', 'combate');
  recordPeers(a.db, a.dataDir, [card({tasks: [{id: 'x', title: 'Barra de vida del jugador', state: 'implementando', area: 'ui'}]})]);
  const server = await serve(t, a.db, a.dataDir);
  // como la CLI: crea y después prepara con la spec
  const make = async (title: string, area: string) => {
    const created = await (await requestJson(server, 'POST', '/tasks', {title, area, spec: '', acceptance: []})).json();
    return {created, prepared: await (await requestJson(server, 'POST', `/tasks/${created.id}/spec`, {spec: 'Hacer', acceptance: ['Se ve'], scope: ['Content/UI'], area})).json()};
  };
  const {created, prepared} = await make('Barra de vida jugador', 'ui');
  assert.equal(created.owner, identity(a.dataDir).id);
  const [decision] = listDecisions(a.db, 'open');
  assert.equal(decision.reason, 'Ana ya tiene “Barra de vida del jugador”: ¿duplicar o pedírsela?');
  assert.deepEqual(decision.options.map(o => o.label), ['Duplicar', 'Pedírsela']);
  assert.equal(prepared.decisionId, decision.id, 'no arranca hasta decidir');
  assert.equal(resolveDecision(a.db, decision.id, 'duplicar', 'usuario').state, 'resolved', 'la Decisión no caduca al prepararla');
  await requestJson(server, 'POST', `/tasks/${created.id}/spec`, {spec: 'Hacer más', acceptance: ['Se ve'], scope: ['Content/UI'], area: 'ui'});
  assert.equal(listDecisions(a.db, 'open').length, 0, 'decidida, no se vuelve a preguntar');
  const other = await make('Sonido del golpe', 'audio');
  assert.equal(other.prepared.decisionId, null, 'un título distinto no pregunta');
});

test('una tarea ajena (otro dueño) no se mueve desde el panel ni la CLI', async t => {
  const f = teamFixture(); t.after(() => f.close());
  const a = f.clone('Richard', 'combate'), server = await serve(t, a.db, a.dataDir);
  const foreign = createTask(a.db, {title: 'De Ana', area: 'ui'}), mine = createTask(a.db, {title: 'Mía', area: 'ui'});
  a.db.prepare('update tasks set owner=? where id=?').run('ana1', foreign.id);
  a.db.prepare('update tasks set owner=? where id=?').run(identity(a.dataDir).id, mine.id);
  const denied = await requestJson(server, 'POST', `/tasks/${foreign.id}/priority`, {priority: 5});
  assert.equal(denied.status, 409);
  assert.deepEqual(await denied.json(), {error: 'foreign_task'});
  assert.equal((await requestJson(server, 'POST', `/tasks/${mine.id}/priority`, {priority: 5})).status, 200);
});

test('el planificador no intenta arrancar mientras un peer tiene la reserva (sin runs fallidas en bucle)', async t => {
  const f = teamWorker(t), until = Date.now() + hour;
  f.db.prepare("update tasks set state='preparada' where id=?").run(f.task.id);
  recordPeers(f.db, f.dataDir, [card({leases: [lease('Content/UI/WBP_HUD.uasset', Date.now() - 60_000, until)]})]);
  const [decision] = plan(f.db, {});
  assert.deepEqual([decision.action, decision.reason], ['wait', `Ana tiene reservado WBP_HUD hasta ${hhmm(new Date(until).toISOString())}`]);
  recordPeers(f.db, f.dataDir, [card()]);
  assert.equal(plan(f.db, {})[0].action, 'start', 'sin la reserva del peer, arranca');
});
