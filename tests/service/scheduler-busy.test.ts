import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../service/src/db.ts';
import { createOrca } from '../../service/src/adapters/orca.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { enqueue } from '../../service/src/commands.ts';
import { plan, tick } from '../../service/src/scheduler.ts';
import { capacityNote } from '../../service/src/scheduler-state.ts';
import { refreshBusyTerminals } from '../../service/src/sweep.ts';
import { startRunner } from '../../service/src/runner.ts';

// Hito 17: el cupo cuenta workers vivos; una run terminada cuyo terminal sigue trabajando ocupa hueco.
const config = {concurrency: {claude: 2}};
function setup(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-cupo-')), file = join(dir, 'orca.json'), dataDir = join(dir, '.nomos');
  writeFileSync(file, JSON.stringify({repos: [], tail: ['trabajando'], idle: false}));
  const db = openDb(join(dir, 'nomos.db'));
  const orcaOptions = {bin: process.execPath, args: [fileURLToPath(new URL('../fakes/orca.ts', import.meta.url))], env: {FAKE_ORCA_STATE: file}};
  t.after(() => { db.close(); rmSync(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}); });
  const state = (patch: object) => writeFileSync(file, JSON.stringify({...JSON.parse(readFileSync(file, 'utf8')), ...patch}));
  const run = (title: string, taskState: string, ref: string, done: boolean) => {
    const task = createTask(db, {title, area: 'gameplay', state: taskState as any});
    const r = startRun(db, {taskId: task.id, role: 'implementacion', provider: 'claude', sessionRef: ref});
    if (done) finishRun(db, r.id, 'done', 'NOMOS_DONE');
    return r;
  };
  const next = createTask(db, {title: 'J1.12 Ring', area: 'gameplay', state: 'preparada', spec: 'x', acceptance: ['y'], scope: ['Docs']});
  return {db, dir, dataDir, orca: createOrca(orcaOptions), orcaOptions, state, run, next};
}
const decision = (f: ReturnType<typeof setup>) => plan(f.db, config).find(d => d.taskId === f.next.id)!;

test('una viva + una terminada con el terminal ocupado y concurrency 2: no arranca la tercera; al cerrar el terminal, sí', async t => {
  const f = setup(t);
  f.run('J1.11 Reacciones', 'implementando', 'term_vivo', false);
  f.run('J1.10 Empaquetar', 'revisando', 'term_corrigiendo', true);
  await refreshBusyTerminals(f.db, f.orca);
  assert.equal(decision(f).action, 'wait');
  assert.equal(decision(f).reason, 'Cupo lleno: J1.10 corrigiendo');
  tick(f.db, config, {} as any);
  assert.equal(f.db.prepare("select count(*) n from commands where type='worker.start'").get()!.n, 0);
  assert.equal(requireTask(f.db, f.next.id).waitReason, 'Cupo lleno: J1.10 corrigiendo');
  assert.equal(capacityNote(f.db, config), 'cupo lleno: J1.10 corrigiendo');
  await f.orca.terminalClose('term_corrigiendo');
  await refreshBusyTerminals(f.db, f.orca);
  assert.equal(decision(f).action, 'start');
  assert.equal(capacityNote(f.db, config), null);
});

test('una run terminada con el terminal en reposo (esperando revisión) no ocupa hueco', async t => {
  const f = setup(t); f.state({idle: true});
  f.run('J1.11 Reacciones', 'implementando', 'term_vivo', false);
  f.run('J1.10 Empaquetar', 'revisando', 'term_espera', true);
  await refreshBusyTerminals(f.db, f.orca);
  assert.equal(decision(f).action, 'start');
  assert.equal(capacityNote(f.db, config), null);
});

test('una corrección encolada para una run terminada ocupa hueco hasta entregarse', t => {
  const f = setup(t);
  f.run('J1.11 Reacciones', 'implementando', 'term_vivo', false);
  const done = f.run('J1.10 Empaquetar', 'revisando', 'term_corrigiendo', true);
  assert.equal(decision(f).action, 'start', 'sin corrección ni terminal ocupado, hay hueco');
  enqueue(f.db, 'worker.send', {runId: done.id, text: 'Fusiona main y re-empaqueta'}, `send:${done.id}`);
  assert.equal(decision(f).reason, 'Cupo lleno: J1.10 corrigiendo');
});

test('una continuación que reutiliza el terminal de su run terminada cuenta una sola vez', async t => {
  const f = setup(t);
  const original = f.run('J1.10 Empaquetar', 'done', 'term_compartido', true);
  const child = createTask(f.db, {title: 'Ajuste: J1.10 Empaquetar', area: 'gameplay', state: 'implementando'});
  startRun(f.db, {taskId: child.id, role: 'implementacion', provider: 'claude', sessionRef: original.sessionRef!});
  await refreshBusyTerminals(f.db, f.orca);
  assert.equal(decision(f).action, 'start', 'el terminal compartido es un solo worker');
});

test('el runner mira los terminales antes de planificar', async t => {
  const f = setup(t);
  writeFileSync(join(f.dir, 'config.json'), JSON.stringify(config));
  f.run('J1.11 Reacciones', 'implementando', 'term_vivo', false);
  f.run('J1.10 Empaquetar', 'revisando', 'term_corrigiendo', true);
  const starts = () => Number(f.db.prepare("select count(*) n from commands where type='worker.start'").get()!.n);
  const stop = startRunner(f.db, {'worker.start': async () => ({deferred: true, reason: 'prueba', delayMs: 60_000})},
    {orcaOptions: f.orcaOptions, intervalMs: 20, schedulerIntervalMs: 50, context: {dataDir: f.dir}});
  try {
    const end = Date.now() + 15_000;
    while (requireTask(f.db, f.next.id).waitReason !== 'Cupo lleno: J1.10 corrigiendo') {
      assert.ok(Date.now() < end, `espera: ${requireTask(f.db, f.next.id).waitReason}`); await new Promise(r => setTimeout(r, 50));
    }
    assert.equal(starts(), 0);
    f.state({closed: ['term_corrigiendo']});
    while (!starts()) { assert.ok(Date.now() < end, 'no arrancó al cerrar el terminal'); await new Promise(r => setTimeout(r, 50)); }
  } finally { stop(); await stop.drained; }
});

test('nomos status dice «cupo lleno: J1.10 corrigiendo» mientras dure', async () => {
  const {fixture} = await import('./route-fixture.ts'); const f = await fixture();
  try {
    writeFileSync(join(f.dir, 'config.json'), JSON.stringify(config));
    const status = async () => (await (await f.request('/status')).json() as any).capacity;
    assert.equal(await status(), null);
    const live = createTask(f.db, {title: 'J1.11 Reacciones', area: 'gameplay', state: 'implementando'});
    startRun(f.db, {taskId: live.id, role: 'implementacion', provider: 'claude', sessionRef: 'a'});
    const busy = createTask(f.db, {title: 'J1.10 Empaquetar', area: 'gameplay', state: 'revisando'});
    const run = finishRun(f.db, startRun(f.db, {taskId: busy.id, role: 'implementacion', provider: 'claude', sessionRef: 'b'}).id, 'done', 'fin');
    await refreshBusyTerminals(f.db, {terminalAlive: async () => true, terminalIsIdle: async () => false} as any);
    assert.equal(await status(), 'cupo lleno: J1.10 corrigiendo');
    await refreshBusyTerminals(f.db, {terminalAlive: async () => true, terminalIsIdle: async () => true} as any);
    assert.equal(await status(), null, `run ${run.id} en reposo`);
  } finally { await f.close(); }
});
