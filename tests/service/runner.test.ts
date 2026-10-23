import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { openDb } from '../../service/src/db.ts';
import { enqueue } from '../../service/src/commands.ts';
import { startRunner } from '../../service/src/runner.ts';
import { listEvents } from '../../service/src/store.ts';
import { resolve, dirname } from 'node:path';

export async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await delay(10);
  assert.ok(check(), 'No se observó el resultado antes de 2 s');
}
test('runner serializa entregas y stop.drained espera escritura del handler', async () => {
  const db = openDb(':memory:');
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release=resolve;});
  let entered = 0;
  enqueue(db,'one',{},'one'); enqueue(db,'two',{},'two');
  const stop = startRunner(db, {one:async () => {entered++; await gate;
    db.prepare("update director set session='terminado' where id=1").run();},
    two:async () => {entered++;}}, {intervalMs:1,context:{dataDir:import.meta.dirname}});
  try {
    await until(() => entered === 1);
    await delay(20); assert.equal(entered,1);
    stop(); let drained = false; stop.drained.then(() => {drained=true;});
    await delay(10); assert.equal(drained,false);
    release(); await stop.drained;
    assert.equal(db.prepare('select session from director').get()!.session,'terminado');
    assert.deepEqual(db.prepare('select state from commands order by rowid').all().map(r=>r.state),['done','pending']);
  } finally {release(); stop(); await stop.drained; db.close();}
});
test('runner termina tipos desconocidos una sola vez y sigue procesando', async () => {
  const db = openDb(':memory:'); enqueue(db,'unknown',{},'bad'); enqueue(db,'ok',{},'ok');
  const stop = startRunner(db,{ok:async () => ({value:42})},{intervalMs:1,context:{dataDir:import.meta.dirname}});
  try {
    await until(() => listEvents(db,0).some(e=>e.type==='command.done'));
    assert.deepEqual(db.prepare('select state,attempts from commands order by rowid').all().map(r=>[r.state,r.attempts]),[['failed',1],['done',1]]);
  } finally {stop();await stop.drained;db.close();}
});

test('contexto resuelve dataDir explícito y deriva proyecto desde DB, no desde cwd del servicio',async()=>{
  const db=openDb(':memory:');enqueue(db,'context',{},'context');let captured:any;
  const stop=startRunner(db,{context:async(cmd,ctx)=>{captured=ctx;}},{context:{dataDir:'relative-data/.kratos'},intervalMs:1});
  try {await until(()=>!!captured);assert.equal(captured.dataDir,resolve('relative-data/.kratos'));
    assert.equal(captured.projectDir,dirname(resolve('relative-data/.kratos')));}
  finally {stop();await stop.drained;db.close();}
});

test('handlers genéricos conservan tres intentos predeterminados para fallos recuperables',async()=>{
  const db=openDb(':memory:');enqueue(db,'transient',{},'transient');let count=0;
  const stop=startRunner(db,{transient:async()=>{if(++count<3) throw new Error('transient');}},
    {intervalMs:1,context:{dataDir:import.meta.dirname}});
  try {await until(()=>db.prepare('select state from commands').get()!.state!=='pending'&&count>=3);
    assert.equal(db.prepare('select state from commands').get()!.state,'done');assert.equal(count,3);}
  finally {stop();await stop.drained;db.close();}
});
