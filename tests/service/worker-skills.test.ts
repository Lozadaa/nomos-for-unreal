import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './worker-fixture.ts';
import { reviewFixture } from './review-fixture.ts';
import { listEvents } from '../../service/src/store.ts';
import { streamMarkers, screenMarkers } from '../../service/src/handlers/worker-markers.ts';
import { workerSkillsBrief } from '../../service/src/brief.ts';

test('SKILLS respeta stream fragmentado, fences, screen y validación de lista JSON',()=>{
  const first=streamMarkers(['NOMOS_SK','ILLS ["ue-ui-'], '');
  assert.deepEqual(first.found,[]);
  const second=streamMarkers(['umg-slate","game-ui-design"]'],first.buffer);
  assert.deepEqual(second.found,[{kind:'SKILLS',skills:['ue-ui-umg-slate','game-ui-design']}]);
  assert.deepEqual(streamMarkers(['```json','NOMOS_SKILLS ["ejemplo"]','```','NOMOS_SKILLS []'],'').found,
    [{kind:'SKILLS',skills:[]}]);
  assert.deepEqual(screenMarkers(['⏺ NOMOS_SKILLS ["ue-ui-umg-slate",','  ⎿ "game-ui-design"]']),second.found);
  assert.deepEqual(screenMarkers(['NOMOS_SKILLS ["truncada",']),[]);
  assert.deepEqual(screenMarkers(['  "otra"]']),[]);
  assert.deepEqual(screenMarkers(['```','NOMOS_SKILLS ["ejemplo"]','```','Prosa NOMOS_SKILLS []',
    '> NOMOS_SKILLS []','NOMOS_SKILLS [1]','NOMOS_SKILLS [""]']),[]);
});
test('brief solicita confirmación veraz a todos los proveedores reconocidos',()=>{
  for(const provider of ['codex','claude','opencode'] as const) {
    const brief=workerSkillsBrief({provider,skills:['ue-ui-umg-slate']});
    assert.match(brief,/Carga las skills/);assert.match(brief,/ue-ui-umg-slate/);
    assert.match(brief,/primera línea.*NOMOS_SKILLS/);assert.match(brief,/cuando las uses/);
  }
});
for(const provider of ['codex','claude']) test(`T22 UMG ${provider}: unión persistida, confirmación parcial, missing y DONE`,async t=>{
  const f=fixture(t,provider==='claude'?{FAKE_ORCA_MODE:'claude'}:{});
  f.db.prepare("update tasks set area='ui' where id=?").run(f.task.id);
  const payload={taskId:f.task.id,provider,role:'implementacion',skills:['tdd','game-ui-design','tdd']};
  const key='skills-start';await f.invoke('worker.start',payload,key);
  const run=f.run();assert.ok(run.skills.includes('ue-ui-umg-slate'));assert.ok(run.skills.includes('game-ui-design'));
  assert.equal(run.skills.filter(s=>s==='tdd').length,1);
  assert.deepEqual(payload.skills,['tdd','game-ui-design','tdd']);
  assert.deepEqual(JSON.parse(f.db.prepare('select payload from commands where idempotency_key=?').get(key)!.payload as string),payload);
  const brief=readFileSync(join(f.tree().path,'.nomos-brief.md'),'utf8');
  assert.match(brief,/Carga las skills/);assert.match(brief,/ue-ui-umg-slate/);assert.match(brief,/game-ui-design/);
  assert.equal(run.metadata.confirmedSkills,undefined,'Solicitar no significa confirmar');
  f.output('NOMOS_SKILLS ["ue-ui-umg-slate","game-ui-design"]');
  await f.invoke('worker.poll',{runId:run.id});
  assert.deepEqual(f.run().metadata.confirmedSkills,['ue-ui-umg-slate','game-ui-design']);
  const event=listEvents(f.db,0).find(e=>e.type==='worker.skills_missing')!;
  assert.equal(event.payload.provider,provider);assert.equal(event.payload.runId,run.id);
  assert.deepEqual(event.payload.missing,run.skills.filter(s=>!['ue-ui-umg-slate','game-ui-design'].includes(s)));
  f.output('NOMOS_SKILLS '+JSON.stringify(run.skills),'NOMOS_DONE {"summary":"UMG","commits":[],"tests":"passed"}');
  await f.invoke('worker.poll',{runId:run.id});
  assert.deepEqual(f.run().metadata.confirmedSkills,run.skills);assert.equal(f.run().state,'done');
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.skills_missing').length,1);
});
test('screen confirma lista vacía una vez y DONE continúa sin bloquear',async t=>{
  const f=fixture(t);await f.start();const run=f.run();
  const screen=['● NOMOS_SKILLS []'];
  writeFileSync(f.file,JSON.stringify({...f.state(),screen}));
  await f.invoke('worker.poll',{runId:run.id});await f.invoke('worker.poll',{runId:run.id});
  assert.deepEqual(f.run().metadata.confirmedSkills,[]);
  assert.equal(listEvents(f.db,0).filter(e=>e.type==='worker.skills_missing').length,1);
  writeFileSync(f.file,JSON.stringify({...f.state(),screen:['• NOMOS_DONE {"summary":"Listo","commits":[],"tests":"none"}']}));
  await f.invoke('worker.poll',{runId:run.id});assert.equal(f.run().state,'done');
});
test('revisor prevalece sobre área UI y SKILLS no interfiere con REVIEW',async t=>{
  const f=await reviewFixture(t);f.db.prepare("update tasks set area='ui' where id=?").run(f.task.id);
  await f.startReview();const run=f.reviewer();
  assert.deepEqual(run.skills,['code-review','superpowers:requesting-code-review']);
  assert.match(readFileSync(join(f.reviewTree().path,'.nomos-brief.md'),'utf8'),/Carga las skills.*code-review/);
  f.output('NOMOS_SKILLS ["code-review"]','NOMOS_REVIEW {"approved":true,"findings":[]}');await f.poll();
  assert.deepEqual(f.reviewer().metadata.confirmedSkills,['code-review']);assert.equal(f.reviewer().state,'done');
  assert.deepEqual(listEvents(f.db,0).find(e=>e.type==='worker.skills_missing')?.payload.missing,['superpowers:requesting-code-review']);
});
test('worker.start copia las skills de UI al árbol del worker y las excluye del diff',async t=>{
  const f=fixture(t);
  await f.start();
  const tree=f.tree().path;
  for(const name of ['game-ui-art-director','ue-umg-ui','ue-visual-qa'])
    assert.match(readFileSync(join(tree,'.claude','skills',name,'SKILL.md'),'utf8'),new RegExp(`name: ${name}`));
  const {createGit}=await import('../../service/src/adapters/git.ts');
  assert.deepEqual((await createGit().changedFiles!(tree,f.tree().baseCommit)).filter(p=>p.startsWith('.claude')),[]);
});
