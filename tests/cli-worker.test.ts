import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, cliFixture, api, until } from './cli-helpers.ts';
import { openDb } from '../service/src/db.ts';
import { startRun } from '../service/src/repo/runs.ts';
import { appendEvent } from '../service/src/store.ts';

const markdown='# Encargo\r\n## Qué\r\nCrear documento.\r\n## Por qué\r\nExplicar juego.\r\n## Criterios de aceptación\r\n1. Existe README.\r\n2. Explica controles.\r\n```md\r\n3. Falso\r\n```\r\n## Alcance\r\n- `Docs/README.md`\r\n- Scripts/\r\n## No tocar\r\n- Content/\r\n';

test('CLI worker.start transporta Claude y OpenCode reconocido, rechaza proveedor inválido',async t=>{
  const {dataDir,port}=await cliFixture(t);cli(dataDir,'start','--port',String(port),'--no-open');
  for(const provider of ['claude','opencode']) {
    const task=await api(dataDir,'/tasks',{title:'Cambio',area:'qa',spec:'Crear',acceptance:['Existe'],scope:['Docs']});
    await api(dataDir,'/tasks/'+task.id+'/spec',{spec:'Crear',acceptance:['Existe'],area:'qa',scope:['Docs']});
    const result=cli(dataDir,'worker','start',task.id,'--provider',provider);assert.equal(result.status,0,result.stderr);
    const command=(await api(dataDir,'/commands')).find((c:any)=>c.id===JSON.parse(result.stdout).commandId);
    assert.equal(command.payload.provider,provider);
    assert.equal(cli(dataDir,'worker','start',task.id,'--provider','otro').status,1);
  }
});

test('CLI spec-file valida antes de crear, prepara y conserva Markdown con contrato español',async t=>{
  const {dataDir,port}=await cliFixture(t);
  assert.equal(cli(dataDir,'start','--port',String(port),'--no-open').status,0);
  const file=join(dataDir,'spec.md');
  for(const bad of [markdown.replace('## Qué','## Que'),markdown+'\n## Alcance\n- Docs/',markdown.replace('1. Existe README.','Existe README.').replace('2. Explica controles.','Otro'),markdown.replace('`Docs/README.md`','../evil')]) {
    writeFileSync(file,bad);
    assert.equal(cli(dataDir,'task','create','--title','Cambio','--area','qa','--spec-file',file).status,1);
    assert.deepEqual(await api(dataDir,'/tasks'),[]);
  }
  writeFileSync(file,'\uFEFF'+markdown);
  const created=cli(dataDir,'task','create','--title','Cambio','--area','qa','--spec-file',file);
  assert.equal(created.status,0,created.stderr);const task=JSON.parse(created.stdout);
  assert.equal(task.state,'preparada');assert.deepEqual(task.acceptance,['Existe README.','Explica controles.']);
  assert.deepEqual(task.scope,['Docs/README.md','Scripts']);assert.equal(task.spec,markdown.replaceAll('\r\n','\n'));
  const show=cli(dataDir,'task','show',task.id);assert.equal(show.status,0,show.stderr);
  assert.equal(JSON.parse(show.stdout).task.title,'Cambio');
  // el id corto del brief del director (TrompoArte: el director se quedó en unknown_task)
  const short=cli(dataDir,'task','show',task.id.slice(0,8));assert.equal(short.status,0,short.stderr);
  assert.equal(JSON.parse(short.stdout).task.id,task.id);
  const pending=cli(dataDir,'task','create','--title','Pendiente','--area','qa');assert.equal(pending.status,0,pending.stderr);
  const id=JSON.parse(pending.stdout).id;assert.equal(JSON.parse(pending.stdout).state,'pendiente');
  const prepared=cli(dataDir,'task','spec',id,'--spec-file',file);assert.equal(prepared.status,0,prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).state,'preparada');
  assert.equal(readFileSync(file,'utf8'),'\uFEFF'+markdown);
});

