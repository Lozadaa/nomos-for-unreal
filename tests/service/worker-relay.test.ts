import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixture } from './worker-fixture.ts';
import { getTask } from '../../service/src/repo/tasks.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { listEvents } from '../../service/src/store.ts';
import { readConfig } from '../../service/src/config.ts';
import type { Run } from '../../service/src/model.ts';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
/** Worker Claude con `orca.maxWorkerMinutes: 20` (relevo a los 5 min) arrancado hace `minutes`. */
async function worker(t: Parameters<typeof fixture>[0], minutes: number) {
  const f = fixture(t, {FAKE_ORCA_MODE: 'claude'});
  writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({concurrency: {claude: 2}, orca: {maxWorkerMinutes: 20}}));
  await f.invoke('worker.start', {taskId: f.task.id, provider: 'claude', role: 'programmer', skills: []});
  f.db.prepare('update runs set started_at=? where id=?').run(ago(minutes), f.run().id);
  const poll = (run: Run = f.run()) => f.invoke('worker.poll', {runId: run.id, generation: run.metadata.pollGeneration ?? 0});
  const runs = () => filtered<Run>(f.db, 'runs', {taskId: f.task.id});
  const events = (type: string) => listEvents(f.db, 0).filter(e => e.type === type).map(e => e.payload as Record<string, unknown>);
  const treeGit = (...args: string[]) => execFileSync('git', ['-C', f.tree().path, ...args], {encoding: 'utf8', windowsHide: true}).trim();
  const relayAgo = (minutes: number) => f.db.prepare("update runs set metadata=json_set(metadata,'$.relayRequestedAt',?) where id=?").run(ago(minutes), runs()[0].id);
  return {...f, poll, runs, events, treeGit, relayAgo};
}

test('maxWorkerMinutes vale en config.json y fija el plazo del worker', async t => {
  const f = await worker(t, 0);
  assert.equal(readConfig(f.dataDir).orca?.maxWorkerMinutes, 20);
  const run = f.run(), left = Date.parse(run.metadata.deadlineAt!) - Date.now();
  assert.ok(left > 19 * 60_000 && left <= 20 * 60_000, `plazo de 20 min, no 4 h (${left} ms)`);
  writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({orca: {maxWorkerMinutes: -1}}));
  assert.throws(() => readConfig(f.dataDir), /invalid_worker_config/);
});

test('antes de los 3 h 45 min (aquí 5 min) no hay relevo', async t => {
  const f = await worker(t, 2);
  await f.poll();
  assert.equal(f.events('worker.relay_requested').length, 0);
  assert.equal(f.runs().length, 1);
});

test('relevo: pide el commit, espera, commitea lo que quede y sigue un worker nuevo en el mismo worktree', async t => {
  const f = await worker(t, 6);
  const first = f.run(), tree = f.tree();
  await f.poll();
  const inbox = readdirSync(join(tree.path, '.nomos-inbox')).find(n => n.startsWith('relevo-'))!;
  assert.match(readFileSync(join(tree.path, '.nomos-inbox', inbox), 'utf8'), /Commit WIP: relevo por límite de tiempo/);
  assert.equal(f.state().tail.at(-1), `Lee el archivo .nomos-inbox/${inbox} y ejecuta lo que dice.`);
  assert.equal(f.events('worker.relay_requested').length, 1);
  // el worker escribe sin commitear; antes de 5 min se le espera
  writeFileSync(join(tree.path, 'medio.txt'), 'a medias\n'); f.output('Guardando el paquete de prueba');
  await f.poll();
  assert.equal(f.runs().length, 1, 'aún dentro de los 5 min de espera');
  f.relayAgo(6);
  await f.poll();
  const [old, next] = f.runs();
  assert.equal(old.state, 'cancelled'); assert.match(old.summary!, /[Rr]elev/);
  assert.equal(next.state, 'running'); assert.equal(next.metadata.worktreeId, first.metadata.worktreeId);
  assert.equal(next.metadata.relayOf, first.id); assert.equal(next.provider, 'claude');
  assert.equal(f.treeGit('log', '-1', '--format=%s'), 'Commit WIP: relevo por límite de tiempo (Nomos)');
  assert.equal(f.treeGit('status', '--porcelain', '--', 'medio.txt'), '');
  const created = f.state().created as {handle: string; worktree: string; command: string}[];
  assert.equal(created.length, 1); assert.equal(next.sessionRef, created[0].handle);
  assert.equal(created[0].worktree, `path:${tree.path}`);
  assert.match(created[0].command, /^claude --model opus --dangerously-skip-permissions "Lee el archivo \.nomos-brief\.md de esta carpeta y ejecuta lo que dice\."$/);
  const brief = readFileSync(join(tree.path, '.nomos-brief.md'), 'utf8');
  assert.match(brief, /Existe README/, 'el brief de la tarea sigue');
  assert.match(brief, /## Relevo por límite de tiempo/);
  assert.match(brief, new RegExp(`Último commit: ${f.treeGit('rev-parse', '--short=7', 'HEAD')}`));
  assert.match(brief, /Guardando el paquete de prueba/);
  assert.match(brief, /continúa donde lo dejó; no repitas lo hecho/i);
  assert.deepEqual(f.events('worker.relayed'), [{taskId: f.task.id, oldRun: first.id, newRun: next.id}]);
  assert.ok((f.state().closed ?? []).includes(first.sessionRef));
  const task = getTask(f.db, f.task.id)!;
  assert.equal(task.state, 'implementando'); assert.equal(task.decisionId, null); assert.equal(task.worktreeId, first.metadata.worktreeId);
  assert.ok(f.db.prepare("select 1 from commands where type='worker.poll' and json_extract(payload,'$.runId')=?").get(next.id), 'el nuevo se sondea');
  // el viejo ya no se sondea ni se vuelve a relevar
  await f.poll(old);
  assert.equal(f.runs().length, 2);
});

test('si el worker ya lo commiteó todo, el relevo no espera ni añade commit de Nomos', async t => {
  const f = await worker(t, 6);
  await f.poll();
  writeFileSync(join(f.tree().path, 'hecho.txt'), 'listo\n');
  f.treeGit('add', 'hecho.txt'); f.treeGit('commit', '-qm', 'Commit WIP: relevo por límite de tiempo');
  await f.poll();
  assert.equal(f.runs().length, 2);
  assert.equal(f.treeGit('log', '-1', '--format=%s'), 'Commit WIP: relevo por límite de tiempo');
  assert.ok(existsSync(join(f.tree().path, '.nomos-brief.md')));
});
