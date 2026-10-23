import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './worker-fixture.ts';
import { openDecision, resolveDecision } from '../../service/src/repo/decisions.ts';
import { getTask, blockTask } from '../../service/src/repo/tasks.ts';
import { listEvents } from '../../service/src/store.ts';
import { read } from '../../service/src/repo/rows.ts';
import type { Decision } from '../../service/src/model.ts';
import { OrcaError } from '../../service/src/adapters/orca.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function question(f: ReturnType<typeof fixture>) {
  return openDecision(f.db,{taskId:f.task.id,reason:'Confirmar color del menú',
    evidence:[{kind:'review',ref:'color'}],options:[{id:'approve',label:'Azul',description:'Usar azul'},
      {id:'cancel',label:'Cancelar',description:'Esperar'}]});
}
function resolveCurrent(f: ReturnType<typeof fixture>, original: Decision) {
  const task=getTask(f.db,f.task.id)!;assert.ok(task.decisionId,'Decisión debe seguir vinculada');
  assert.equal(task.blockedReason,original.reason);
  const current=read<Decision>(f.db,'decisions',task.decisionId!)!;
  assert.deepEqual(current.options,original.options);assert.deepEqual(current.evidence,original.evidence);
  assert.equal(current.chosenOptionId,null);assert.equal(current.state,'open');
  assert.equal(resolveDecision(f.db,current.id,'approve','director').state,'resolved');
  assert.equal(getTask(f.db,f.task.id)!.blockedReason,null);
}

for(const checkpoint of ['wait','read'] as const) test(`Decisión durante ${checkpoint} impide enviar brief y sigue resoluble`,async t=>{
  const f=fixture(t);let decision!:Decision;
  if(checkpoint==='wait') {
    const wait=f.ctx.orca.terminalWaitIdle;
    f.ctx.orca.terminalWaitIdle=async(...args)=>{const ready=await wait(...args);decision=question(f);return ready;};
  } else {
    const read=f.ctx.orca.terminalRead;
    f.ctx.orca.terminalRead=async(...args)=>{const page=await read(...args);decision=question(f);return page;};
  }
  await f.start();
  assert.equal(f.state().tail.some((line:string)=>line.startsWith('Lee el archivo .kratos-brief')),false);
  assert.equal(getTask(f.db,f.task.id)!.state,'pendiente');resolveCurrent(f,decision);
});

test('bloqueo sin Decisión aparecido durante preparación tampoco se borra ni permite despacho',async t=>{
  const f=fixture(t),wait=f.ctx.orca.terminalWaitIdle;
  f.ctx.orca.terminalWaitIdle=async(...args)=>{const ready=await wait(...args);blockTask(f.db,f.task.id,'Revisar bloqueo externo');return ready;};
  await f.start();assert.equal(f.state().tail.some((line:string)=>line.startsWith('Lee el archivo .kratos-brief')),false);
  assert.equal(getTask(f.db,f.task.id)!.blockedReason,'Revisar bloqueo externo');
});

test('Decisión entre guardia async y send impide crear inbox y enviar corrección',async t=>{
  const f=fixture(t);await f.start();
  f.output('KRATOS_DONE {"summary":"Listo","commits":[],"tests":"passed"}');
  await f.invoke('worker.poll',{runId:f.run().id,generation:0});const before=f.state().tail.length;
  let decision!:Decision;queueMicrotask(()=>{decision=question(f);});
  await f.invoke('worker.send',{runId:f.run().id,text:'Corregir'});
  assert.equal(f.state().tail.length,before);assert.equal(f.run().metadata.correctionCount,0);resolveCurrent(f,decision);
});

