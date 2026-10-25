import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { reviewFixture } from './review-fixture.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { listEvents } from '../../service/src/store.ts';

// Hito 22: el renombrado salió sin J1.5 ni J2.1 porque su worktree nació de una base vieja.
test('el worktree de un worker nuevo nace de la punta de main aunque Orca lo cree desde una base vieja', async t => {
  const f = fixture(t);
  const old = f.git('rev-parse', 'HEAD').trim();
  writeFileSync(join(f.projectDir, 'j15.txt'), 'J1.5\n'); f.git('add', 'j15.txt'); f.git('commit', '-m', 'J1.5 integrada');
  const tip = f.git('rev-parse', 'HEAD').trim();
  writeFileSync(f.file, JSON.stringify({...f.state(), createBase: old}));
  await f.start();
  const tree = f.tree();
  assert.equal(tree.baseCommit, tip);
  assert.equal(f.git('-C', tree.path, 'rev-parse', 'HEAD').trim(), tip);
  const rebased = listEvents(f.db, 0).filter(e => e.type === 'worktree.rebased').map(e => e.payload);
  assert.deepEqual(rebased, [{taskId: f.task.id, from: old, to: tip}]);
});

test('con la rama detrás de main no arranca la revisión: se pide la fusión al worker', async t => {
  const f = await reviewFixture(t);
  writeFileSync(join(f.projectDir, 'j21.txt'), 'J2.1\n'); f.git('add', 'j21.txt'); f.git('commit', '-m', 'J2.1 integrada');
  const result = await f.startReview() as any;
  assert.equal(result.needsMain, true);
  assert.equal(f.reviewer(), undefined, 'ningún revisor');
  const send = f.db.prepare("select payload from commands where type='worker.send'").all().map(r => JSON.parse(r.payload as string));
  assert.equal(send.length, 1); assert.equal(send[0].runId, f.implementer.id);
  assert.match(send[0].text, /git merge/);
  assert.equal(getTask(f.db, f.task.id)!.state, 'implementando');
  assert.equal(listEvents(f.db, 0).filter(e => e.type === 'review.needs_main').length, 1);
});
