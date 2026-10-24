import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { openDb } from '../../service/src/db.ts';
import { createGit } from '../../service/src/adapters/git.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { finishRun, startRun } from '../../service/src/repo/runs.ts';
import { insert } from '../../service/src/repo/rows.ts';
import { recordTestRun } from '../../service/src/repo/artifacts.ts';
import { listEvents } from '../../service/src/store.ts';
import type { WorkerContext } from '../../service/src/runner.ts';
import type { Command, Task, Worktree } from '../../service/src/model.ts';

/** Repo Git real `Juego` (rama master, Juego.uproject) con un worktree de tarea `nomos/<n>` ya committeado. */
export function gameRepo() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-int-')), dir = join(root, 'Juego');
  mkdirSync(dir);
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8', windowsHide: true, stdio: 'pipe'}).trim();
  git(dir, 'init', '-b', 'master'); git(dir, 'config', 'core.autocrlf', 'false');
  git(dir, 'config', 'user.name', 'Nomos test'); git(dir, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(join(dir, 'Juego.uproject'), '{}\n'); writeFileSync(join(dir, '.gitignore'), '.nomos/\n');
  writeFileSync(join(dir, 'notas.txt'), 'uno\ndos\ntres\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Base');
  /** Worktree de tarea con un commit que escribe `files` (texto o bytes). */
  const tree = (name: string, files: Record<string, string | Buffer>) => {
    const path = join(root, name);
    git(dir, 'worktree', 'add', '-b', `nomos/${name}`, path);
    const base = git(path, 'rev-parse', 'HEAD');
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(join(path, file, '..'), {recursive: true}); writeFileSync(join(path, file), content);
    }
    git(path, 'add', '.'); git(path, 'commit', '-m', `Cambios de ${name}`);
    return {path, branch: `nomos/${name}`, base};
  };
  /** Commit directo en master (otra integración, o el usuario). */
  const commitMaster = (files: Record<string, string | Buffer>) => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(join(dir, file, '..'), {recursive: true}); writeFileSync(join(dir, file), content);
    }
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Cambio en master');
    return git(dir, 'rev-parse', 'HEAD');
  };
  return {root, dir, git, tree, commitMaster, close() { rmSync(root, {recursive: true, force: true, maxRetries: 3}); }};
}

/** Servicio sin HTTP sobre `gameRepo`: tarea aprobada en `integrando` con su worktree y run implementador terminado. */
export function integrationFixture(files: Record<string, string | Buffer> = {'Source/Vida.cpp': 'int vida = 100;\n'}) {
  const repo = gameRepo(), dataDir = join(repo.dir, '.nomos');
  mkdirSync(dataDir, {recursive: true});
  const db = openDb(':memory:');
  const ctx = {db, dataDir, projectDir: repo.dir, git: createGit()} as unknown as WorkerContext;
  const addTask = (name: string, treeFiles = files, state: Task['state'] = 'integrando') => {
    const t = repo.tree(name, treeFiles);
    const task = createTask(db, {title: `Tarea ${name}`, area: 'gameplay', state, spec: 'Hacer', acceptance: ['check:cpp'], scope: ['Source']});
    const tree = insert<Worktree>(db, 'worktrees', {taskId: task.id, path: t.path, branch: t.branch, baseCommit: t.base, state: 'active', closedReason: null});
    db.prepare('update tasks set worktree_id=?, review_approved=1 where id=?').run(tree.id, task.id);
    let implementer = startRun(db, {taskId: task.id, role: 'implementacion', provider: 'claude', sessionRef: `term_${name}`, metadata: {worktreeId: tree.id}});
    implementer = finishRun(db, implementer.id, 'done', 'Hecho');
    recordTestRun(db, {taskId: task.id, runId: implementer.id, checkId: 'cpp', result: 'passed'});
    return {task, tree, implementer, ...t};
  };
  const events = (type: string) => listEvents(db, 0).filter(e => e.type === type).map(e => e.payload as Record<string, any>);
  const command = (type: string, payload: object, id: string = randomUUID()) =>
    ({id, type, payload, idempotencyKey: id} as unknown as Command);
  return {repo, db, ctx, dataDir, addTask, events, command, close() { db.close(); repo.close(); }};
}
