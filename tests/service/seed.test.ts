import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openDb } from '../../service/src/db.ts';
import { seed } from '../../service/src/seed.ts';
import { listTasks } from '../../service/src/repo/tasks.ts';
import { searchCatalog, listCatalog } from '../../service/src/repo/catalog.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { budgetSummary } from '../../service/src/repo/budget.ts';
import { listEvents, createMessage } from '../../service/src/store.ts';
const count = (db: any, table: string) => Number(db.prepare(`select count(*) n from ${table}`).get().n);

test('semilla determinista con distribución, catálogo, presupuestos y decisión vigente', () => {
  const a = openDb(':memory:'), b = openDb(':memory:');
  try {
    assert.deepEqual(seed(a), { tasks: 12, runs: 3, events: 60, catalog: 30 });
    seed(b);
    for (const table of ['tasks', 'runs', 'catalog_entries', 'events', 'decisions', 'budgets']) {
      assert.deepEqual(a.prepare(`select * from ${table}`).all(), b.prepare(`select * from ${table}`).all());
    }
    const tasks = listTasks(a);
    assert.deepEqual(tasks.map(t => t.id), Array.from({length: 12}, (_, i) => `seed-task-${String(i + 1).padStart(2, '0')}`));
    assert.deepEqual(Object.fromEntries(['pendiente','preparada','implementando','revisando','probando','integrando','cerrando','done']
      .map(state => [state, tasks.filter(t => t.state === state).length])),
      {pendiente:2, preparada:2, implementando:2, revisando:2, probando:1, integrando:1, cerrando:1, done:1});
    assert.equal(new Set(tasks.map(t => t.area)).size, 8);
    assert.equal(tasks.find(t => t.state === 'cerrando')!.blockedReason, 'No se pudo retirar el worktree: archivos sin registrar');
    for (const [table, n] of Object.entries({worktrees:1, budgets:2, artifacts:4, test_runs:2})) assert.equal(count(a, table), n);
    assert.deepEqual(a.prepare('select result from test_runs order by result').all().map(r => r.result), ['failed','passed']);
    const catalog = listCatalog(a);
    assert.equal(searchCatalog(a, 'tenis').length, 2);
    for (const name of ['Advanced Cel Shader Lite','Free_Tennisball','Nude_Tennis_Racket_🎾']) assert.ok(catalog.some(c => c.name === name));
    assert.equal(catalog.filter(c => c.source === 'megascans' && c.name.includes('MetaHuman')).length, 2);
    assert.ok(catalog.some(c => [...c.name].length === 60 && c.name.includes('🎾')));
    assert.ok(catalog.some(c => c.license === null)); assert.ok(catalog.some(c => c.aiForbidden === 1));
    for (const row of a.prepare('select scope,scope_id from budgets').all()) {
      const summary = budgetSummary(a, row.scope as any, row.scope_id as string);
      assert.equal(summary.spent.meshyCredits / summary.limits.meshyCredits!, 0.6);
    }
    const events = listEvents(a, 0);
    assert.equal(new Set(events.map(e => e.payload.source)).size, 7);
    assert.ok(events.every(e => Date.parse(e.createdAt) >= Date.parse('2026-10-22T19:00:00Z') && Date.parse(e.createdAt) < Date.parse('2026-10-22T20:00:00Z')));
    const d = listDecisions(a, 'open')[0];
    assert.equal(d.reason, 'Elegir personaje base: 3 candidatos del catálogo');
    assert.equal(tasks.find(t => t.id === d.taskId)!.state, 'preparada');
    assert.equal(d.options.length, 3);
    assert.equal(resolveDecision(a, d.id, d.options[0].id, 'director').state, 'resolved');
  } finally { a.close(); b.close(); }
});

test('force reemplaza producción sin perder mensajes, director ni cursores del hito 0', () => {
  const db = openDb(':memory:');
  try {
    createMessage(db, 'conservar', 'panel');
    db.exec("update director set session='director',last_ack_seq=1");
    seed(db); assert.throws(() => seed(db), /not_empty/);
    const seq = listEvents(db, 0).at(-1)!.seq;
    seed(db, {force:true, now:new Date('2026-10-23T00:00:00Z')});
    assert.equal(count(db, 'tasks'), 12); assert.equal(count(db, 'events'), 61);
    assert.equal(count(db, 'messages'), 1);
    assert.equal(db.prepare('select session from director').get()!.session, 'director');
    assert.equal(db.prepare('select last_ack_seq from director').get()!.last_ack_seq, 1);
    assert.ok(listEvents(db, seq).length === 60);
    assert.ok(listEvents(db, seq).every(e => e.createdAt.startsWith('2026-10-22T23:')));
  } finally { db.close(); }
});

test('CLI offline escribe artefactos locales y rechaza reseed sin force', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-seed-'));
  const cli = (...args: string[]) => spawnSync(process.execPath, ['service/src/cli.ts', 'seed', '--data', dir, ...args], {encoding:'utf8'});
  try {
    const result = cli(); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {tasks:12,runs:3,events:60,catalog:30});
    const db = openDb(join(dir,'nomos.db'));
    try {
      for (const row of db.prepare('select path from artifacts').all()) {
        assert.equal(dirname(row.path as string), '.');
        assert.ok(existsSync(join(dir,'artifacts',row.path as string)));
      }
      const model = db.prepare("select path from artifacts where kind='model'").get()!;
      const bytes = readFileSync(join(dir,'artifacts',model.path as string));
      assert.equal(bytes.toString('ascii',0,4),'glTF'); assert.equal(bytes.readUInt32LE(4),2);
      assert.equal(bytes.readUInt32LE(8),bytes.length);
      const json = JSON.parse(bytes.toString('utf8',20,20 + bytes.readUInt32LE(12)));
      assert.ok(json.meshes.length); assert.ok(json.buffers.length);
    } finally { db.close(); }
    assert.equal(cli().status, 1); assert.equal(cli('--force').status, 0);
    assert.ok(!existsSync(join(dir,'service.json')));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test('filas en disco independientes son idénticas y memory no crea artefactos', () => {
  const dir = mkdtempSync(join(tmpdir(),'nomos-seed-determinism-'));
  const a = openDb(join(dir,'a.db')), b = openDb(join(dir,'b.db'));
  try {
    seed(a); seed(b);
    for (const table of ['tasks','runs','worktrees','decisions','budgets','spends','artifacts','test_runs','catalog_entries','events']) {
      assert.deepEqual(a.prepare(`select * from ${table}`).all(), b.prepare(`select * from ${table}`).all());
    }
  } finally { a.close(); b.close(); rmSync(dir,{recursive:true,force:true}); }
  const before = existsSync('artifacts');
  const memory = openDb(':memory:');
  try { seed(memory); assert.equal(existsSync('artifacts'),before); } finally { memory.close(); }
});
