import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createTask, moveTask, requireTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { read } from '../../service/src/repo/rows.ts';
import { resolveDecision } from '../../service/src/repo/decisions.ts';
import { appendEvent } from '../../service/src/store.ts';
import { sweepStalls } from '../../service/src/stall.ts';
import { activeHold, holdTask } from '../../service/src/hold.ts';
import { integratePayload } from '../../service/src/routes/task-closing.ts';
import type { Decision } from '../../service/src/model.ts';
import { removeDir } from '../remove-dir.ts';

// hito 21 (J2.0a en Block Kings, 12:39 UTC): revisión aprobada, el director la retiene hasta que acabe otra integración
function approved(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-hold-'));
  const db = openDb(join(dir, 'nomos.db')); t.after(() => { db.close(); removeDir(dir); });
  const task = createTask(db, {title: 'J2.0a', area: 'gameplay'});
  const implementer = startRun(db, {taskId: task.id, provider: 'claude', role: 'implementacion'});
  finishRun(db, implementer.id, 'done', 'Terminado');
  const reviewer = startRun(db, {taskId: task.id, provider: 'claude', role: 'revisor'});
  finishRun(db, reviewer.id, 'done', 'Aprobado');
  moveTask(db, task.id, 'revisando');
  db.prepare('update tasks set review_approved=1 where id=?').run(task.id);
  const decision = () => { const id = requireTask(db, task.id).decisionId; return id ? read<Decision>(db, 'decisions', id)! : null; };
  return {db, task, decision, ctx: {db} as any};
}
const minutes = (n: number) => Date.now() + n * 60_000;

test('revisión aprobada sin integración: ninguna Decisión de «falta nomos task review»', async t => {
  const f = approved(t);
  await sweepStalls(f.ctx, minutes(11));
  assert.equal(f.decision(), null, 'esperar la integración unos minutos no es un atasco');
});

test('aprobada más allá del umbral: la Decisión nombra el paso real y la recomendada pide la integración', async t => {
  const f = approved(t);
  await sweepStalls(f.ctx, minutes(31));
  const decision = f.decision()!;
  assert.equal(decision.reason, 'Revisión aprobada: falta pedir la integración');
  const recommended = decision.options.find(o => o.recommended)!;
  assert.equal(recommended.id, 'integrar');
  assert.match(recommended.description, /nomos task integrate/);
  resolveDecision(f.db, decision.id, recommended.id, 'director');
  await sweepStalls(f.ctx, minutes(31));
  assert.equal(requireTask(f.db, f.task.id).state, 'integrando');
  const integrations = f.db.prepare("select payload from commands where type='integrate.run'").all();
  assert.equal(integrations.length, 1);
  await sweepStalls(f.ctx, minutes(31));
  assert.equal(f.db.prepare("select count(*) n from commands where type='integrate.run'").get()!.n, 1, 'la opción se ejecuta una vez');
});

test('espera marcada: ningún barrido abre Decisión; se levanta al pedir la integración', async t => {
  const f = approved(t);
  holdTask(f.db, f.task.id, 'Un Unreal pesado a la vez: espero a J5.1');
  await sweepStalls(f.ctx, minutes(120));
  assert.equal(f.decision(), null);
  assert.equal(activeHold(f.db, requireTask(f.db, f.task.id))?.reason, 'Un Unreal pesado a la vez: espero a J5.1');
  integratePayload(f.db, f.task.id);
  assert.equal(requireTask(f.db, f.task.id).hold, null, 'pedir la integración levanta la espera');
});

test('la espera vence a los N minutos o con el evento indicado', async t => {
  const f = approved(t);
  holdTask(f.db, f.task.id, 'Diez minutos', 10);
  assert.ok(activeHold(f.db, requireTask(f.db, f.task.id), minutes(5)));
  assert.equal(activeHold(f.db, requireTask(f.db, f.task.id), minutes(11)), null);
  holdTask(f.db, f.task.id, 'Hasta que integre J5.1', 'integration.completed');
  assert.ok(activeHold(f.db, requireTask(f.db, f.task.id)));
  appendEvent(f.db, 'integration.completed', null, {taskId: 'otra'});
  assert.equal(activeHold(f.db, requireTask(f.db, f.task.id)), null);
  await sweepStalls(f.ctx, minutes(31));
  assert.equal(f.decision()?.reason, 'Revisión aprobada: falta pedir la integración', 'vencida, vuelve a contar');
});

test('hold rechaza motivo vacío, plazos inválidos y tareas cerradas', async t => {
  const f = approved(t);
  for (const [reason, until] of [['', undefined], ['  ', 5], ['Motivo', 0], ['Motivo', 1.5], ['Motivo', 'no es un tipo']] as const)
    assert.throws(() => holdTask(f.db, f.task.id, reason, until as any), /invalid_hold/);
  f.db.prepare("update tasks set state='done' where id=?").run(f.task.id);
  assert.throws(() => holdTask(f.db, f.task.id, 'Motivo'), /invalid_transition/);
});
