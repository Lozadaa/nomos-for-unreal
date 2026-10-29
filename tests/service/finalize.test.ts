import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { integrateRun } from '../../service/src/handlers/integrate.ts';
import { createFinalize } from '../../service/src/handlers/finalize.ts';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { insert, read } from '../../service/src/repo/rows.ts';
import { finishRun, startRun } from '../../service/src/repo/runs.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { taskArchive, verifyArchive, type ArchiveWriter } from '../../service/src/archive.ts';
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
async function closing(f: F, name: string, files?: Record<string, string>) {
  const a = files ? f.addTask(name, files) : f.addTask(name);
  assert.equal(((await integrateRun(f.command('integrate.run', {taskId: a.task.id}), f.ctx)) as any).integrated, true);
  return a;
}
const finalize = (f: F, taskId: string, deps = {}, id = `fin-${taskId}`) =>
  createFinalize(deps)(f.command('finalize.run', {taskId}, id), f.ctx) as Promise<Record<string, any>>;

test('cierre completo: preserva y verifica, cierra los terminales, retira los worktrees (también el de revisión) sin force y pasa a done', async () => {
  const f = integrationFixture();
  try {
    const calls = withOrca(f), a = await closing(f, 'vida');
    const reviewPath = join(f.repo.root, 'vida-review');
    f.repo.git(f.repo.dir, 'worktree', 'add', '-b', 'nomos/vida-review', reviewPath);
    const review = insert<Worktree>(f.db, 'worktrees', {taskId: a.task.id, path: reviewPath, branch: 'nomos/vida-review', baseCommit: a.base, state: 'active', closedReason: null});
    finishRun(f.db, startRun(f.db, {taskId: a.task.id, role: 'revisor', provider: 'claude', sessionRef: 'term_rev', metadata: {worktreeId: review.id}}).id, 'done', 'Aprobado');
    const result = await finalize(f, a.task.id);
    assert.equal(result.closed, true);
    const task = getTask(f.db, a.task.id)!;
    assert.equal(task.state, 'done');
    // hito 24: el cierre deja la reanudación al día (la tarea ya cuenta como terminada)
    assert.match(readFileSync(join(f.dataDir, 'reanudacion.md'), 'utf8'), /0 abiertas, 1 terminadas/);
    assert.equal(task.archivePath, `archive/${a.task.id}`, 'relativo a la carpeta de datos');
    const dir = taskArchive(f.dataDir, task)!;
    assert.deepEqual(Object.keys(task.attribution).sort(), ['integro', 'verifico']);
    assert.deepEqual(calls, [['close', 'term_vida'], ['close', 'term_rev'], ['rm', a.tree.id, 'false'], ['rm', review.id, 'false']]);
    assert.ok(!f.repo.git(f.repo.dir, 'worktree', 'list').includes('vida'), 'worktrees retirados');
    assert.equal(read<Worktree>(f.db, 'worktrees', a.tree.id)!.state, 'closed');
    const manifest = verifyArchive(dir)!;
    assert.deepEqual(Object.keys(manifest.files).sort(), ['conversacion.jsonl', 'diff-final.patch', 'eventos.jsonl', 'resumen.md', 'sesiones.json']);
    assert.match(readFileSync(join(dir, 'diff-final.patch'), 'utf8'), /int vida = 100/);
    assert.match(readFileSync(join(dir, 'resumen.md'), 'utf8'), /## Commits\n- [0-9a-f]{7} Cambios de vida/);
    assert.equal(JSON.parse(readFileSync(join(dir, 'sesiones.json'), 'utf8'))[0].sessionRef, 'term_vida');
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
    assert.match(readFileSync(join(taskArchive(f.dataDir, getTask(f.db, a.task.id)!)!, 'diff-final.patch'), 'utf8'), /pendiente/, 'lo descartado queda preservado');
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

test('hito 25: un cierre de hito no pasa a done sin build estampada y «Aprobar» del usuario posterior a su último commit y a la build', async () => {
  const {approve, pendingApproval} = await import('../../service/src/approvals.ts');
  const {writeBuildInfo} = await import('../../service/src/build-info.ts');
  const {mkdirSync} = await import('node:fs');
  const f = integrationFixture();
  try {
    withOrca(f); const a = await closing(f, 'jugable', {'Source/Vida.cpp': 'int vida = 100;\n', 'docs/produccion/J1.md': lessonsReport});
    f.db.prepare('update tasks set title=? where id=?').run('Cierre J1: build jugable', a.task.id);
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({memory: {enabled: false}})); // nunca el Second Brain real
    const blockedWith = async () => { const r = await finalize(f, a.task.id, {}, `fin-${Math.random()}`); return [r.closed, r.reason, getTask(f.db, a.task.id)!.state]; };
    assert.deepEqual(await blockedWith(), [false, 'Falta tu aprobación sobre la build jugable', 'cerrando']);
    assert.equal(f.events('task.closing_blocked').at(-1)!.condition, 'approval');
    const first = pendingApproval(f.db, a.task.id)!; assert.ok(first, 'el panel lo enseña en «Por aprobar»');
    const {listApprovals} = await import('../../service/src/approvals.ts');
    assert.equal(listApprovals(f.db).items[0].blocked, 'Falta tu aprobación sobre la build jugable');
    approve(f.db, first.id);
    assert.deepEqual(await blockedWith(), [false, 'Falta tu aprobación sobre la build jugable', 'cerrando'], 'aprobado, pero sin build estampada');
    const dir = join(f.repo.dir, 'Build', 'Windows-actual'); mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'Juego.exe'), 'exe');
    writeBuildInfo(dir, {commit: f.repo.git(f.repo.dir, 'rev-parse', 'HEAD'), branch: 'master', builtAt: new Date().toISOString(), task: null, run: null});
    assert.deepEqual(await blockedWith(), [false, 'Falta tu aprobación sobre la build jugable', 'cerrando'], 'la aprobación es anterior a la build');
    approve(f.db, pendingApproval(f.db, a.task.id)!.id);
    assert.deepEqual((await blockedWith()).slice(0, 1).concat(getTask(f.db, a.task.id)!.state), [true, 'done']);
  } finally { f.close(); }
});

const lessonsReport = '# J1\n\nHecho.\n\n## Lecciones\n\n- Jugar la build antes de cerrar el hito.\n- Una mecánica por día basta.\n';
/** Cierre J1 listo para done: informe en el worktree, integrado, build estampada y «Aprobar» posterior. */
async function readyClosing(f: F, report: string, config?: object) {
  const {approve, requestApproval} = await import('../../service/src/approvals.ts');
  const {writeBuildInfo} = await import('../../service/src/build-info.ts');
  const {mkdirSync} = await import('node:fs');
  if (config) writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify(config));
  withOrca(f);
  const a = await closing(f, 'j1', {'Source/Vida.cpp': 'int vida = 100;\n', 'docs/produccion/J1.md': report});
  f.db.prepare('update tasks set title=? where id=?').run('Cierre J1: build jugable', a.task.id);
  const dir = join(f.repo.dir, 'Build', 'Windows-actual'); mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'Juego.exe'), 'exe');
  writeBuildInfo(dir, {commit: f.repo.git(f.repo.dir, 'rev-parse', 'HEAD'), branch: 'master', builtAt: new Date().toISOString(), task: null, run: null});
  approve(f.db, requestApproval(f.db, getTask(f.db, a.task.id)!).id);
  return a;
}
/** brain.py falso: guarda sus argumentos y el cuerpo, y devuelve la ruta de la nota (o falla). */
function fakeBrain(f: F, fail = false) {
  const script = join(f.repo.root, 'brain.mjs'), out = join(f.repo.root, 'brain.json');
  writeFileSync(script, `import {readFileSync, writeFileSync} from 'node:fs';
const a = process.argv.slice(2);
writeFileSync(${JSON.stringify(out)}, JSON.stringify({args: a, body: readFileSync(a[a.indexOf('--body-file') + 1], 'utf8')}));
${fail ? "console.error('perfil no encontrado'); process.exit(3);" : "console.log('profiles/personal/knowledge/20261029-lecciones.md');"}`);
  return {command: [process.execPath, script], read: () => JSON.parse(readFileSync(out, 'utf8'))};
}

