import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { areas } from '../../service/src/routes/context.ts';
import { migrateAreas } from '../../service/src/migrations.ts';

// Candela 2026-11-10: el director pidió una tarea `vfx` (área válida en la API) y la base la rechazó con un 500
test('jam: toda área que acepta la API cabe en la tabla de tareas, también en una base ya creada', () => {
  const db = openDb(':memory:');
  try {
    for (const area of areas) assert.equal(createTask(db, {title: area, area}).area, area);
    migrateAreas(db);  // idempotente: otra pasada no reconstruye ni pierde nada
    assert.equal(db.prepare('select count(*) n from tasks').get()!.n, areas.length);
  } finally { db.close(); }
});
