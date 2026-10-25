import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { decisionKey, listDecisions, openDecision, resolveDecision } from '../../service/src/repo/decisions.ts';
import { insert } from '../../service/src/repo/rows.ts';
import { openDb } from '../../service/src/db.ts';
import { migrateDecisionRepeats } from '../../service/src/migrations.ts';
import { listEvents } from '../../service/src/store.ts';
import { assetFixture } from './asset-fixture.ts';

const options = [{id: 'manual', label: 'Retarget a mano', description: ''}, {id: 'engine', label: 'Usar maniquí', description: ''}];
const events = (db: ReturnType<typeof openDb>, type: string) => listEvents(db, 0).filter(e => e.type === type);

test('decisionKey: misma razón sin ids ni horas y mismo tipo; otra razón u otro tipo, otra clave', () => {
  const k = (reason: string, kind = 'test') => decisionKey({reason, evidence: [{kind, ref: 'x'}]});
  assert.equal(k('Comprobación 1b2c3d4e-0000-4000-8000-000000000001 falló a las 06:55:20'), k('Comprobación 9f8e7d6c-1111-4111-8111-111111111111 falló a las 06:59'));
  assert.equal(k('Build del 2026-10-25T06:55:20.864Z roto (a3f9c21)'), k('Build del 2026-10-25T07:01:00Z roto (b71de04)'));
  assert.notEqual(k('Retarget manual: LeftLeg sin mapear'), k('Retarget manual: Spine sin mapear'));
  assert.notEqual(k('Igual'), k('Igual', 'catalog'));
});

test('cuatro fallos iguales de animation → una Decisión con contador 4, un decision.opened y tres decision.updated', async () => {
  const f = assetFixture({ffmpeg: () => null});
  try {
    const asset = join(f.projectDir, 'Content', 'MetaHumans', 'Hudson', 'BP_Hudson.uasset');
    mkdirSync(join(asset, '..'), {recursive: true}); writeFileSync(asset, 'x');
    const task = createTask(f.db, {title: 'J5.1 Plantel', area: 'animacion'});
    process.env.NOMOS_FAKE = 'critical';
    for (let i = 0; i < 4; i++) {
      const result = await f.run('character.setup', {taskId: task.id, mesh: '/Game/MetaHumans/Hudson/BP_Hudson', animations: ['/Game/A/AM_Combo'], targetSkeleton: 'metahuman'});
      assert.equal(result.passed, false);
    }
    const open = listDecisions(f.db, 'open');
    assert.equal(open.length, 1, open.map(d => d.reason).join(' | '));
    assert.equal(open[0].seenCount, 4);
    assert.equal(listDecisions(f.db).length, 1, 'ni caducadas: la misma Decisión');
    assert.equal(events(f.db, 'decision.opened').length, 1);
    const updated = events(f.db, 'decision.updated');
    assert.equal(updated.length, 3);
    assert.deepEqual([updated[2].payload.decisionId, updated[2].payload.seenCount], [open[0].id, 4]);
    const lastTest = f.db.prepare("select id from test_runs where task_id=? order by rowid desc limit 1").get(task.id)!.id;
    assert.equal(open[0].evidence[0].ref, lastTest, 'la última evidencia');
    assert.equal(getTask(f.db, task.id)!.decisionId, open[0].id);
    resolveDecision(f.db, open[0].id, 'manual', 'director');
    assert.equal(listDecisions(f.db, 'resolved').length, 1, 'se resuelve a la primera aunque llegaran fallos después');
  } finally { delete process.env.NOMOS_FAKE; f.close(); }
});

test('un fallo distinto abre otra Decisión; resolver una resuelve las equivalentes de antes', () => {
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'Plantel', area: 'animacion'});
  const first = openDecision(db, {taskId: task.id, reason: 'Retarget manual: LeftLeg sin mapear', evidence: [{kind: 'test', ref: 'a'}], options});
  openDecision(db, {taskId: task.id, reason: 'Retarget manual: LeftLeg sin mapear', evidence: [{kind: 'test', ref: 'b'}], options});
  const other = openDecision(db, {taskId: task.id, reason: 'Comprobación no disponible: visual', evidence: [{kind: 'test', ref: 'c'}], options});
  assert.notEqual(other.id, first.id);
  assert.equal(listDecisions(db).length, 2);
  // una base anterior con la misma Decisión abierta dos veces (antes del hito 20)
  const old = insert<{id: string}>(db, 'decisions', {taskId: task.id, reason: 'Retarget manual: LeftLeg sin mapear', evidence: [{kind: 'test', ref: 'z'}],
    options, chosenOptionId: null, resolvedBy: null, resolvedAt: null, contextHash: '', state: 'stale'});
  const again = openDecision(db, {taskId: task.id, reason: 'Retarget manual: LeftLeg sin mapear', evidence: [{kind: 'test', ref: 'd'}], options});
  resolveDecision(db, again.id, 'manual', 'director');
  const states = Object.fromEntries(listDecisions(db).map(d => [d.id, d.state]));
  assert.equal(states[first.id], 'resolved'); assert.equal(states[old.id], 'resolved'); assert.equal(states[again.id], 'resolved');
  assert.equal(states[other.id], 'stale', 'la distinta no se toca (ya la caducó la nueva)');
  db.close();
});

test('migración: las abiertas repetidas de antes quedan en una con el contador sumado', () => {
  const db = openDb(':memory:');
  const task = createTask(db, {title: 'Plantel', area: 'animacion'});
  const row = (at: string) => insert<{id: string}>(db, 'decisions', {taskId: task.id, reason: 'Retarget manual: LeftLeg sin mapear', evidence: [{kind: 'test', ref: at}],
    options, chosenOptionId: null, resolvedBy: null, resolvedAt: null, contextHash: '', state: 'open', createdAt: at});
  row('2026-10-25T06:55:20.000Z'); row('2026-10-25T06:56:09.000Z'); const newest = row('2026-10-25T06:59:27.000Z');
  migrateDecisionRepeats(db);
  const open = listDecisions(db, 'open');
  assert.deepEqual(open.map(d => [d.id, d.seenCount]), [[newest.id, 3]]);
  db.close();
});
