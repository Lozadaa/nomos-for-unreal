import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createServer } from '../../service/src/server.ts';

test('capabilities legacy y details=1 autenticado: skills del juego real y concurrencia del scheduler',async t=>{
  const root=mkdtempSync(join(tmpdir(),'kratos-capabilities-')),dataDir=join(root,'.kratos');mkdirSync(dataDir);
  const db=openDb(join(dataDir,'kratos.db')),server=createServer(db,'token','service/web',dataDir);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const get=(path:string,auth=true)=>fetch(base+path,{headers:auth?{Authorization:'Bearer token'}:{}});
  const folder=join(root,'.agents','skills','solo-juego');mkdirSync(folder,{recursive:true});
  const path=join(folder,'SKILL.md');writeFileSync(path,'Skill local\n');
  const wrong=join(dataDir,'.claude','skills','no-es-workspace');mkdirSync(wrong,{recursive:true});writeFileSync(join(wrong,'SKILL.md'),'No\n');
  assert.equal((await get('/capabilities?details=1',false)).status,401);
  const legacy=await (await get('/capabilities')).json();assert.ok(Array.isArray(legacy));
  const details=await (await get('/capabilities?details=1')).json();
  assert.deepEqual(details.capabilities,legacy);
  assert.deepEqual(details.skills,[{name:'solo-juego',path,source:'agents'}]);
  assert.deepEqual(details.concurrency,{codex:2,claude:1,opencode:0});
  writeFileSync(join(dataDir,'config.json'),'{"concurrency":{"claude":3,"opencode":8}}');
  assert.deepEqual((await (await get('/capabilities?details=1')).json()).concurrency,{codex:0,claude:3,opencode:8});
  writeFileSync(join(dataDir,'config.json'),'{"concurrency":{"codex":-1}}');
  assert.equal((await get('/capabilities?details=1')).status,400);
});
