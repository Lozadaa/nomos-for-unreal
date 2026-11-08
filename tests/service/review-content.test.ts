import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { reviewFixture } from './review-fixture.ts';
import { createServer } from '../../service/src/server.ts';
import { complete } from '../../service/src/commands.ts';
import { read } from '../../service/src/repo/rows.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';
import type { Command } from '../../service/src/model.ts';

for(const change of ['diff','HEAD']) test(`nuevo contenido ${change} permite revisar tras cierre conservando clave HTTP`,async t=>{
  // con check: la tarea sigue en probando tras aprobar (sin él ya se integraría sola) y admite otra revisión
  const f=await reviewFixture(t,true),server=createServer(f.db,'secret','service/web',f.dataDir);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const request=async()=>{
    const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/tasks/${f.task.id}/review`,{
      method:'POST',headers:{Authorization:'Bearer secret'},body:'{}'});
    assert.equal(response.status,202);return (await response.json()).commandId as string;
  };
  const launch=async(commandId:string)=>{
    const state=f.state();state.treePath=join(f.dir,'review-'+crypto.randomUUID());state.terminalHandle='term_review';state.tail=[];
    writeFileSync(f.file,JSON.stringify(state));
    f.db.prepare("update commands set state='running' where id=?").run(commandId);
    const command=read<Command>(f.db,'commands',commandId)!;command.payload=JSON.parse(command.payload as unknown as string);
    const result=await f.handlers['review.start'](command,f.ctx);
    complete(f.db,commandId,result||undefined);
  };
  const commandId=await request();await launch(commandId);const first=f.reviewer();
  if(change==='diff') writeFileSync(join(f.implementerTree.path,'resultado.md'),'Contenido nuevo\n');
  f.output('NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  if(change==='HEAD') execFileSync('git',['-C',f.implementerTree.path,'commit','--allow-empty','-m','Nueva cabecera'],{windowsHide:true});
  assert.equal(await request(),commandId);
  assert.equal(read<Command>(f.db,'commands',commandId)!.state,'pending');
  assert.equal(requireTask(f.db,f.task.id).reviewApproved,0);
  await launch(commandId);assert.notEqual(f.reviewer().id,first.id);
  assert.notEqual(f.reviewer().metadata.review?.generation,first.metadata.review?.generation);
  f.output('NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  assert.equal(requireTask(f.db,f.task.id).reviewApproved,1);
  assert.equal(await request(),commandId);assert.equal(read<Command>(f.db,'commands',commandId)!.state,'done');
});
