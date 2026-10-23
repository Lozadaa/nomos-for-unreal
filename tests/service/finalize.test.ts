import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { integrateRun } from '../../service/src/handlers/integrate.ts';
import { createFinalize } from '../../service/src/handlers/finalize.ts';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { read } from '../../service/src/repo/rows.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { verifyArchive, type ArchiveWriter } from '../../service/src/archive.ts';
import type { Worktree } from '../../service/src/model.ts';
import { integrationFixture } from './integration-fixture.ts';
import { fixture as orcaFixture } from './orca-fixture.ts';

type F = ReturnType<typeof integrationFixture>;
/** Orca falso en proceso: registra llamadas y retira el worktree con Git (sin force) como haría Orca. */
function withOrca(f: F, opts: {busy?: number} = {}) {
  const calls: string[][] = [];
  let busy = opts.busy ?? 0;
  (f.ctx as any).orca = {
    async terminalClose(handle: string) { calls.push(['close', handle]); },
    async terminalAlive() { return false; },
    async worktreeRemove(id: string, force = false) {
      calls.push(['rm', id, String(force)]);
      if (busy-- > 0) throw new Error('EBUSY: resource busy or locked, rmdir');
      const tree = read<Worktree>(f.db, 'worktrees', id)!;
      f.repo.git(f.repo.dir, 'worktree', 'remove', ...(force ? ['--force'] : []), tree.path);
    },
  };
  return calls;
}
async function closing(f: F, name: string) {
  const a = f.addTask(name);
  assert.equal(((await integrateRun(f.command('integrate.run', {taskId: a.task.id}), f.ctx)) as any).integrated, true);
  return a;
}
const finalize = (f: F, taskId: string, deps = {}, id = `fin-${taskId}`) =>
  createFinalize(deps)(f.command('finalize.run', {taskId}, id), f.ctx) as Promise<Record<string, any>>;