test('CLI workers/runs y decisiones transportan texto literal y exponen comandos para Task4',async t=>{
  const {dataDir,port}=await cliFixture(t);cli(dataDir,'start','--port',String(port),'--no-open');
  const task=await api(dataDir,'/tasks',{title:'Cambio',area:'qa',spec:'Crear',acceptance:['Existe'],scope:['Docs']});
  await api(dataDir,'/tasks/'+task.id+'/spec',{spec:'Crear',acceptance:['Existe'],area:'qa',scope:['Docs']});
  const started=cli(dataDir,'worker','start',task.id,'--skills','tdd,qa','--attempt','3');assert.equal(started.status,0,started.stderr);
  const command=(await api(dataDir,'/commands')).find((c:any)=>c.id===JSON.parse(started.stdout).commandId);
  assert.equal(command.idempotencyKey,'worker.start:'+task.id+':3');
  assert.deepEqual(command.payload,{taskId:task.id,provider:'claude',role:'implementacion',skills:['tdd','qa'],attempt:3});
  // hito 21: sin --attempt, el intento vivo (3) o, si el servicio ya lo dio por fallido, el siguiente; nunca un «1» por defecto
  const again=cli(dataDir,'worker','start',task.id,'--skills','tdd,qa');assert.equal(again.status,0,again.stderr);
  const repeated=(await api(dataDir,'/commands')).find((c:any)=>c.id===JSON.parse(again.stdout).commandId);
  assert.ok(repeated.payload.attempt>=3,JSON.stringify(repeated.payload));
  const db=openDb(join(dataDir,'nomos.db'));const run=startRun(db,{taskId:task.id,provider:'codex',role:'implementacion'});
  const event=appendEvent(db,'worker.output',null,{taskId:task.id,runId:run.id,lines:['hola']});db.close();
  const text='Corrige "texto"\n$(literal) 🎾',file=join(dataDir,'send.md');writeFileSync(file,text);
  const send=cli(dataDir,'worker','send',run.id,'--file',file,'--idempotency-key','correction-1');assert.equal(send.status,0,send.stderr);
  const sent=(await api(dataDir,'/commands')).find((c:any)=>c.id===JSON.parse(send.stdout).commandId);assert.equal(sent.payload.text,text);
  assert.equal(cli(dataDir,'worker','send',run.id,'--file',file,'--text','both').status,1);
  assert.equal(cli(dataDir,'worker','start',task.id,'--since','0').status,1);
  const output=cli(dataDir,'run','output',run.id,'--since','0');assert.equal(output.status,0,output.stderr);
  assert.equal(JSON.parse(output.stdout)[0].seq,event.seq);
  const diff=cli(dataDir,'run','diff',run.id);assert.equal(diff.status,2);assert.match(diff.stderr,/unknown_worktree/);
  const stopped=cli(dataDir,'worker','stop',run.id);assert.equal(stopped.status,0);
  const stopId=JSON.parse(stopped.stdout).commandId;
  await until(async()=>(await api(dataDir,'/commands')).find((c:any)=>c.id===stopId)?.state==='done');
  const decisionFile=join(dataDir,'decision.json');writeFileSync(decisionFile,JSON.stringify({reason:'¿Color?',evidence:[],options:[{id:'answer',label:'Responder en el chat',description:'Texto libre'}]}));
  const opened=cli(dataDir,'decision','open',task.id,'--file',decisionFile);assert.equal(opened.status,0,opened.stderr);
  const decision=JSON.parse(opened.stdout);assert.equal(JSON.parse(cli(dataDir,'decision','list','--state','open').stdout)[0].id,decision.id);
  const resolved=cli(dataDir,'decision','resolve',decision.id,'--option','answer','--by','nomos');assert.equal(resolved.status,0,resolved.stderr);
  assert.equal(JSON.parse(resolved.stdout).state,'resolved');
});

test('CLI task create declara reservas, dependencias y asignación antes de preparar',async t=>{
  const {dataDir,port}=await cliFixture(t);cli(dataDir,'start','--port',String(port),'--no-open');
  const file=join(dataDir,'spec.md');writeFileSync(file,markdown);
  const first=JSON.parse(cli(dataDir,'task','create','--title','HUD','--area','ui').stdout);
  const created=cli(dataDir,'task','create','--title','Vida','--area','ui','--spec-file',file,
    '--leases','Content/UI/WBP_HUD.uasset, Content/UI/T_Icon.uasset','--depends',first.id,'--role','ui','--provider','claude');
  assert.equal(created.status,0,created.stderr);const task=JSON.parse(created.stdout);
  assert.equal(task.state,'preparada');assert.deepEqual(task.leases,['Content/UI/WBP_HUD.uasset','Content/UI/T_Icon.uasset']);
  assert.deepEqual(task.dependsOn,[first.id]);assert.equal(task.assigneeRole,'ui');assert.equal(task.assigneeProvider,'claude');
  const types=(await api(dataDir,'/tasks/'+task.id)).events.map((e:any)=>e.type);
  assert.deepEqual(types.slice(0,3),['task.created','task.dependencies.changed','task.moved']);
  assert.notEqual(cli(dataDir,'task','create','--title','X','--area','ui','--depends','no-existe').status,0);
  assert.notEqual(cli(dataDir,'task','create','--title','X','--area','ui','--provider','otro').status,0);
  assert.equal((await api(dataDir,'/tasks')).length,2,'Sin tareas huérfanas');
});
