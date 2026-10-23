import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { createTask } from '../../service/src/repo/tasks.ts';

test('una opción de Decisión conserva su miniatura propia y la marca de recomendada; una URL externa se descarta', async () => {
  const f = await fixture();
  try {
    const task = createTask(f.db, {title: 'Elegir caballero', area: 'assets'});
    const res = await f.request('/decisions', {taskId: task.id, reason: 'Elegir modelo', options: [
      {id: 'a', label: 'Caballero', description: 'Del catálogo', thumbnail: '/catalog/c1/thumbnail', recommended: true},
      {id: 'b', label: 'Buscar otro', description: 'Volver a buscar', thumbnail: 'https://otro.example/x.png', recommended: 'sí'}]});
    assert.equal(res.status, 201);
    const decision = await res.json() as {options: Record<string, unknown>[]};
    assert.deepEqual(decision.options, [
      {id: 'a', label: 'Caballero', description: 'Del catálogo', recommended: true, thumbnail: '/catalog/c1/thumbnail'},
      {id: 'b', label: 'Buscar otro', description: 'Volver a buscar'}]);
  } finally { await f.close(); }
});
