import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDb } from '../../service/src/db.ts';
import { listEvents } from '../../service/src/store.ts';
import { removeDir } from '../remove-dir.ts';
import { createGit } from '../../service/src/adapters/git.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { finishRun, startRun } from '../../service/src/repo/runs.ts';
import { insert } from '../../service/src/repo/rows.ts';
import { recordTestRun } from '../../service/src/repo/artifacts.ts';
import { integrateRun } from '../../service/src/handlers/integrate.ts';
import type { WorkerContext } from '../../service/src/runner.ts';
import type { Command, Worktree } from '../../service/src/model.ts';

/** Hito 29: remoto bare local y clones del juego, cada uno con su `.nomos` y su tarjeta de equipo. Nada sale a un remoto real. */
export function teamFixture() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-team-')), bare = join(root, 'remoto.git');
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8', windowsHide: true, stdio: 'pipe',
    env: {...process.env, GIT_TERMINAL_PROMPT: '0'}}).trim();
  execFileSync('git', ['init', '-q', '--bare', '-b', 'master', bare], {stdio: 'pipe'});
  const seed = join(root, 'semilla'); mkdirSync(seed);
  git(seed, 'init', '-q', '-b', 'master'); git(seed, 'config', 'user.name', 'Semilla'); git(seed, 'config', 'user.email', 's@example.invalid');
  git(seed, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(seed, 'Juego.uproject'), '{}\n'); writeFileSync(join(seed, '.gitignore'), '.nomos/\n');
  writeFileSync(join(seed, 'notas.txt'), 'uno\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'Base'); git(seed, 'remote', 'add', 'origin', bare); git(seed, 'push', '-q', 'origin', 'master');
  const dbs: {close(): void}[] = [];
  /** Clon `name` con equipo encendido (o sin remoto si `remote=false`). */
  const clone = (name: string, frente: string, remote = true) => {
    const dir = join(root, name);
    if (remote) execFileSync('git', ['clone', '-q', '-c', 'core.autocrlf=false', bare, dir], {stdio: 'pipe'});
    else { mkdirSync(dir); git(dir, 'init', '-q', '-b', 'master'); }
    git(dir, 'config', 'user.name', name); git(dir, 'config', 'user.email', `${name}@example.invalid`); git(dir, 'config', 'core.autocrlf', 'false');
    const dataDir = join(dir, '.nomos'); mkdirSync(dataDir, {recursive: true});
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({team: {enabled: true, name, frente}}));
    const db = openDb(join(dataDir, 'nomos.db')); dbs.push(db);
    const events = (type: string) => listEvents(db, 0).filter(e => e.type === type).map(e => e.payload as Record<string, any>);
    const ctx = {db, dataDir, projectDir: dir, git: createGit()} as unknown as WorkerContext;
    /** Tarea aprobada en `integrando` con su worktree (rama `nomos/<n>` desde HEAD) y un commit con `files`. */
    const task = (n: string, files: Record<string, string | Buffer>, title = `Tarea ${n}`) => {
      const path = join(root, `${name}-${n}`);
      git(dir, 'worktree', 'add', '-q', '-b', `nomos/${n}`, path);
      const base = git(path, 'rev-parse', 'HEAD');
      for (const [file, content] of Object.entries(files)) { mkdirSync(join(path, file, '..'), {recursive: true}); writeFileSync(join(path, file), content); }
      git(path, 'add', '.'); git(path, 'commit', '-q', '-m', `Cambios de ${n}`);
      const t = createTask(db, {title, area: 'gameplay', state: 'integrando', spec: 'Hacer', acceptance: ['check:cpp'], scope: ['Source']});
      const tree = insert<Worktree>(db, 'worktrees', {taskId: t.id, path, branch: `nomos/${n}`, baseCommit: base, state: 'active', closedReason: null});
      db.prepare('update tasks set worktree_id=?, review_approved=1 where id=?').run(tree.id, t.id);
      const implementer = finishRun(db, startRun(db, {taskId: t.id, role: 'implementacion', provider: 'claude', sessionRef: `term_${n}`, metadata: {worktreeId: tree.id}}).id, 'done', 'Hecho');
      recordTestRun(db, {taskId: t.id, runId: implementer.id, checkId: 'cpp', result: 'passed'});
      return {task: t, tree, implementer, path};
    };
    const integrate = (taskId: string) => integrateRun({id: `int-${taskId}`, type: 'integrate.run', payload: {taskId}, idempotencyKey: `int-${taskId}`} as unknown as Command, ctx) as Promise<Record<string, any>>;
    return {name, dir, dataDir, db, events, ctx, task, integrate};
  };
  return {root, bare, git, clone, close() { for (const db of dbs) db.close(); removeDir(root); }};
}
