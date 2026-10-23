import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMessage, appendEvent } from '../service/src/store.ts';
import { createServer } from '../service/src/server.ts';
import { setup,start } from './watcher-fixture.ts';
import { until } from './cli-helpers.ts';

test('reconexión y rotación usan transporte avanzado sin repetir frames completos',async t=>{
  const {db,server,dataDir,web}=await setup(t);
  const message=createMessage(db,'Sin ACK','web');
  const done=appendEvent(db,'run.finished',null,{runId:'first'});
  const requests:number[]=[];
  server.prependListener('request',req=>{
    if(req.url?.startsWith('/events?')) requests.push(Number(new URL(req.url,'http://localhost').searchParams.get('since')));
  });
  const watcher=start(t,dataDir);await watcher.wait(done.seq);
  await until(async()=>requests.length>=2);
  assert.equal(requests[0],0);assert.ok(requests[1]>=done.seq);
  assert.equal(watcher.lines().filter(e=>e.seq===message.seq).length,1);
  const newToken='c'.repeat(48),next=createServer(db,newToken,web);
  const rotated:number[]=[];
  next.prependListener('request',req=>{
    if(req.url?.startsWith('/events?')) rotated.push(Number(new URL(req.url,'http://localhost').searchParams.get('since')));
  });
  next.listen(0,'127.0.0.1');await once(next,'listening');
  t.after(async()=>{next.closeAllConnections();await new Promise<void>(resolve=>next.close(()=>resolve()));});
  writeFileSync(join(dataDir,'service.json'),JSON.stringify({pid:process.pid,token:newToken,
    port:(next.address() as {port:number}).port,startedAt:new Date().toISOString()}));
  await until(async()=>rotated.length>0);
  const fresh=createMessage(db,'Tras rotación','web');await watcher.wait(fresh.seq);
  assert.ok(rotated[0]>=done.seq);
  assert.equal(watcher.lines().filter(e=>e.seq===message.seq).length,1);
  assert.equal(watcher.lines().filter(e=>e.seq===done.seq).length,1);
  await watcher.stop();
});
