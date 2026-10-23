import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { openDb } from '../../service/src/db.ts';
import { enqueue } from '../../service/src/commands.ts';
import { start } from '../../service/src/server.ts';

test('servicio arranca runner una vez y admin stop drena antes de cerrar SQLite y borrar service.json',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kratos-lifecycle-')),file=join(dir,'kratos.db');
  const initial=openDb(file);enqueue(initial,'hold',{},'hold');initial.close();
  let entered=false,release!:()=>void, finished=false;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const info=await start({dataDir:dir,port:0,runner:{intervalMs:1,handlers:{hold:async(cmd,ctx)=>{
    entered=true;await gate;ctx.db.prepare("update director set session='drained' where id=1").run();finished=true;
  }}}});
  const base=`http://127.0.0.1:${info.port}`;
  const controller=new AbortController();
  try {
    for(let i=0;i<100&&!entered;i++) await delay(10);
    assert.equal(entered,true);
    assert.equal((await start({dataDir:dir,port:0})).port,info.port);
    const response=await fetch(base+'/admin/stop',{method:'POST',headers:{Authorization:`Bearer ${info.token}`}});
    assert.equal(response.status,202);await delay(30);
    assert.equal(finished,false);assert.equal(existsSync(join(dir,'service.json')),true);
    const during=await start({dataDir:dir,port:0});assert.equal(during.port,info.port);assert.equal(during.token,info.token);
    const repeated=await fetch(base+'/admin/stop',{method:'POST',headers:{Authorization:`Bearer ${info.token}`}});
    assert.equal(repeated.status,202);
    const events=await fetch(base+'/events',{signal:controller.signal,headers:{Authorization:`Bearer ${info.token}`}});
    assert.equal(events.status,503);assert.equal(events.headers.get('connection'),'close');
    assert.deepEqual(await events.json(),{error:'service_stopping'});
    assert.equal((await fetch(base+'/health')).status,200);
    release();
    for(let i=0;i<100&&existsSync(join(dir,'service.json'));i++) await delay(10);
    assert.equal(existsSync(join(dir,'service.json')),false);
    await assert.rejects(fetch(base+'/health'));
    const db=openDb(file);try {assert.equal(db.prepare('select session from director').get()!.session,'drained');
      assert.equal(db.prepare('select state from commands').get()!.state,'done');} finally {db.close();}
  } finally {
    controller.abort();
    release();await fetch(base+'/admin/stop',{method:'POST',headers:{Authorization:`Bearer ${info.token}`}}).catch(()=>{});
    await delay(50);rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
