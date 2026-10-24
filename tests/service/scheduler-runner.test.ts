import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { startRunner } from '../../service/src/runner.ts';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { until } from '../cli-helpers.ts';

test('runner programa preparada sin solapar y deja de escribir tras drained',async()=>{
  const db=openDb(':memory:');
  createTask(db,{title:'Programar',area:'qa',state:'preparada',spec:'Probar',acceptance:['Verde'],scope:['Docs']});
  let entered=0,release!:()=>void;
  const gate=new Promise<void>(r=>release=r);
  const stop=startRunner(db,{'worker.start':async()=>{entered++;await gate;}},
    {intervalMs:1,schedulerIntervalMs:5,context:{dataDir:import.meta.dirname}});
  try {
    await until(async()=>entered===1);assert.equal(entered,1);
    stop();release();await stop.drained;
    const before=db.prepare('select count(*) n from events').get()!.n;
    await delay(20);assert.equal(db.prepare('select count(*) n from events').get()!.n,before);
    assert.equal(db.prepare("select count(*) n from commands where type='worker.start'").get()!.n,1);
  } finally {release();stop();await stop.drained;db.close();}
});

test('config inválida se recupera en próximo tick y runners genéricos no programan workers',async()=>{
  const db=openDb(':memory:'),dir=mkdtempSync(join(tmpdir(),'nomos-schedule-'));
  createTask(db,{title:'Programar',area:'qa',state:'preparada'});
  writeFileSync(join(dir,'config.json'),'{');let count=0;
  let stop=startRunner(db,{'worker.start':async()=>{count++;}},{intervalMs:1,schedulerIntervalMs:5,context:{dataDir:dir}});
  try {
    await until(async()=>Number(db.prepare("select count(*) n from events where type='scheduler.error'").get()!.n)>0);
    assert.equal(count,0);
    writeFileSync(join(dir,'config.json'),'{"concurrency":{"codex":1}}');
    await until(async()=>count===1);assert.equal(count,1);stop();await stop.drained;
    db.prepare('delete from commands').run();
    stop=startRunner(db,{}, {intervalMs:1,schedulerIntervalMs:5,context:{dataDir:dir}});
    await delay(30);assert.equal(db.prepare('select count(*) n from commands').get()!.n,0);
  } finally {stop();await stop.drained;db.close();rmSync(dir,{recursive:true,force:true});}
});