test('hito 25: sin «## Lecciones» en el informe el cierre devuelve closing_blocked «Faltan las lecciones»', async () => {
  const f = integrationFixture();
  try {
    const a = await readyClosing(f, '# J1\n\nHecho.\n');
    const r = await finalize(f, a.task.id);
    assert.deepEqual([r.closed, r.reason, getTask(f.db, a.task.id)!.state], [false, 'Faltan las lecciones', 'cerrando']);
    assert.equal(f.events('task.closing_blocked').at(-1)!.condition, 'lessons');
  } finally { f.close(); }
});

test('hito 25: al cerrar, las lecciones van a Second Brain (kind learning, evidence observed), quedan como artefacto y en la reanudación', async () => {
  const f = integrationFixture();
  try {
    const brain = fakeBrain(f), a = await readyClosing(f, lessonsReport, {memory: {enabled: true, command: brain.command}});
    const r = await finalize(f, a.task.id);
    assert.equal(r.closed, true, r.reason);
    const {args, body} = brain.read();
    const at = (flag: string) => args[args.indexOf(flag) + 1];
    assert.deepEqual([at('--cwd'), args[2], at('--title'), at('--kind'), at('--evidence')], [f.repo.dir, 'capture', 'Juego · J1: lecciones', 'learning', 'observed']);
    assert.match(at('--source'), /^docs\/produccion\/J1\.md @ [0-9a-f]{7}$/);
    assert.equal(body, '- Jugar la build antes de cerrar el hito.\n- Una mecánica por día basta.\n');
    const {listArtifacts} = await import('../../service/src/repo/artifacts.ts');
    const saved = listArtifacts(f.db, {taskId: a.task.id}).filter(x => x.provenance.label === 'Memoria guardada');
    assert.deepEqual(saved.map(x => [x.kind, x.path]), [['report', 'profiles/personal/knowledge/20261029-lecciones.md']]);
    assert.deepEqual(f.events('memory.saved').map(e => [e.taskId, e.path]), [[a.task.id, 'profiles/personal/knowledge/20261029-lecciones.md']]);
    assert.match(readFileSync(join(f.dataDir, 'reanudacion.md'), 'utf8'), /## Lecciones\n\n- Jugar la build antes de cerrar el hito\.\n- Una mecánica por día basta\./);
  } finally { f.close(); }
});

test('hito 25: si Second Brain falla, command.failed con la causa y la tarea cierra igual', async () => {
  const f = integrationFixture();
  try {
    const brain = fakeBrain(f, true), a = await readyClosing(f, lessonsReport, {memory: {enabled: true, command: brain.command}});
    assert.equal((await finalize(f, a.task.id)).closed, true);
    assert.equal(getTask(f.db, a.task.id)!.state, 'done');
    assert.match(f.events('command.failed').at(-1)!.reason, /Second Brain.*perfil no encontrado/s);
    assert.equal(f.events('memory.saved').length, 0);
  } finally { f.close(); }
});
