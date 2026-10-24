import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewFixture } from './review-fixture.ts';
import { enqueue } from '../../service/src/commands.ts';
import { recoverCommands } from '../../service/src/recovery.ts';
import { reservations } from '../../service/src/scheduler-state.ts';
import { requireTask } from '../../service/src/repo/tasks.ts';

test('Git excluye .kratos-review tracked/untracked del diff y lo ignora localmente',async t=>{
  const f=await reviewFixture(t),tree=f.implementerTree;
  mkdirSync(join(tree.path,'.kratos-review'));writeFileSync(join(tree.path,'.kratos-review/diff.patch'),'INTERNAL');
  let diff=await f.ctx.git.diff(tree.path,tree.baseCommit);assert.doesNotMatch(diff.patch,/INTERNAL/);
  const {execFileSync}=await import('node:child_process');
  execFileSync('git',['-C',tree.path,'add','-f','.kratos-review'],{windowsHide:true});
  diff=await f.ctx.git.diff(tree.path,tree.baseCommit);assert.doesNotMatch(diff.patch,/INTERNAL/);
  await f.ctx.git.excludeLocal(tree.path);
  assert.match(execFileSync('git',['-C',tree.path,'check-ignore','--no-index','.kratos-review/diff.patch'],{encoding:'utf8',windowsHide:true}),/diff.patch/);
});
test('hito 7: el diff de revisión no lleva el contenido de Config sin seguir ni lo generado por Unreal; rutas con emoji legibles',async t=>{
  const f=await reviewFixture(t),tree=f.implementerTree;
  mkdirSync(join(tree.path,'Config'),{recursive:true});writeFileSync(join(tree.path,'Config/DefaultEngine.ini'),'[Android]\nSecurityToken=SECRETO123\n');
  mkdirSync(join(tree.path,'Build/Windows'),{recursive:true});writeFileSync(join(tree.path,'Build/Windows/EditorOpenOrder.log'),'RUTA_LOCAL');
  mkdirSync(join(tree.path,'Content/Fab/Raqueta_🎾'),{recursive:true});writeFileSync(join(tree.path,'Content/Fab/Raqueta_🎾/notas.txt'),'raqueta');
  const diff=await f.ctx.git.diff(tree.path,tree.baseCommit);
  assert.doesNotMatch(diff.patch,/SECRETO123|RUTA_LOCAL/);
  // el revisor sabe que existen, sin ver su contenido
  assert.match(diff.stat,/Config\/DefaultEngine\.ini/);
  assert.match(diff.patch,/Raqueta_🎾\/notas\.txt/);
});
test('intención review reserva proveedor FIFO sin leases y run existente no cuenta dos veces',async t=>{
  const f=await reviewFixture(t);f.db.prepare('update tasks set leases=? where id=?').run('["Docs"]',f.task.id);
  const cmd=enqueue(f.db,'review.start',{taskId:f.task.id,implementerRunId:f.implementer.id,provider:'codex'},'queued-review');
  assert.equal(reservations(f.db).usage.codex,1);assert.equal(reservations(f.db).leases.length,0);
  f.db.prepare("update commands set state='done' where id=?").run(cmd.id);await f.startReview();
  const own=f.reviewer().metadata.startCommandId!;
  f.db.prepare("update commands set state='pending' where id=?").run(own);
  assert.equal(reservations(f.db).usage.codex,1);
});
test('recovery falla arranque review incierto sin tocar implementador y repone review.poll',async t=>{
  const f=await reviewFixture(t);await f.startReview();
  const start=f.reviewer().metadata.startCommandId!;
  f.db.prepare("update commands set state='running' where id=?").run(start);
  const poll=enqueue(f.db,'review.poll',{runId:f.reviewer().id},'recovery-poll');
  f.db.prepare("update commands set state='running' where id=?").run(poll.id);recoverCommands(f.db);
  assert.equal(f.reviewer().state,'failed');assert.equal(f.current().state,'done');
  assert.equal(f.db.prepare('select state from commands where id=?').get(poll.id)!.state,'pending');
});
test('dos proveedores habilitados conservan OpenCode indisponible sin efectos Orca',async t=>{
  const f=await reviewFixture(t);writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":2,"claude":1,"opencode":4}}');
  const before=f.state().creates;
  const unsupported=await f.invoke('review.start',{taskId:f.task.id,implementerRunId:f.implementer.id,provider:'opencode'});
  assert.deepEqual(unsupported,{deferred:true,reason:'OpenCode sin adaptador disponible'});
  assert.equal(f.state().creates,before);
  assert.equal(requireTask(f.db,f.task.id).blockedReason,null);
});

test('recalcula proveedor de intención con configuración vigente sin perder FIFO',async t=>{
  const f=await reviewFixture(t);
  writeFileSync(join(f.dataDir,'config.json'),'{"concurrency":{"codex":1,"claude":0}}');
  const earlier=enqueue(f.db,'worker.start',{taskId:'anterior',provider:'codex',role:'implementacion',skills:[]},'earlier');
  const command=enqueue(f.db,'review.start',{taskId:f.task.id,implementerRunId:f.implementer.id,provider:'claude'},'changed-provider');
  f.db.prepare("update commands set state='running' where id=?").run(command.id);
  const before=f.state().creates;
  assert.deepEqual(await f.handlers['review.start'](command,f.ctx),{deferred:true,reason:'Sin hueco en codex'});
  assert.equal(f.state().creates,before);
  assert.equal(JSON.parse(f.db.prepare('select payload from commands where id=?').get(command.id)!.payload as string).provider,'codex');
  assert.equal(reservations(f.db).usage.codex,2);
  f.db.prepare("update commands set state='done' where id=?").run(earlier.id);
  const state=f.state();state.treePath=join(f.dir,'review-provider');state.terminalHandle='term_review';state.tail=[];
  writeFileSync(f.file,JSON.stringify(state));
  const result=await f.handlers['review.start'](command,f.ctx);
  assert.equal((result as any).runId,f.reviewer().id);assert.equal(f.reviewer().provider,'codex');
});
