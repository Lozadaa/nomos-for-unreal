import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { enqueue } from '../../service/src/commands.ts';
import { createTask, moveTask, requireTask } from '../../service/src/repo/tasks.ts';
import { openStallDecisions, stalledTasks } from '../../service/src/stall.ts';
import { doctor } from '../../service/src/doctor.ts';

// recorrido del hito 7: QA visual aprobado y la tarea quedó en «revisando» sin ningún comando ni run
test('atasco: estado activo sin comando pendiente ni run viva → doctor lo marca y se abre una sola Decisión', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'kratos-stall-'));
  const db = openDb(join(dir, 'kratos.db')); t.after(() => { db.close(); rmSync(dir, {recursive: true, force: true}); });
  const task = createTask(db, {title: 'HUD de vida', area: 'ui'});
  moveTask(db, task.id, 'revisando');
  const later = Date.now() + 11 * 60_000;
  assert.deepEqual(stalledTasks(db, Date.now()), [], 'recién movida no es atasco');
  assert.deepEqual(stalledTasks(db, later).map(s => [s.taskId, s.state]), [[task.id, 'revisando']]);

  const pending = enqueue(db, 'review.start', {taskId: task.id}, 'k1');
  assert.deepEqual(stalledTasks(db, later), [], 'con un paso encolado no es atasco');
  db.prepare("update commands set state='done' where id=?").run(pending.id);

  const row = (await doctor(dir, db, {orca: {isRunning: async () => true}}, later)).find(r => r.id === 'stalls')!;
  assert.equal(row.state, 'falla');
  assert.match(row.detail, /HUD de vida · revisando · 11 min/);

  assert.equal(openStallDecisions(db, later), 1);
  assert.match(requireTask(db, task.id).blockedReason ?? '', /parada en «revisando»/);
  assert.equal(openStallDecisions(db, later), 0, 'con la Decisión abierta ya no se repite');
});

test('implementando con la run del responsable caída (envío fallido) y sin comandos también es atasco', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'kratos-stall-'));
  const db = openDb(join(dir, 'kratos.db')); t.after(() => { db.close(); rmSync(dir, {recursive: true, force: true}); });
  const task = createTask(db, {title: 'HUD de vida', area: 'ui'});
  moveTask(db, task.id, 'implementando');
  assert.deepEqual(stalledTasks(db, Date.now() + 11 * 60_000).map(s => s.state), ['implementando']);
});
