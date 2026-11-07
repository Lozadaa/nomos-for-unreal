import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { openDecision, resolveDecision } from '../../service/src/repo/decisions.ts';
import { metricas, motivo, renderMetricas } from '../../service/src/metricas.ts';

const t0 = Date.parse('2026-11-07T10:00:00Z');
const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
function event(db: ReturnType<typeof openDb>, min: number, type: string, payload: object) {
  db.prepare('insert into events(id,type,message_id,payload,created_at) values (?,?,?,?,?)').run(`${type}-${min}-${Math.random()}`, type, null, JSON.stringify(payload), at(min));
}

test('metricas: reloj por estado, huecos, decisiones, diferidas, revisiones y comprobaciones a partir de los eventos', () => {
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'H1.1', area: 'gameplay'});
  const id = task.id;
  event(db, 0, 'task.moved', {taskId: id, from: 'pendiente', state: 'preparada'});
  event(db, 30, 'task.moved', {taskId: id, from: 'preparada', state: 'implementando'});
  event(db, 60, 'task.moved', {taskId: id, from: 'implementando', state: 'revisando'});
  // vuelve a implementando sin comprobación: ese hueco no cuenta
  event(db, 62, 'task.moved', {taskId: id, from: 'revisando', state: 'implementando'});
  event(db, 70, 'task.moved', {taskId: id, from: 'implementando', state: 'revisando'});
  event(db, 80, 'test.running', {taskId: id, testRunId: 't1', check: 'cpp'});
  event(db, 83, 'test.passed', {taskId: id, testRunId: 't1', check: 'cpp'});
  event(db, 84, 'review.started', {taskId: id, runId: 'r1'});
  event(db, 90, 'review.finished', {taskId: id, runId: 'r1', approved: false, findings: [{}]});
  event(db, 92, 'worker.message_sent', {taskId: id, runId: 'w1'});
  event(db, 95, 'worker.waiting', {taskId: id, runId: 'w1', reason: 'NOMOS_ASK'});
  event(db, 100, 'worker.message_sent', {taskId: id, runId: 'w1'});
  event(db, 100, 'task.moved', {taskId: id, from: 'revisando', state: 'cerrando'});
  event(db, 120, 'task.moved', {taskId: id, from: 'cerrando', state: 'done'});
  for (let i = 0; i < 12; i++) event(db, 40 + i, 'command.deferred', {reason: '3,2 GB libres, hacen falta 6'});
  event(db, 41, 'command.deferred', {reason: 'Sin hueco en claude'});
  const d = openDecision(db, {taskId: id, reason: 'Comprobación no disponible: build', options: [{id: 'retry', label: '', description: ''}]});
  db.prepare("update events set created_at=? where type='decision.opened'").run(at(50));
  resolveDecision(db, d.id, 'retry', 'nomos-auto');
  db.prepare("update events set created_at=? where type='decision.resolved'").run(at(57));
  event(db, 57, 'decision.auto_resolved', {taskId: id, decisionId: d.id, optionId: 'retry'});
  // resolver una Decisión toca updated_at de la tarea: el reloj de la tarea se fija después
  db.prepare("update tasks set state='done',created_at=?,updated_at=? where id=?").run(at(0), at(120), task.id);

  const m = metricas(db);
  assert.equal(m.tareas.cerradas, 1); assert.equal(m.tareas.horas.mediana, 2);
  assert.deepEqual([m.estados.preparada.suma, m.estados.implementando.suma, m.estados.revisando.suma], [30, 38, 32]);
  assert.deepEqual(m.huecos.entregaAComprobacion, {n: 1, mediana: 10, p90: 10, suma: 10});
  assert.deepEqual(m.huecos.decisionAbierta, {n: 1, mediana: 7, p90: 7, suma: 7});
  assert.deepEqual([m.huecos.preguntaARespuesta.suma, m.huecos.rechazoACorreccion.suma], [5, 2]);
  assert.deepEqual(m.decisiones, {abiertas: 0, resueltas: 1, automaticas: 1, porQuien: {'nomos-auto': 1}});
  assert.deepEqual(m.revisiones, {total: 1, rechazadas: 1, correcciones: 2});
  assert.deepEqual(m.diferidas[0], {motivo: 'N GB libres, hacen falta 6', veces: 12, horas: 12 * 5 / 3600});
  assert.deepEqual(m.comprobaciones.cpp, {n: 1, mediana: 3, p90: 3, suma: 3});
  const text = renderMetricas(m);
  assert.match(text, /Tareas cerradas: 1/); assert.match(text, /entrega → 1\.ª comprobación o revisión\s+n=\s+1\s+mediana\s+10,0 min/);
  assert.match(text, /Decisiones: 0 abiertas · 1 resueltas \(1 solas\) · por nomos-auto 1/);
  assert.match(text, /rechazadas 1 \(100 %\)/);
  // --desde deja fuera lo anterior
  assert.equal(metricas(db, at(200)).revisiones.total, 0);
  assert.equal(motivo('Depende de 1b2c3d4e-0000-4000-8000-000000000001 (preparada)'), 'Depende de # (preparada)');
});
