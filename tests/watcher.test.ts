import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendEvent, createMessage, ackEvent } from '../service/src/store.ts';
import { requestJson } from './helpers.ts';
import { until } from './cli-helpers.ts';
import { setup, start, checkpoint, defaultKey, legacyDefaultKey } from './watcher-fixture.ts';

test('defaults entregan cuatro tipos conservando payload y ACK solo de mensajes',async t=>{
  const {db,server,dataDir}=await setup(t);
  const message=createMessage(db,'hola 🎾','web');
  const done=appendEvent(db,'run.finished',null,{runId:'run1'});
  const waiting=appendEvent(db,'worker.waiting',null,{question:'¿color?'});
  const failed=appendEvent(db,'command.failed',null,{commandId:'cmd1',error:'orca'});
  appendEvent(db,'worker.output',null,{lines:['no seleccionado']});
  const watcher=start(t,dataDir);await watcher.wait(failed.seq);
  assert.deepEqual(watcher.lines().map(e=>e.type),['message.received','run.finished','worker.waiting','command.failed']);
  assert.deepEqual(watcher.lines()[0],{seq:message.seq,type:'message.received',messageId:message.messageId,text:'hola 🎾',origin:'web'});
  assert.deepEqual(watcher.lines()[1].payload,{runId:'run1'});
  assert.ok(watcher.lines()[1].createdAt);
  assert.equal((await requestJson(server,'POST',`/events/${done.seq}/ack`,{session:'director'})).status,404);
  assert.equal((await requestJson(server,'POST',`/events/${waiting.seq}/ack`,{session:'director'})).status,404);
  assert.equal(db.prepare('select last_ack_seq as seq from director').get()!.seq,0);
});

test('rearmar entrega run seq10 pendiente aunque mensaje seq11 esté confirmado',async t=>{
  const {db,dataDir}=await setup(t);
  for(let i=0;i<9;i++) appendEvent(db,'worker.output',null,{});
  appendEvent(db,'run.finished',null,{runId:'run1'});
  const message=createMessage(db,'ya confirmado','web');assert.equal(message.seq,11);
  ackEvent(db,11,'director');checkpoint(dataDir,9);
  const watcher=start(t,dataDir);await watcher.wait(10);
  assert.deepEqual(watcher.lines().map(e=>e.seq),[10]);
});

test('rearmar reentrega mensaje sin ACK y no repite director ya entregado',async t=>{
  const {db,dataDir}=await setup(t);
  for(let i=0;i<9;i++) appendEvent(db,'worker.output',null,{});
  appendEvent(db,'run.finished',null,{runId:'run1'});
  createMessage(db,'pendiente','web');
  const first=start(t,dataDir);await first.wait(11);
  await until(async()=>first.saved().cursors[defaultKey]>=11);await first.stop();
  const second=start(t,dataDir);await second.wait(11);
  assert.deepEqual(second.lines().map(e=>e.seq),[11]);
  assert.equal(readFileSync(join(dataDir,'watcher-cursors.json'),'utf8').includes('aaaaaaaa'),false);
});

test('types reemplaza defaults y normaliza orden, espacios y duplicados por suscripción',async t=>{
  const {db,dataDir}=await setup(t);
  appendEvent(db,'run.finished',null,{runId:'r'});
  appendEvent(db,'worker.waiting',null,{question:'q'});
  appendEvent(db,'command.failed',null,{commandId:'c'});
  const first=start(t,dataDir,'--types',' worker.waiting,run.finished,run.finished ');
  await first.wait(2);await until(async()=>Object.values(first.saved().cursors).some(v=>Number(v)>=3));await first.stop();
  assert.deepEqual(first.lines().map(e=>e.seq),[1,2]);
  const second=start(t,dataDir,'--types','run.finished,worker.waiting');
  await until(async()=>db.prepare('select session from director').get()!.session==='director');
  // A new event proves the rearmed subscription is listening, without timeout assertions.
  const fresh=appendEvent(db,'worker.waiting',null,{question:'new'});await second.wait(fresh.seq);
  assert.deepEqual(second.lines().map(e=>e.seq),[fresh.seq]);await second.stop();
  // hito 21: el cursor es de la sesión; otra lista de tipos no reentrega la historia (antes, [1,2,3])
  const third=start(t,dataDir);const later=appendEvent(db,'command.failed',null,{commandId:'d'});await third.wait(later.seq);
  assert.deepEqual(third.lines().map(e=>e.seq),[later.seq]);
});

test('hito 21: una Decisión llega aunque --types no la nombre',async t=>{
  const {db,dataDir}=await setup(t);
  const opened=appendEvent(db,'decision.opened',null,{decisionId:'d1'});
  const updated=appendEvent(db,'decision.updated',null,{decisionId:'d1'});
  const watcher=start(t,dataDir,'--types','run.finished');await watcher.wait(updated.seq);
  assert.deepEqual(watcher.lines().map(e=>e.seq),[opened.seq,updated.seq]);
});

test('hito 21: los cursores v1 (sesión + tipos) migran al último entregado a la sesión',async t=>{
  const {db,dataDir}=await setup(t);
  for(let i=0;i<10;i++) appendEvent(db,'run.finished',null,{n:i});
  writeFileSync(join(dataDir,'watcher-cursors.json'),JSON.stringify({version:1,cursors:{
    '["director",["run.finished"]]':9,[legacyDefaultKey]:4,'["otra",["run.finished"]]':2}}));
  const watcher=start(t,dataDir,'--types','run.finished,worker.waiting');await watcher.wait(10);
  assert.deepEqual(watcher.lines().map(e=>e.seq),[10]);
  await until(async()=>watcher.saved().version===2 && watcher.saved().cursors.director>=10);
  assert.equal(watcher.saved().cursors.otra,2);
});

test('types inválidos fallan antes de adquirir lock o contactar servicio',async t=>{
  const {dataDir}=await setup(t);
  for(const value of ['',',run.finished','run.finished,','bad type','Run.finished']) {
    const watcher=start(t,dataDir,'--types',value);
    await until(async()=>watcher.child.exitCode!==null);
    assert.equal(watcher.child.exitCode,1);assert.match(watcher.error(),/tipos|types/);
    assert.deepEqual(watcher.lines(),[]);
  }
});
