import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { tick } from '../../service/src/scheduler.ts';
import { listEvents } from '../../service/src/store.ts';
import { fixture, requestJson } from '../helpers.ts';

test('director en pausa: no encola arranques, la tarea dice por qué y el evento sale una vez por pausa', t => {
  const db = openDb(':memory:'); t.after(() => db.close());
  const task = createTask(db, {title: 'A', area: 'qa', state: 'preparada', spec: 'Probar', acceptance: ['Verde'], scope: ['Docs']});
  const pause = (on: boolean) => db.prepare('update director set paused=? where id=1').run(on ? 1 : 0);
  db.exec("insert into events(id,type,payload,created_at) values('p1','director.paused','{}','2026-10-23')"); pause(true);
  tick(db, {}, {} as any); tick(db, {}, {} as any);
  assert.equal(db.prepare("select count(*) n from commands where type='worker.start'").get()!.n, 0);
  assert.equal(requireTask(db, task.id).waitReason, 'Director en pausa');
  assert.equal(listEvents(db, 0).filter(e => e.type === 'scheduler.paused').length, 1);
  pause(false); tick(db, {}, {} as any);
  assert.equal(db.prepare("select count(*) n from commands where type='worker.start'").get()!.n, 1);
  assert.equal(requireTask(db, task.id).waitReason, null);
});

test('POST /director/pause y /resume cambian el estado que ve el panel', async t => {
  const {server} = await fixture(t);
  assert.equal((await (await requestJson(server, 'POST', '/director/pause')).json()).paused, true);
  assert.equal((await (await requestJson(server, 'POST', '/director/resume')).json()).paused, false);
});