test('cierre completo: preserva y verifica, cierra el terminal, retira el worktree sin force y pasa a done', async () => {
  const f = integrationFixture();
  try {
    const calls = withOrca(f), a = await closing(f, 'vida');
    const result = await finalize(f, a.task.id);
    assert.equal(result.closed, true);
    const task = getTask(f.db, a.task.id)!;
    assert.equal(task.state, 'done');
    assert.equal(task.archivePath, join(f.dataDir, 'archive', a.task.id));
    assert.deepEqual(Object.keys(task.attribution).sort(), ['integro', 'verifico']);
    assert.deepEqual(calls, [['close', 'term_vida'], ['rm', a.tree.id, 'false']]);
    assert.ok(!f.repo.git(f.repo.dir, 'worktree', 'list').includes('vida'), 'worktree retirado');
    assert.equal(read<Worktree>(f.db, 'worktrees', a.tree.id)!.state, 'closed');
    const manifest = verifyArchive(task.archivePath!)!;
    assert.deepEqual(Object.keys(manifest.files).sort(), ['conversacion.jsonl', 'diff-final.patch', 'eventos.jsonl', 'resumen.md', 'sesiones.json']);
    assert.match(readFileSync(join(task.archivePath!, 'diff-final.patch'), 'utf8'), /int vida = 100/);
    assert.match(readFileSync(join(task.archivePath!, 'resumen.md'), 'utf8'), /## Commits\n- [0-9a-f]{7} Cambios de vida/);
    assert.equal(JSON.parse(readFileSync(join(task.archivePath!, 'sesiones.json'), 'utf8'))[0].sessionRef, 'term_vida');
    assert.equal(f.events('task.done').length, 1);
  } finally { f.close(); }
});

test('cambios sin registrar: queda en cerrando con la lista y Decisión; «Descartar» es la única vía al force y queda registrada', async () => {
  const f = integrationFixture();
  try {
    const calls = withOrca(f), a = await closing(f, 'sucio');
    writeFileSync(join(a.path, 'b.txt'), 'pendiente\n');
    const first = await finalize(f, a.task.id);
    assert.equal(first.deferred, true);
    const task = getTask(f.db, a.task.id)!;
    assert.deepEqual([task.state, task.waitReason], ['cerrando', 'Cambios sin registrar: b.txt']);
    assert.deepEqual(f.events('task.closing_blocked').map(e => [e.condition, e.files]), [['worktree', ['b.txt']]]);
    const [decision] = listDecisions(f.db, 'open');
    assert.deepEqual(decision.options.map(o => o.label), ['Descartar', 'Commitear al run', 'Esperar']);
    assert.deepEqual(calls, [], 'no se cierra el terminal ni se toca el worktree');
    resolveDecision(f.db, decision.id, 'discard', 'Richard');
    assert.equal((await finalize(f, a.task.id)).closed, true);
    assert.deepEqual(calls.at(-1), ['rm', a.tree.id, 'true']);
    assert.deepEqual(f.events('worktree.discarded').map(e => e.by), ['Richard']);
    assert.match(readFileSync(join(getTask(f.db, a.task.id)!.archivePath!, 'diff-final.patch'), 'utf8'), /pendiente/, 'lo descartado queda preservado');
  } finally { f.close(); }
});

test('proceso hijo vivo: archivos en uso → diferido 30 s y éxito al tercer intento', async () => {
  const f = integrationFixture();
  try {
    const calls = withOrca(f, {busy: 2}), a = await closing(f, 'ocupado');
    for (const attempt of [1, 2]) {
      assert.deepEqual(await finalize(f, a.task.id), {deferred: true, reason: 'Archivos en uso', delayMs: 30_000}, `intento ${attempt}`);
      assert.equal(getTask(f.db, a.task.id)!.state, 'cerrando');
    }
    assert.equal((await finalize(f, a.task.id)).closed, true);
    assert.equal(calls.filter(c => c[0] === 'rm' && c[2] === 'false').length, 3, 'nunca con force');
  } finally { f.close(); }
});

test('disco lleno al preservar: sin archivo parcial, el worktree no se toca y la tarjeta lo dice', async () => {
  const f = integrationFixture();
  try {
    const calls = withOrca(f), a = await closing(f, 'lleno');
    const writer: ArchiveWriter = {write(path, data) {
      if (path.endsWith('diff-final.patch')) throw Object.assign(new Error('ENOSPC: no space left on device'), {code: 'ENOSPC'});
      writeFileSync(path, data);
    }, copy() {}};
    const result = await finalize(f, a.task.id, {writer});
    assert.deepEqual(result, {closed: false, reason: 'No se pudo preservar: espacio insuficiente'});
    assert.deepEqual(existsSync(join(f.dataDir, 'archive')) ? readdirSync(join(f.dataDir, 'archive')) : [], []);
    assert.deepEqual(calls, []);
    assert.ok(existsSync(a.path));
    const task = getTask(f.db, a.task.id)!;
    assert.deepEqual([task.state, task.waitReason], ['cerrando', 'No se pudo preservar: espacio insuficiente']);
  } finally { f.close(); }
});

test('sin integración no hay cierre; una tarea sin worktree (asset remoto) cierra solo con preservación', async () => {
  const f = integrationFixture();
  try {
    withOrca(f);
    const a = f.addTask('sin-integrar', undefined, 'cerrando');
    assert.equal((await finalize(f, a.task.id)).reason, 'Commits no recuperables en master');
    const asset = createTask(f.db, {title: 'Caja de munición', area: 'assets', state: 'cerrando'});
    assert.equal((await finalize(f, asset.id)).closed, true);
    assert.equal(getTask(f.db, asset.id)!.state, 'done');
    await assert.rejects(finalize(f, asset.id, {}, 'otra'), /invalid_transition/);
  } finally { f.close(); }
});

test('Orca: terminalClose usa la CLI y un terminal cerrado está muerto', async t => {
  const {orca, calls} = orcaFixture(t);
  assert.equal(await orca.terminalAlive('term_fake'), true);
  await orca.terminalClose('term_fake');
  assert.equal(await orca.terminalAlive('term_fake'), false);
  assert.deepEqual(calls[1].command, ['terminal', 'close', '--terminal', 'term_fake', '--json']);
});
