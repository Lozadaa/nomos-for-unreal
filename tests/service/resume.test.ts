import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask, moveTask, setTaskWait } from '../../service/src/repo/tasks.ts';
import { openDecision } from '../../service/src/repo/decisions.ts';
import { holdTask } from '../../service/src/hold.ts';
import { renderResume } from '../../service/src/resume.ts';

test('la reanudación resume servicio, tareas por estado con su espera, Decisión, hold y la orden del vigilante en ≤ 60 líneas', t => {
  const db = openDb(':memory:');t.after(() => db.close());
  createTask(db, {id: 'pendiente-1', title: 'Definir salto', area: 'gameplay'});
  createTask(db, {id: 'curso-1', title: 'Bloqueo con escudo', area: 'gameplay'});
  moveTask(db, 'curso-1', 'implementando');setTaskWait(db, 'curso-1', 'Esperando reserva de Content/Mapas');
  createTask(db, {id: 'hecha-1', title: 'Menú principal', area: 'ui'});
  moveTask(db, 'hecha-1', 'implementando');moveTask(db, 'hecha-1', 'cerrando');moveTask(db, 'hecha-1', 'done');
  openDecision(db, {taskId: 'pendiente-1', reason: '¿Doble salto o salto simple?', evidence: [],
    options: [{id: 'a', label: 'Doble', description: 'Dos saltos'}, {id: 'b', label: 'Simple', description: 'Uno'}]});
  holdTask(db, 'curso-1', 'Esperar la build de Emory', 'build.finished');
  const text = renderResume(db, 'C:/juego/.nomos', 'parado');
  assert.ok(text.split('\n').length <= 60, `${text.split('\n').length} líneas`);
  assert.match(text, /\| parado \| /);
  assert.match(text, /\| pendiente \| Definir salto \(pendient\) \| — \|/);
  assert.match(text, /\| implementando \| Bloqueo con escudo \(curso-1\) \| Esperando reserva de Content\/Mapas \|/);
  assert.doesNotMatch(text, /Menú principal/);assert.match(text, /2 abiertas, 1 terminadas/);
  assert.match(text, /\| Definir salto \| ¿Doble salto o salto simple\? \|/);
  assert.match(text, /\| Bloqueo con escudo \| .*Esperar la build de Emory/);
  assert.match(text, /nomos vigila --session <sesion> --data "C:\/juego\/.nomos" --types message\.received,run\.finished,.*task\.closing_blocked/);
});