for(const delivery of ['brief','inbox'] as const) test(`Decisión durante entrega ${delivery} aceptada conserva verdad y se regenera resoluble`,async t=>{
  const f=fixture(t);if(delivery==='inbox') await f.start();
  const send=f.ctx.orca.terminalSend;let decision!:Decision;
  f.ctx.orca.terminalSend=async(handle,text)=>{await send(handle,text);
    if(text.startsWith(`Lee el archivo .kratos-${delivery}`)) decision=question(f);};
  if(delivery==='brief') await f.start();else await f.invoke('worker.send',{runId:f.run().id,text:'Nueva instrucción'});
  const linked=getTask(f.db,f.task.id)!.decisionId;assert.ok(linked);
  assert.notEqual(linked,decision.id);assert.equal(read<Decision>(f.db,'decisions',decision.id)!.state,'stale');
  assert.equal(f.state().tail.filter((line:string)=>line.startsWith(`Lee el archivo .kratos-${delivery}`)).length,1);
  if(delivery==='inbox') assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.message_sent').length,1);
  for(let i=0;i<3;i++) await f.invoke('worker.poll',{runId:f.run().id,generation:f.run().metadata.pollGeneration});
  assert.equal(getTask(f.db,f.task.id)!.decisionId,linked,'poll bloqueado debe mantener ID estable');resolveCurrent(f,decision);
});

test('Decisión durante read registra salida recibida una vez y detiene lecturas siguientes hasta resolver',async t=>{
  const f=fixture(t);await f.start();f.output('Resultado ya recibido');
  const terminalRead=f.ctx.orca.terminalRead;let reads=0,decision!:Decision;
  f.ctx.orca.terminalRead=async(...args)=>{reads++;const page=await terminalRead(...args);decision=question(f);return page;};
  await f.invoke('worker.poll',{runId:f.run().id,generation:0});const id=getTask(f.db,f.task.id)!.decisionId;
  for(let i=0;i<3;i++) await f.invoke('worker.poll',{runId:f.run().id,generation:0});
  assert.equal(reads,1);assert.equal(getTask(f.db,f.task.id)!.decisionId,id);
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.output').flatMap(e=>e.payload.lines).filter(l=>l==='Resultado ya recibido').length,1);
  resolveCurrent(f,decision);
});

test('fallo incierto durante send conserva pregunta vinculada resoluble y bloqueo Orca independiente',async t=>{
  const f=fixture(t);await f.start();const send=f.ctx.orca.terminalSend;let original!:Decision;
  f.ctx.orca.terminalSend=async(handle,text)=>{await send(handle,text);original=question(f);throw new OrcaError('timeout','Resultado incierto');};
  await assert.rejects(f.invoke('worker.send',{runId:f.run().id,text:'Una instrucción'}),/incierto/);
  const task=getTask(f.db,f.task.id)!;assert.ok(task.decisionId,'fallo no debe dejar pregunta huérfana');
  const current=read<Decision>(f.db,'decisions',task.decisionId!)!;
  assert.equal(current.reason,original.reason);assert.deepEqual(current.options,original.options);
  assert.equal(resolveDecision(f.db,current.id,'approve','director').state,'resolved');
  assert.match(getTask(f.db,f.task.id)!.blockedReason!,/^orca:/);assert.equal(f.run().state,'failed');
});

test('preparación pausada se continúa explícitamente por inbox en la misma sesión tras resolver',async t=>{
  const f=fixture(t),wait=f.ctx.orca.terminalWaitIdle;let decision!:Decision;
  f.ctx.orca.terminalWaitIdle=async(...args)=>{const ready=await wait(...args);decision=question(f);return ready;};
  await f.start();const initial=f.run(),tree=f.tree().id;
  assert.equal(initial.metadata.phase,'preparing');assert.equal(initial.metadata.waiting,true);
  await f.invoke('worker.poll',{runId:initial.id,generation:0});assert.equal(f.run().metadata.phase,'preparing');
  resolveCurrent(f,decision);
  const instruction='Lee el archivo .kratos-brief.md de esta carpeta y ejecuta lo que dice.';
  await f.invoke('worker.send',{runId:initial.id,text:instruction});
  assert.equal(f.run().id,initial.id);assert.equal(f.run().sessionRef,initial.sessionRef);assert.equal(f.tree().id,tree);
  assert.equal(f.run().metadata.phase,'running');assert.equal(f.run().metadata.correctionCount,0);
  const sent=listEvents(f.db,0).filter(e=>e.type==='worker.message_sent');assert.equal(sent.length,1);
  assert.equal(readFileSync(join(f.tree().path,sent[0].payload.path as string),'utf8'),instruction);
  assert.equal(f.state().creates,1);assert.equal(listEvents(f.db,0).filter(e=>e.type==='run.started').length,1);
});
