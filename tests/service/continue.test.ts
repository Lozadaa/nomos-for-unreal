import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateRun } from '../../service/src/handlers/integrate.ts';
import { createFinalize } from '../../service/src/handlers/finalize.ts';
import { continuationBrief, createContinuation, taskContinue } from '../../service/src/handlers/continue.ts';
import { renderBrief } from '../../service/src/brief.ts';
import { tick } from '../../service/src/scheduler.ts';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { filtered, read } from '../../service/src/repo/rows.ts';
import { finishRun, startRun } from '../../service/src/repo/runs.ts';
import type { Command, Run, Worktree } from '../../service/src/model.ts';
import { integrationFixture } from './integration-fixture.ts';
import { fixture, requestJson } from '../helpers.ts';

type F = ReturnType<typeof integrationFixture>;
function orca(f: F, alive: boolean) {
  (f.ctx as any).orca = {
    async terminalClose() {}, async terminalAlive() { return alive; },
    async worktreeRemove(id: string) { f.repo.git(f.repo.dir, 'worktree', 'remove', read<Worktree>(f.db, 'worktrees', id)!.path); },
  };
}
const commands = (f: F, type: string) => filtered<Command>(f.db, 'commands', {type}).map(c => JSON.parse(c.payload as unknown as string));
const run = (f: F, payload: object) => taskContinue(f.command('task.continue', payload), f.ctx) as Promise<Record<string, any>>;

test('terminal muerto: tarea hija preparada con atribución heredada; el run nuevo lleva intento + 1 y el archivo en el brief', async () => {
  const f = integrationFixture();
  try {
    orca(f, false);
    const a = f.addTask('vida');
    await integrateRun(f.command('integrate.run', {taskId: a.task.id}), f.ctx);
    assert.equal(((await createFinalize()(f.command('finalize.run', {taskId: a.task.id}), f.ctx)) as any).closed, true);
    const result = await run(f, {taskId: a.task.id, text: 'Sube la vida a 120'});
    assert.equal(result.reused, false);
    const child = getTask(f.db, result.taskId)!;
    assert.deepEqual([child.state, child.parentTaskId, child.title, child.area], ['preparada', a.task.id, 'Ajuste: Tarea vida', 'gameplay']);
    assert.deepEqual(Object.keys(child.attribution).sort(), ['integro', 'verifico']);
    assert.match(child.spec, /^Sube la vida a 120\n\nContinúa «Tarea vida»/);
    assert.deepEqual(f.events('task.continued').map(e => [e.parentTaskId, e.reused]), [[a.task.id, false]]);
    tick(f.db, {}, f.ctx);
    const [start] = commands(f, 'worker.start');
    assert.deepEqual([start.taskId, start.provider, start.role, start.attempt], [child.id, 'claude', 'implementacion', 2]);
    const brief = renderBrief(child, {provider: 'claude', role: 'implementacion', skills: []} as unknown as Run,
      {continuation: continuationBrief(f.db, child)});
    assert.match(brief, /## Continuación[\s\S]*### Tarea vida[\s\S]*```diff[\s\S]*int vida = 100/);
  } finally { f.close(); }
});

test('terminal vivo: se le habla en su terminal con el texto, sin run nuevo del planificador', async () => {
  const f = integrationFixture();
  try {
    orca(f, true);
    const a = f.addTask('vieja');
    f.db.prepare("update tasks set state='done' where id=?").run(a.task.id); // cerrada antes del hito 6: worktree y terminal siguen
    const result = await run(f, {taskId: a.task.id, text: 'Ajusta el color'});
    assert.equal(result.reused, true);
    const [send] = commands(f, 'worker.send');
    const reused = read<Run>(f.db, 'runs', send.runId)!;
    assert.deepEqual([reused.taskId, reused.sessionRef, reused.attempt, reused.metadata.continuationOf, send.text],
      [result.taskId, 'term_vieja', 2, a.implementer.id, 'Ajusta el color']);
    assert.equal(getTask(f.db, result.taskId)!.worktreeId, a.tree.id);
    assert.equal(reused.metadata.cursor, a.implementer.metadata.cursor, 'sigue leyendo donde lo dejó el run original');
    tick(f.db, {}, f.ctx);
    assert.equal(commands(f, 'worker.start').length, 0, 'el planificador no arranca otro worker');
  } finally { f.close(); }
});

test('POST /tasks/:id/continue: 409 si la tarea no está done; devuelve la hija para abrirla', async t => {
  const {server, db} = await fixture(t);
  const task = createTask(db, {title: 'HUD', area: 'ui', state: 'cerrando', spec: 'x', acceptance: ['a'], scope: ['Content/UI']});
  finishRun(db, startRun(db, {taskId: task.id, role: 'implementacion', provider: 'claude'}).id, 'done', 'Hecho');
  assert.equal((await requestJson(server, 'POST', `/tasks/${task.id}/continue`, {text: 'más grande'})).status, 409);
  db.prepare("update tasks set state='done' where id=?").run(task.id);
  assert.equal((await requestJson(server, 'POST', `/tasks/${task.id}/continue`, {text: ' '})).status, 400);
  const response = await requestJson(server, 'POST', `/tasks/${task.id}/continue`, {text: 'más grande'});
  assert.equal(response.status, 202);
  const {taskId} = await response.json();
  assert.equal(getTask(db, taskId)!.parentTaskId, task.id);
  assert.throws(() => createContinuation(db, taskId, 'otra'), /invalid_transition/, 'la hija aún no está done');
});
