import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { listDecisions, openDecision } from '../../service/src/repo/decisions.ts';
import { autoBy, autoOption, sweepAutoDecisions } from '../../service/src/decisiones-auto.ts';
import { reconcileOptions } from '../../service/src/handlers/reconcile.ts';
import { retryOption, waiverOption } from '../../service/src/checks/gate.ts';
import { listEvents } from '../../service/src/store.ts';

const min = 60_000;
const checkOptions = [waiverOption, retryOption];

test('autoOption: las familias obvias eligen su opción; una pregunta de verdad, null', () => {
  assert.equal(autoOption({reason: 'Reconciliar worker existente antes de continuar', options: reconcileOptions}), 'leave');
  assert.equal(autoOption({reason: 'Comprobación no disponible: build', options: checkOptions}), 'retry');
  assert.equal(autoOption({reason: 'Comprobación no disponible: build', options: checkOptions}, 1), 'continue', 'la segunda vez exime');
  assert.equal(autoOption({reason: 'Cambios sin registrar: a.cpp', options: [{id: 'commit', label: '', description: ''}]}), 'commit');
  assert.equal(autoOption({reason: 'Cambios sin registrar: a.cpp', options: [{id: 'discard', label: '', description: ''}]}), null, 'sin la opción segura no se toca');
  assert.equal(autoOption({reason: '¿UI3.9 puede ampliar su alcance?', options: reconcileOptions}), null);
  assert.equal(autoOption({reason: 'Tarea parada en «implementando» sin ningún paso en marcha: falta nomos worker send', options: [{id: 'retomar', label: '', description: ''}]}), null);
});

test('pasado el plazo se resuelve sola, deja decision.auto_resolved y desbloquea la tarea; antes del plazo y con el plazo a 0, no', () => {
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'H0.3', area: 'builds'});
  const d = openDecision(db, {taskId: task.id, reason: 'Comprobación no disponible: build', options: checkOptions, evidence: [{kind: 'gate:checks', ref: '["t1"]'}]});
  const opened = Date.parse(d.createdAt);
  assert.equal(sweepAutoDecisions(db, {}, opened + 4 * min), 0);
  assert.equal(sweepAutoDecisions(db, {decisiones: {autoMinutos: 0}}, opened + 60 * min), 0, 'apagado');
  assert.equal(sweepAutoDecisions(db, {}, opened + 5 * min), 1);
  const [resolved] = listDecisions(db, 'resolved');
  assert.deepEqual([resolved.id, resolved.chosenOptionId, resolved.resolvedBy], [d.id, 'retry', autoBy]);
  assert.equal(requireTask(db, task.id).decisionId, null);
  const event = listEvents(db, 0).find(e => e.type === 'decision.auto_resolved')!;
  assert.deepEqual([event.payload.decisionId, event.payload.optionId, event.payload.afterMinutes, event.payload.prior], [d.id, 'retry', 5, 0]);
  // el mismo problema vuelve tras el reintento automático: la segunda vez se exime, no se reintenta sin fin
  const again = openDecision(db, {taskId: task.id, reason: 'Comprobación no disponible: build', options: checkOptions, evidence: [{kind: 'gate:checks', ref: '["t2"]'}]});
  assert.equal(sweepAutoDecisions(db, {decisiones: {autoMinutos: 1}}, Date.parse(again.createdAt) + min), 1);
  assert.equal(listDecisions(db, 'resolved').find(x => x.id === again.id)!.chosenOptionId, 'continue');
});

test('una Decisión para una persona sigue abierta por mucho que pase', () => {
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'UI3.9', area: 'ui'});
  const d = openDecision(db, {taskId: task.id, reason: '¿UI3.9 puede ampliar su alcance?', options: reconcileOptions});
  assert.equal(sweepAutoDecisions(db, {}, Date.parse(d.createdAt) + 600 * min), 0);
  assert.equal(listDecisions(db, 'open').length, 1);
});

test('las «para una persona» solo se resuelven sin persona (evento o decisiones.autonomo), y en evento todo a 1 min', () => {
  const accept = [{id: 'review', label: '', description: ''}, {id: 'aceptar', label: '', description: ''}, {id: 'cancel', label: '', description: ''}];
  assert.equal(autoOption({reason: 'Máximo de tres correcciones alcanzado', options: accept}), null, 'con persona, la pregunta es suya');
  assert.equal(autoOption({reason: 'Máximo de 5 correcciones alcanzado', options: accept}, 0, true), 'aceptar');
  assert.equal(autoOption({reason: 'Máximo de tres correcciones alcanzado', options: accept.filter(o => o.id !== 'aceptar')}, 0, true), null,
    'tras un fallo de comprobación no hay «aceptar»: sigue para el director');
  assert.equal(autoOption({reason: 'QA de UI sin mejora medible', options: [{id: 'return', label: '', description: ''}, {id: 'aceptar', label: '', description: ''}]}, 0, true), 'aceptar');
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'M1', area: 'gameplay'});
  const person = openDecision(db, {taskId: task.id, reason: 'Máximo de tres correcciones alcanzado', options: accept, evidence: [{kind: 'gate:corrections', ref: 'a'}]});
  const at = Date.parse(person.createdAt) + min;
  assert.equal(sweepAutoDecisions(db, {decisiones: {autoMinutos: 1}}, at), 0, 'modo sesión sin autonomo');
  assert.equal(sweepAutoDecisions(db, {decisiones: {autoMinutos: 1, autonomo: true}}, at), 1);
  const other = createTask(db, {title: 'M2', area: 'builds'});
  const obvious = openDecision(db, {taskId: other.id, reason: 'Comprobación no disponible: build', options: checkOptions, evidence: [{kind: 'gate:checks', ref: '["x"]'}]});
  assert.equal(sweepAutoDecisions(db, {director: {mode: 'evento'}}, Date.parse(obvious.createdAt) + min), 1, 'las obvias, a 1 min en evento');
});
