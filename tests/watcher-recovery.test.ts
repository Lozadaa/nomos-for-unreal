import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, renameSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { appendEvent } from '../service/src/store.ts';
import { createServer } from '../service/src/server.ts';
import { until } from './cli-helpers.ts';
import { setup, start, defaultKey } from './watcher-fixture.ts';

test('archivo corrupto recupera desde cero con aviso sin usar ACK como entrega',async t=>{
  const {db,dataDir}=await setup(t);
  appendEvent(db,'run.finished',null,{runId:'r'});
  writeFileSync(join(dataDir,'watcher-cursors.json'),'null');
  const watcher=start(t,dataDir);await watcher.wait(1);
  assert.match(watcher.error(),/watcher_checkpoint_recovery/);
  // la línea sale antes de guardar el cursor: hasta entonces el archivo sigue siendo «null»
  await until(async()=>watcher.saved()?.cursors?.[defaultKey]>=1);
});

test('fallo al guardar checkpoint detiene entrega y explica disco sin service_down',async t=>{
  const {db,dataDir}=await setup(t);
  const first=appendEvent(db,'run.finished',null,{runId:'r1'});
  const watcher=start(t,dataDir);await watcher.wait(first.seq);
  await until(async()=>watcher.saved().cursors[defaultKey]>=first.seq);
  const path=join(dataDir,'watcher-cursors.json');renameSync(path,path+'.backup');mkdirSync(path);
  const second=appendEvent(db,'run.finished',null,{runId:'r2'});await watcher.wait(second.seq);
  await until(async()=>watcher.child.exitCode!==null);
  assert.equal(watcher.child.exitCode,1);assert.match(watcher.error(),/watcher_checkpoint_error.*sin guardar/);
  assert.equal(watcher.lines().some(line=>line.error==='service_down'),false);
  assert.ok(JSON.parse(readFileSync(path+'.backup','utf8')).cursors[defaultKey]>=first.seq);
});

test('checkpoint sobrevive token nuevo y rearme sin repetir eventos director',async t=>{
  const {db,dataDir,web}=await setup(t);
  const first=appendEvent(db,'run.finished',null,{runId:'r1'});
  const watcher=start(t,dataDir);await watcher.wait(first.seq);
  await until(async()=>watcher.saved().cursors[defaultKey]>=first.seq);await watcher.stop();
  const newToken='b'.repeat(48),newServer=createServer(db,newToken,web);
  newServer.listen(0,'127.0.0.1');await once(newServer,'listening');
  t.after(async()=>{newServer.closeAllConnections();await new Promise<void>(resolve=>newServer.close(()=>resolve()));});
  writeFileSync(join(dataDir,'service.json'),JSON.stringify({pid:process.pid,token:newToken,
    port:(newServer.address() as {port:number}).port,startedAt:new Date().toISOString()}));
  const next=appendEvent(db,'worker.waiting',null,{runId:'r1',question:'nueva'});
  const rearmed=start(t,dataDir);await rearmed.wait(next.seq);
  assert.deepEqual(rearmed.lines().map(e=>e.seq),[next.seq]);
  await rearmed.stop();
  assert.equal(readFileSync(join(dataDir,'watcher-cursors.json'),'utf8').includes(newToken),false);
});

test('frame SSE cortado antes de completar se recupera al reconectar',async t=>{
  const {db,server,dataDir}=await setup(t);
  const event=appendEvent(db,'run.finished',null,{runId:'r🎾'});let streams=0;
  server.prependListener('request',(req,res)=>{
    if(!req.url?.startsWith('/events?') || ++streams!==1) return;
    const write=res.write.bind(res);
    res.write=((chunk: string)=>{
      write(chunk.slice(0,chunk.length-2));setTimeout(()=>res.destroy(),50);return true;
    }) as typeof res.write;
  });
  const watcher=start(t,dataDir);await watcher.wait(event.seq);
  assert.ok(streams>=2);
  assert.deepEqual(watcher.lines().filter(e=>e.seq===event.seq).map(e=>e.payload),[{runId:'r🎾'}]);
});
