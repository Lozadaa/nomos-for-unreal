import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRun } from '../../service/src/repo/runs.ts';
import { enqueue, claim, fail } from '../../service/src/commands.ts';
import { seed } from '../../service/src/seed.ts';
import { createMessage, listEvents } from '../../service/src/store.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { read } from '../../service/src/repo/rows.ts';
import { removeDir } from '../remove-dir.ts';

test('filas nuevas conservan scope y metadata con defaults compatibles', () => {
  const db = openDb(':memory:');
  try {
    const task = createTask(db, {title:'Encargo',area:'qa'});
    assert.deepEqual(task.scope, []);
    assert.deepEqual(createTask(db, {title:'Otro',area:'qa',scope:['Docs']}).scope, ['Docs']);
    assert.deepEqual(startRun(db, {taskId:task.id,role:'programmer',provider:'codex'}).metadata, {});
  } finally { db.close(); }
});

test('migra DB anterior dos veces preservando semilla, mensajes, eventos, comandos y budget.scope escalar',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nomos-migrate-')),file=join(dir,'old.db');
  let db=openDb(file);
  try {
    seed(db);createMessage(db,'Conservar','web');enqueue(db,'legacy',{},'legacy');
    const events=listEvents(db,0),before=db.prepare('select * from budgets order by id').all();
    db.exec('alter table tasks drop column scope; alter table runs drop column metadata; alter table commands drop column not_before');
    db.close();db=openDb(file);db.close();db=openDb(file);
    assert.equal(db.prepare('select count(*) n from tasks').get()!.n,12);
    assert.equal(db.prepare('select count(*) n from commands').get()!.n,1);
    assert.equal(db.prepare('select text from messages').get()!.text,'Conservar');
    assert.deepEqual(listEvents(db,0),events);assert.deepEqual(db.prepare('select * from budgets order by id').all(),before);
    assert.deepEqual((read<any>(db,'tasks','seed-task-01')!).scope,[]);
    assert.deepEqual((read<any>(db,'runs','seed-run-01')!).metadata,{});
    assert.equal(db.prepare('select not_before from commands').get()!.not_before,null);
    assert.equal(read<any>(db,'budgets',before[0].id as string)!.scope,before[0].scope);
  } finally {db.close();removeDir(dir);}
});

test('claim omite comandos futuros y fallo terminal no repite efectos', () => {
  const db = openDb(':memory:');
  try {
    const later = enqueue(db, 'worker.poll', {}, 'later', {notBefore:'2999-01-01T00:00:00.000Z'});
    const now = enqueue(db, 'worker.start', {}, 'now');
    assert.equal(claim(db, 'runner')!.id, now.id);
    fail(db, now.id, 'incierto', {retry:false});
    assert.equal(db.prepare('select state from commands where id=?').get(now.id)!.state, 'failed');
    assert.equal(claim(db, 'runner'), undefined);
    assert.equal(later.notBefore, '2999-01-01T00:00:00.000Z');
  } finally { db.close(); }
});
