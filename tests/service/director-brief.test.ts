import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { appendEvent, createMessage } from '../../service/src/store.ts';
import { recordPeers } from '../../service/src/team.ts';
import { renderDirectorBrief } from '../../service/src/director.ts';
import { removeDir } from '../remove-dir.ts';

function base(t: any, config: object) {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-brief-')), data = join(dir, '.nomos');
  t.after(() => removeDir(dir));
  mkdirSync(data);
  writeFileSync(join(data, 'config.json'), JSON.stringify(config));
  return {data, db: openDb(join(data, 'nomos.db'))};
}

test('hito 27: brief del director con equipo, jam, tareas, pendientes, mensajes, eventos y 3 acciones en ≤ 60 líneas', t => {
  const start = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const {db, data} = base(t, {team: {enabled: true, name: 'Richard', frente: 'combate'}, jam: {enabled: true, days: 3, start}});
  recordPeers(db, data, [{id: 'ana1', name: 'Ana', frente: 'UI', updatedAt: new Date().toISOString(), tasks: [{id: 'x', title: 'HUD', state: 'implementando', area: 'ui'}],
    leases: [{path: 'Content/UI/WBP_HUD.uasset', taskId: 'x', until: new Date(Date.now() + 3_600_000).toISOString(), at: new Date().toISOString()}],
    decisions: [], build: {commit: 'abc1234def', at: new Date().toISOString()}, requests: []}]);
  createTask(db, {title: 'Cierre J2', area: 'qa', state: 'implementando'});
  for (let i = 0; i < 20; i++) createTask(db, {title: `Tarea ${i}`, area: 'gameplay', state: i % 2 ? 'revisando' : 'pendiente'});
  for (let i = 0; i < 30; i++) appendEvent(db, 'worker.waiting', null, {taskId: 'x', question: '¿Sigo?'});
  const {messageId} = createMessage(db, '¿Cómo va el HUD?', 'web');
  const brief = renderDirectorBrief(db, data), lines = brief.split('\n');
  assert.ok(lines.length <= 60, `${lines.length} líneas`);
  assert.ok(brief.indexOf('## Equipo') < brief.indexOf('## Hito'), 'Equipo abre el brief');
  assert.match(brief, /Ana \(UI\): presente .*WBP_HUD.*abc1234/);
  assert.match(brief, /Cierre J2 .*· día 2 de 3/);
  assert.match(brief, new RegExp(`${messageId}.*¿Cómo va el HUD\?`));
  assert.match(brief, /… \d+ anteriores/, 'los eventos viejos no se listan');
  const actions = brief.slice(brief.indexOf('## Acciones probables')).split('\n').filter(l => /^\d\. /.test(l));
  assert.equal(actions.length, 3);
  assert.match(actions[0], new RegExp(`nomos reply ${messageId}`));
  assert.doesNotMatch(brief, /\{\{/);
  db.close();
});

test('hito 27: sin equipo no hay sección Equipo y sin nada pendiente la acción es terminar', t => {
  const {db, data} = base(t, {});
  const brief = renderDirectorBrief(db, data);
  assert.doesNotMatch(brief, /## Equipo/);
  assert.match(brief, /Sin nada que decidir/);
  db.close();
});
