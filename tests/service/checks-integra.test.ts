import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTask } from '../../service/src/repo/tasks.ts';
import { requestApproval } from '../../service/src/approvals.ts';
import { checksFixture } from './checks-fixture.ts';

const integrations = (f: {db: any; task: {id: string}}) => (f.db.prepare(
  `select * from commands where type='integrate.run' and state='pending' and json_extract(payload,'$.taskId')=?`).all(f.task.id) as unknown[]).length;

test('jam: pruebas en verde y sin «Por aprobar» → integrate.run encolada sin esperar al barrido', async () => {
  const f = checksFixture({files: ['Source/Juego/Hud.cpp']});
  try {
    f.db.prepare('update tasks set review_approved=1 where id=?').run(f.task.id);
    const result = await f.run({taskId: f.task.id, files: []});
    assert.equal(result.advanced, true);
    assert.equal(getTask(f.db, f.task.id)!.state, 'integrando');
    assert.equal(integrations(f), 1);
  } finally { f.close(); }
});

test('jam: con una aprobación del usuario pendiente pasa a integrando y no encola nada', async () => {
  const f = checksFixture({files: ['Source/Juego/Hud.cpp']});
  try {
    f.db.prepare('update tasks set review_approved=1 where id=?').run(f.task.id);
    requestApproval(f.db, getTask(f.db, f.task.id)!);
    f.db.prepare('update tasks set decision_id=null, blocked_reason=null where id=?').run(f.task.id);
    const result = await f.run({taskId: f.task.id, files: []});
    assert.equal(result.advanced, true);
    assert.equal(getTask(f.db, f.task.id)!.state, 'integrando');
    assert.equal(integrations(f), 0);
  } finally { f.close(); }
});
