import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { WorkerContext } from './runner.ts';
import type { Artifact, Run, Task, TestRun, Worktree } from './model.ts';
import { filtered, read } from './repo/rows.ts';
import { listEvents } from './store.ts';
import { agentName } from './attribution.ts';

export type Manifest = {taskId: string; createdAt: string; files: Record<string, {sha256: string; size: number}>};
/** Escritor inyectable: las pruebas simulan el disco lleno (`ENOSPC`). */
export type ArchiveWriter = {write(path: string, data: string | Buffer): void; copy(from: string, to: string): void};
const disk: ArchiveWriter = {write: (path, data) => writeFileSync(path, data), copy: (from, to) => copyFileSync(from, to)};
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const listInformes = (dir: string) => readdirSync(join(dir, 'informes')).map(name => `informes/${name}`);
const chat = (type: string) => ['worker.output', 'worker.message_sent', 'worker.waiting'].includes(type) || /^(message|reply)\./.test(type);

export const archiveDir = (ctx: Pick<WorkerContext, 'dataDir'>, taskId: string) => join(ctx.dataDir, 'archive', taskId);

/** Relee cada archivo del manifest y compara tamaño y SHA-256. */
export function verifyArchive(dir: string): Manifest | null {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
    for (const [name, entry] of Object.entries(manifest.files)) {
      const data = readFileSync(join(dir, name));
      if (data.length !== entry.size || sha(data) !== entry.sha256) return null;
    }
    return manifest;
  } catch { return null; }
}

function summary(task: Task, runs: Run[], commits: {sha: string; subject: string}[], tests: TestRun[]): string {
  const roles = Object.entries(task.attribution ?? {}).map(([role, list]) =>
    `- ${role}: ${list.map(e => `${e.agentName} (${e.provider}, run ${e.runId.slice(0, 8)})`).join(', ')}`);
  return [`# ${task.title}`, '', task.spec, '', '## Criterios', ...task.acceptance.map((a, i) => `${i + 1}. ${a}`), '',
    '## Quién hizo qué', ...(roles.length ? roles : ['- (sin atribución)']), '',
    '## Runs', ...runs.map(r => `- ${r.role} · ${r.provider} · intento ${r.attempt} · ${r.state}${r.summary ? ` · ${r.summary.split('\n')[0]}` : ''}`), '',
    '## Commits', ...(commits.length ? commits.map(c => `- ${c.sha.slice(0, 7)} ${c.subject}`) : ['- (ninguno)']), '',
    '## Pruebas', ...(tests.length ? tests.map(t => `- ${t.checkId ?? 'prueba'}: ${t.result}`) : ['- (ninguna)']), ''].join('\n');
}

/** Preserva la tarea en `<dataDir>/archive/<taskId>/` antes de retirar nada: se escribe en `.tmp`, se verifica y se renombra.
 *  Si falta espacio, borra lo parcial y lanza `archive_no_space`. Reentrante: un archivo ya verificado se conserva. */
export async function preserveTask(ctx: WorkerContext, task: Task, writer: ArchiveWriter = disk): Promise<{dir: string; manifest: Manifest}> {
  const dir = archiveDir(ctx, task.id), tmp = dir + '.tmp';
  const existing = existsSync(dir) ? verifyArchive(dir) : null;
  if (existing) return {dir, manifest: existing};
  const tree = task.worktreeId ? read<Worktree>(ctx.db, 'worktrees', task.worktreeId) : undefined;
  const runs = filtered<Run>(ctx.db, 'runs', {taskId: task.id});
  const events = listEvents(ctx.db, 0).filter(e => e.payload.taskId === task.id);
  const files: Record<string, string | Buffer> = {
    'conversacion.jsonl': events.filter(e => chat(e.type)).map(e => JSON.stringify(e)).join('\n') + '\n',
    'eventos.jsonl': events.map(e => JSON.stringify(e)).join('\n') + '\n',
    'diff-final.patch': tree?.baseCommit && existsSync(tree.path) ? (await ctx.git.diff(tree.path, tree.baseCommit)).patch : '',
    'sesiones.json': JSON.stringify(runs.filter(r => r.sessionRef || r.metadata.worktreeId).map(r => ({runId: r.id, role: r.role,
      provider: r.provider, agentName: agentName(r.role, task.area), sessionRef: r.sessionRef, worktreeId: r.metadata.worktreeId ?? null})), null, 2) + '\n',
    'resumen.md': summary(task, runs, tree?.baseCommit && existsSync(tree.path) ? await ctx.git.log(tree.path, tree.baseCommit) : [],
      filtered<TestRun>(ctx.db, 'test_runs', {taskId: task.id})),
  };
  rmSync(tmp, {recursive: true, force: true});
  try {
    mkdirSync(join(tmp, 'informes'), {recursive: true});
    const manifest: Manifest = {taskId: task.id, createdAt: new Date().toISOString(), files: {}};
    for (const [name, data] of Object.entries(files)) writer.write(join(tmp, name), data);
    for (const a of filtered<Artifact>(ctx.db, 'artifacts', {taskId: task.id}).filter(a => a.kind === 'report' || a.kind === 'screenshot')) {
      const source = isAbsolute(a.path) ? a.path : join(ctx.dataDir, 'artifacts', a.path);
      if (existsSync(source) && statSync(source).isFile()) writer.copy(source, join(tmp, 'informes', `${a.id.slice(0, 8)}-${basename(source)}`));
    }
    for (const name of [...Object.keys(files), ...listInformes(tmp)]) {
      const data = readFileSync(join(tmp, name));
      manifest.files[name] = {sha256: sha(data), size: data.length};
    }
    writer.write(join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (!verifyArchive(tmp)) throw new Error('archive_unverified');
    rmSync(dir, {recursive: true, force: true});
    renameSync(tmp, dir);
    return {dir, manifest};
  } catch (error) {
    rmSync(tmp, {recursive: true, force: true});
    if ((error as NodeJS.ErrnoException).code === 'ENOSPC') throw new Error('archive_no_space');
    throw error;
  }
}
