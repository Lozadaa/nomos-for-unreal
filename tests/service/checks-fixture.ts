import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb } from '../../service/src/db.ts';
import { createUnrealCmd } from '../../service/src/adapters/unreal-cmd.ts';
import { createCheckHandlers } from '../../service/src/handlers/checks.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { finishRun, startRun } from '../../service/src/repo/runs.ts';
import { listEvents } from '../../service/src/store.ts';
import { insert } from '../../service/src/repo/rows.ts';
import type { WorkerContext } from '../../service/src/runner.ts';
import type { Command, Task } from '../../service/src/model.ts';
import type { CheckDeps } from '../../service/src/checks/run.ts';

const fakes = join(import.meta.dirname, '..', 'fakes');

/** Juego `Juego/Juego.uproject`, motor falso 5.8.3, git falso con el diff dado y una tarea con su run implementador terminado. */
export function checksFixture(opts: {files?: string[]; state?: Task['state']; area?: Task['area']; engine?: boolean; deps?: CheckDeps} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-checks-')), dataDir = join(root, '.nomos'), projectDir = join(root, 'Juego');
  const engineDir = join(root, 'Engine');
  mkdirSync(dataDir, {recursive: true}); mkdirSync(join(projectDir, 'Content'), {recursive: true}); mkdirSync(join(engineDir, 'Build'), {recursive: true});
  writeFileSync(join(projectDir, 'Juego.uproject'), '{}');
  // los archivos del diff existen en el árbol (salvo que la prueba los borre)
  for (const file of opts.files ?? []) { mkdirSync(dirname(join(projectDir, file)), {recursive: true}); writeFileSync(join(projectDir, file), ''); }
  writeFileSync(join(engineDir, 'Build', 'Build.version'), JSON.stringify({MajorVersion: 5, MinorVersion: 8, PatchVersion: 3}));
  const db = openDb(':memory:');
  let files = opts.files ?? [];
  const git = {head: async () => 'abc1234def5678', changedFiles: async () => files};
  const ctx = {db, dataDir, projectDir, git} as unknown as WorkerContext;
  const deps: CheckDeps = {
    unreal: () => createUnrealCmd(opts.engine === false ? {bin: join(root, 'no', 'UnrealEditor-Cmd.exe')}
      : {bin: process.execPath, baseArgs: [join(fakes, 'unreal-cmd.mjs')], engineDir}),
    build: () => opts.engine === false ? {bin: join(root, 'no', 'Build.bat')} : {bin: process.execPath, baseArgs: [join(fakes, 'unreal-build.mjs')]},
    launch: async exe => { mkdirSync(join(dirname(exe), 'Juego', 'Saved', 'Screenshots'), {recursive: true});
      writeFileSync(join(dirname(exe), 'Juego', 'Saved', 'Screenshots', 'HighresScreenshot00000.png'), 'png');
      return {exitCode: null, seconds: 30, killed: true}; },
    // ffmpeg falso por defecto: la hoja de contactos (hito 10) no depende del ffmpeg de la máquina
    ffmpeg: () => ({bin: process.execPath, baseArgs: [join(fakes, 'ffmpeg.mjs')]}),
    playSeconds: 0, ...opts.deps,
  };
  const handlers = createCheckHandlers(deps);
  const task = createTask(db, {title: 'HUD de vida', area: opts.area ?? 'ui', state: opts.state ?? 'probando'});
  const tree = insert<{id: string}>(db, 'worktrees', {taskId: task.id, path: projectDir, branch: 'nomos/hud', baseCommit: 'base000', state: 'active', closedReason: null});
  let implementer = startRun(db, {taskId: task.id, role: 'implementacion', provider: 'claude', metadata: {worktreeId: tree.id}});
  implementer = finishRun(db, implementer.id, 'done', 'Hecho');
  const run = (payload: object = {taskId: task.id}, id = randomUUID()) =>
    handlers['checks.run']({id, type: 'checks.run', payload, idempotencyKey: id} as unknown as Command, ctx) as Promise<Record<string, any>>;
  const events = (type: string) => listEvents(db, 0).filter(e => e.type === type).map(e => e.payload as Record<string, any>);
  return {db, ctx, root, dataDir, projectDir, task, implementer, run, events, handlers, deps,
    setFiles(next: string[]) { files = next; }, close() { db.close(); rmSync(root, {recursive: true, force: true}); }};
}
