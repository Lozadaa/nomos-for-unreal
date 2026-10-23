import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskSpec } from '../../service/src/task-spec.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { listDecisions } from '../../service/src/repo/decisions.ts';
import { upsertEntry } from '../../service/src/repo/catalog.ts';
import { assetFixture } from './asset-fixture.ts';

test('licencia desconocida: Decisión «Licencia desconocida» y tarea pendiente con spec ue-asset-intake', async () => {
  const f = assetFixture();
  try {
    const racket = f.entry('Nude_Tennis_Racket_🎾');
    const result = await f.run('asset.prepare', {entryId: racket.id}, 'p1');
    const task = getTask(f.db, result.taskId)!;
    assert.equal(task.state, 'pendiente');
    assert.equal(task.area, 'assets');
    assert.equal(task.assigneeRole, 'arte');
    assert.equal(task.assigneeProvider, 'claude');
    assert.deepEqual(task.leases, ['Content/Fab/Nude_Tennis_Racket_🎾']);
    const spec = parseTaskSpec(task.spec);
    assert.equal(spec.acceptance.length, 5);
    assert.match(task.spec, /ue-asset-intake/);
    const [decision] = listDecisions(f.db, 'open');
    assert.equal(decision.reason, 'Licencia desconocida');
    assert.equal(decision.taskId, task.id);
    assert.equal((await f.run('asset.prepare', {entryId: racket.id}, 'p1')).taskId, task.id, 'un reintento no duplica la tarea');
  } finally { f.close(); }
});

test('con licencia la tarea queda preparada para el planificador; aiForbidden lo declara en la spec', async () => {
  const f = assetFixture();
  try {
    const phone = upsertEntry(f.db, {...f.entry('Phone'), license: 'Fab Standard License', aiForbidden: 1});
    const result = await f.run('asset.prepare', {entryId: phone.id});
    const task = getTask(f.db, result.taskId)!;
    assert.equal(task.state, 'preparada');
    assert.match(task.spec, /Prohibido para IA/);
    assert.match(task.spec, /Fab Standard License/);
    assert.equal(listDecisions(f.db, 'open').length, 0);
  } finally { f.close(); }
});
