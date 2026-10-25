import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { insert, read } from '../../service/src/repo/rows.ts';
import { applyClean, planClean } from '../../service/src/clean.ts';
import type { Worktree } from '../../service/src/model.ts';
import { cliPath } from '../cli-helpers.ts';

const hours = (n: number) => new Date(Date.now() - n * 3600_000);
/** Archivo de `bytes` dentro de `dir`; con `old`, todo lo de dentro dos horas atrás. */
function put(dir: string, bytes = 1000, old = true) {
  mkdirSync(dir, {recursive: true}); writeFileSync(join(dir, 'f.bin'), Buffer.alloc(bytes));
  if (old) { utimesSync(join(dir, 'f.bin'), hours(2), hours(2)); utimesSync(dir, hours(2), hours(2)); }
}

/** Todo lo de `dir` con fecha de hace dos horas. */
function age(dir: string) {
  for (const e of readdirSync(dir, {withFileTypes: true})) { const p = join(dir, e.name); if (e.isDirectory()) age(p); utimesSync(p, hours(2), hours(2)); }
  utimesSync(dir, hours(2), hours(2));
}

function fixture(t: {after: (fn: () => void) => void}) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-clean-')), game = join(root, 'Juego'), data = join(game, '.nomos');
  mkdirSync(data, {recursive: true});
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {cwd, encoding: 'utf8', windowsHide: true}).trim();
  git(game, 'init', '-q', '-b', 'main'); git(game, 'config', 'user.email', 'n@n'); git(game, 'config', 'user.name', 'Nomos');
  writeFileSync(join(game, '.gitignore'), '.nomos/\nSaved/\nBuild/\n'); writeFileSync(join(game, 'Juego.uproject'), '{}');
  git(game, 'add', '.'); git(game, 'commit', '-qm', 'base');
  const db = openDb(join(data, 'nomos.db'));
  /** Worktree de Orca de una tarea: `merged` la integra en main; `dirty` deja un cambio sin commit. */
  const worker = (name: string, opts: {done: boolean; merged?: boolean; dirty?: boolean}) => {
    const path = join(root, 'orca', name), branch = `nomos/${name}`;
    git(game, 'worktree', 'add', '-q', '-b', branch, path);
    writeFileSync(join(path, `${name}.txt`), name); git(path, 'add', '.'); git(path, 'commit', '-qm', name);
    if (opts.merged) git(game, 'merge', '-q', '--no-ff', '-m', `merge ${name}`, branch);
    if (opts.dirty) writeFileSync(join(path, 'sin-commit.txt'), 'x');
    put(join(path, 'Saved', 'StagedBuilds')); put(join(path, 'Build', 'Windows-actual'));
    const task = createTask(db, {title: name, area: 'qa'});
    age(path);
    if (opts.done) db.prepare("update tasks set state='done' where id=?").run(task.id);
    return insert<Worktree>(db, 'worktrees', {id: `repo-1::${path}`, taskId: task.id, path, branch, baseCommit: '', state: 'active', closedReason: null});
  };
  t.after(() => { db.close(); rmSync(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 100}); });
  return {root, game, data, db, git, worker};
}

test('nomos clean --dry-run lista y suma lo que borraría sin tocar nada; nunca Windows-actual del proyecto ni lo reciente', t => {
  const f = fixture(t);
  put(join(f.data, 'artifacts', 'tests', 'viejo', 'build', 'Windows'), 5000); age(join(f.data, 'artifacts', 'tests', 'viejo', 'build'));
  put(join(f.data, 'artifacts', 'tests', 'en-curso', 'build', 'Windows'), 5000, false);
  writeFileSync(join(f.data, 'artifacts', 'tests', 'viejo', 'log.txt'), 'log');
  put(join(f.game, 'Build', 'Windows-actual'), 7000); put(join(f.game, 'Build', 'Windows-J1'), 3000);
  put(join(f.game, 'Saved', 'StagedBuilds'), 2000); put(join(f.game, 'Saved', 'Paquete-J1'), 2000);
  put(join(f.game, 'Saved', 'VideoJ1'), 4000); put(join(f.game, 'Saved', 'VideoAhora'), 4000, false);
  put(join(f.data, 'integration', 'NombreViejo'), 6000);
  const plan = planClean({dataDir: f.data, projectDir: f.game, db: f.db});
  const paths = plan.items.map(i => i.path);
  assert.ok(paths.includes(join(f.data, 'artifacts', 'tests', 'viejo', 'build')));
  assert.ok(!paths.includes(join(f.data, 'artifacts', 'tests', 'en-curso', 'build')), 'un paquete de hace menos de 30 min puede estar en marcha');
  assert.ok(paths.includes(join(f.game, 'Build', 'Windows-J1')) && !paths.includes(join(f.game, 'Build', 'Windows-actual')));
  assert.ok(paths.includes(join(f.game, 'Saved', 'StagedBuilds')) && paths.includes(join(f.game, 'Saved', 'Paquete-J1')));
  assert.ok(paths.includes(join(f.game, 'Saved', 'VideoJ1')) && !paths.includes(join(f.game, 'Saved', 'VideoAhora')));
  assert.ok(paths.includes(join(f.data, 'integration', 'NombreViejo')));
  assert.equal(plan.bytes, 5000 + 3000 + 2000 + 2000 + 4000 + 6000);
  // dry-run = solo el plan: todo sigue en disco
  assert.ok(existsSync(join(f.data, 'artifacts', 'tests', 'viejo', 'build')) && existsSync(join(f.data, 'integration', 'NombreViejo')));
});

