import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fixture } from './worker-fixture.ts';
import { enqueue } from '../../service/src/commands.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { getTask, moveTask } from '../../service/src/repo/tasks.ts';
import { listLeases } from '../../service/src/leases.ts';
import { resolveDecision } from '../../service/src/repo/decisions.ts';
import { taskContinue } from '../../service/src/handlers/continue.ts';
import { startRunner } from '../../service/src/runner.ts';
import { taskFailures } from '../../service/src/failure-kind.ts';
import { waitFor } from './wait.ts';
import type { Command, Decision } from '../../service/src/model.ts';

const down = (f: ReturnType<typeof fixture>, value: boolean) => { const s = f.state(); s.down = value; writeFileSync(f.file, JSON.stringify(s)); };
function running(f: ReturnType<typeof fixture>, type: string, payload: object): Command {
  const cmd = enqueue(f.db, type, payload, type + ':' + crypto.randomUUID());
  f.db.prepare("update commands set state='running',attempts=1 where id=?").run(cmd.id);
  return {...cmd, state: 'running'};
}
const startPayload = (f: ReturnType<typeof fixture>) => ({taskId: f.task.id, provider: 'codex', role: 'programmer', skills: []});

test('worker.start con Orca cerrado se difiere 30 s sin crear worktree ni retener reservas', async t => {
  const f = fixture(t); down(f, true);
  f.db.prepare("update tasks set leases='[\"Docs/README.md\"]' where id=?").run(f.task.id);
  const cmd = running(f, 'worker.start', startPayload(f));
  assert.deepEqual(await f.handlers['worker.start'](cmd, f.ctx), {deferred: true, reason: 'Orca no está abierto', delayMs: 30_000});
  assert.equal(f.state().creates, undefined);
  assert.deepEqual(listLeases(f.db), []);
  assert.equal(getTask(f.db, f.task.id)!.blockedReason, null, 'Orca cerrado no bloquea la tarea');
  assert.equal(f.run().metadata.phase, 'preparing');
  down(f, false);
  const result = await f.handlers['worker.start'](cmd, f.ctx) as {runId: string};
  assert.equal(result.runId, f.run().id, 'al volver Orca se reutiliza el mismo run');
  assert.equal(filtered(f.db, 'runs', {taskId: f.task.id}).length, 1);
  assert.equal(f.state().creates, 1);
});

test('el runner difiere con evento y la tarea muestra el estado de conexión; a los 30 min, Decisión Abrir Orca / Cancelar', async t => {
  const f = fixture(t); down(f, true);
  const cmd = enqueue(f.db, 'worker.start', startPayload(f), 'arranque');
  const stop = startRunner(f.db, f.handlers, {intervalMs: 1, schedulerIntervalMs: 60_000, context: f.ctx});
  try {
    await waitFor(() => !!f.db.prepare("select 1 from events where type='command.deferred'").get(), 8000);
  } finally { stop(); await stop.drained; }
  const row = f.db.prepare('select state,attempts,error from commands where id=?').get(cmd.id)!;
  assert.deepEqual({...row}, {state: 'pending', attempts: 0, error: 'Orca no está abierto'});
  assert.deepEqual(taskFailures(f.db).get(f.task.id)?.kind, 'connection');
  assert.match(taskFailures(f.db).get(f.task.id)!.text, /Orca no está abierto/);
  f.db.prepare("update events set created_at=? where type='command.deferred'").run(new Date(Date.now() - 31 * 60_000).toISOString());
  f.db.prepare("update commands set state='running',attempts=1 where id=?").run(cmd.id);
  const again: Command = {...cmd, state: 'running'};
  const blocked = await f.handlers['worker.start'](again, f.ctx) as {policyBlocked: boolean; decisionId: string};
  assert.equal(blocked.policyBlocked, true);
  const decision = filtered<Decision>(f.db, 'decisions', {id: blocked.decisionId})[0];
  assert.deepEqual(decision.options.map(o => o.label), ['Abrir Orca', 'Cancelar']);
  resolveDecision(f.db, decision.id, 'approve', 'web');
  const opened = await f.handlers['worker.start'](again, f.ctx);
  assert.equal(f.state().opened, 1, '«Abrir Orca» ejecuta orca open');
  assert.equal((opened as {runId?: string}).runId, f.run().id);
});

test('task.continue con Orca cerrado se difiere y conserva la hija creada', async t => {
  const f = fixture(t);
  for (const state of ['implementando', 'revisando', 'probando'] as const) moveTask(f.db, f.task.id, state);
  f.db.prepare("update tasks set state='done' where id=?").run(f.task.id);
  const now = new Date().toISOString();
  f.db.prepare("insert into worktrees(id,created_at,updated_at,task_id,path,branch,base_commit,state) values('w1',?,?,?,?,'kratos/x','','active')")
    .run(now, now, f.task.id, f.projectDir);
  f.db.prepare(`insert into runs(id,created_at,updated_at,task_id,role,provider,session_ref,attempt,state,started_at,skills,metadata)
    values('r1',?,?,?,'programmer','codex','term_fake',1,'done',?,'[]','{"worktreeId":"w1"}')`).run(now, now, f.task.id, now);
  down(f, true);
  const cmd = running(f, 'task.continue', {taskId: f.task.id, text: 'Sube el contraste'});
  const result = await taskContinue(cmd, f.ctx) as {deferred: boolean; delayMs: number};
  assert.equal(result.deferred, true);
  const children = () => f.db.prepare('select id from tasks where parent_task_id=?').all(f.task.id);
  assert.equal(children().length, 1);
  const payload = JSON.parse(f.db.prepare('select payload from commands where id=?').get(cmd.id)!.payload as string);
  assert.equal(payload.childId, children()[0].id, 'el reintento no crea otra hija');
  await taskContinue({...cmd, payload}, f.ctx);
  assert.equal(children().length, 1);
});