test('una carpeta de integration que es un worktree registrado de Git se queda', t => {
  const f = fixture(t);
  f.git(f.game, 'worktree', 'add', '-q', '--detach', join(f.data, 'integration', 'ws'));
  utimesSync(join(f.data, 'integration', 'ws'), hours(2), hours(2));
  const plan = planClean({dataDir: f.data, projectDir: f.game, db: f.db});
  assert.ok(!plan.items.some(i => i.path.startsWith(join(f.data, 'integration'))));
});

test('worktrees: retira los de tareas cerradas integradas y limpia sus paquetes; no toca los sucios ni los de tareas vivas', async t => {
  const f = fixture(t);
  const done = f.worker('cerrada', {done: true, merged: true});
  const dirty = f.worker('sucia', {done: true, merged: true, dirty: true});
  const live = f.worker('viva', {done: false});
  const plan = planClean({dataDir: f.data, projectDir: f.game, db: f.db});
  assert.deepEqual(plan.trees.map(w => w.id), [done.id]);
  const touched = (path: string) => plan.items.some(i => i.path.startsWith(path)) || plan.trees.some(w => w.path === path);
  assert.equal(touched(dirty.path), false, 'con cambios sin commit no se toca nada');
  assert.equal(touched(live.path), false, 'la tarea sigue viva');
  const removed: string[] = [];
  const freed = await applyClean(plan, {db: f.db, orca: {worktreeRemove: async (id: string) => { removed.push(id); rmSync(done.path, {recursive: true, force: true}); }}});
  assert.deepEqual(removed, [done.id]);
  assert.equal(read<Worktree>(f.db, 'worktrees', done.id)!.state, 'closed');
  assert.ok(freed >= 2000);
  assert.ok(existsSync(join(dirty.path, 'Saved', 'StagedBuilds')) && existsSync(join(live.path, 'Build', 'Windows-actual')));
});

test('applyClean borra lo planeado y conserva el resto de la carpeta de la comprobación', async t => {
  const f = fixture(t);
  const tests = join(f.data, 'artifacts', 'tests', 'viejo');
  put(join(tests, 'build', 'Windows'), 5000); age(join(tests, 'build')); writeFileSync(join(tests, 'log.txt'), 'log'); writeFileSync(join(tests, 'build-hoja.jpg'), 'jpg');
  const plan = planClean({dataDir: f.data, projectDir: f.game, db: f.db});
  const freed = await applyClean(plan, {db: f.db, orca: {worktreeRemove: async () => {}}});
  assert.equal(freed, 5000);
  assert.deepEqual(readdirSync(tests).sort(), ['build-hoja.jpg', 'log.txt']);
  assert.ok(statSync(join(f.game, 'Juego.uproject')));
});

test('la orden nomos clean --dry-run imprime el plan y el total sin borrar', t => {
  const f = fixture(t);
  put(join(f.game, 'Saved', 'StagedBuilds'), 2048);
  const out = execFileSync(process.execPath, [cliPath, 'clean', '--dry-run', '--data', f.data], {encoding: 'utf8', windowsHide: true});
  assert.match(out, /StagedBuilds/);
  assert.match(out, /Se liberarían 0 GB \(1 carpetas?\)/);
  assert.ok(existsSync(join(f.game, 'Saved', 'StagedBuilds')));
});
