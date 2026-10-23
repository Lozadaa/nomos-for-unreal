import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkerContext } from '../runner.ts';
import type { Artifact, JsonValue, Run, Task, TestRun } from '../model.ts';
import type { Project } from '../handlers/asset-run.ts';
import { createUnrealCmd, type UnrealCmd } from '../adapters/unreal-cmd.ts';
import { engineDirOf, type BuildOpts } from '../adapters/unreal-build.ts';
import { assetConfig } from '../catalog/paths.ts';
import { addArtifact, recordTestRun, updateTestRun } from '../repo/artifacts.ts';
import { appendEvent } from '../store.ts';
import type { CheckId } from './select.ts';

export type CheckDeps = {
  unreal?: (ctx: WorkerContext) => UnrealCmd; build?: (ctx: WorkerContext) => BuildOpts;
  /** Arranca el ejecutable empaquetado y lo cierra al cabo de `ms`; en pruebas se sustituye. */
  launch?: (exe: string, args: string[], ms: number) => Promise<void>;
  /** Segundos de juego antes de capturar (30 en el plan; las pruebas usan 0). */
  playSeconds?: number;
};
export type CheckInput = {task: Task; run: Run; implementer: Run; project: Project; files: string[]; worktree: string};
export type Outcome = {
  result: 'passed' | 'failed' | 'skipped' | 'unavailable'; log: string; summary: string[];
  map?: string | null; config?: string | null; engine?: string | null; blocking?: string[];
  artifacts?: {kind: Artifact['kind']; path: string; provenance?: Record<string, JsonValue>}[];
};
export type Executor = (ctx: WorkerContext, input: CheckInput & {dir: string}, deps: CheckDeps) => Promise<Outcome>;

export const unrealOf = (ctx: WorkerContext, deps: CheckDeps) => deps.unreal?.(ctx) ?? createUnrealCmd({bin: assetConfig(ctx.dataDir).unrealPath});
export const buildOf = (ctx: WorkerContext, deps: CheckDeps): BuildOpts => deps.build?.(ctx) ?? {engineDir: engineDirOf(assetConfig(ctx.dataDir).unrealPath)};
/** Resumen del evento (Review Focus 3): las 30 primeras líneas con «error»; si no hay, las 30 primeras del resumen. */
export const summarize = (lines: string[]) => (lines.some(l => /error/i.test(l)) ? lines.filter(l => /error/i.test(l)) : lines).slice(0, 30);

async function commitOf(ctx: WorkerContext, dir: string): Promise<string | null> {
  try { return await ctx.git.head(dir); } catch { return null; }
}

/** pending (la fila que el lote dejó preparada, o una nueva) → running → resultado, con log completo en `<dataDir>/artifacts/tests/<id>/log.txt` y evento `test.<resultado>`. */
export async function runCheck(id: CheckId, execute: Executor, ctx: WorkerContext, input: CheckInput, deps: CheckDeps = {},
  pending?: TestRun): Promise<TestRun> {
  const {db} = ctx;
  const engine = unrealOf(ctx, deps).engineVersion();
  const commit = await commitOf(ctx, input.worktree);
  let row = pending ? updateTestRun(db, pending.id, {commit, engineVersion: engine})
    : recordTestRun(db, {taskId: input.task.id, runId: input.run.id, checkId: id, result: 'pending', commit, engineVersion: engine});
  const dir = join(ctx.dataDir, 'artifacts', 'tests', row.id);
  mkdirSync(dir, {recursive: true});
  row = updateTestRun(db, row.id, {result: 'running'});
  appendEvent(db, 'test.running', null, {testRunId: row.id, taskId: row.taskId, runId: row.runId, check: id});
  let outcome: Outcome;
  try { outcome = await execute(ctx, {...input, dir}, deps); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const log = (error as {log?: string}).log ?? '';
    outcome = message === 'unreal_missing'
      ? {result: 'unavailable', log, summary: [`Motor de Unreal no encontrado: revisa unrealPath en .kratos/config.json`]}
      : message === 'unreal_timeout'
        ? {result: 'failed', log, summary: ['Tiempo máximo agotado: se cerró el editor', ...log.split(/\r?\n/).filter(l => /error/i.test(l))]}
        : {result: 'failed', log, summary: [`Error al ejecutar la comprobación: ${message}`]};
  }
  const logPath = join(dir, 'log.txt');
  writeFileSync(logPath, `${outcome.summary.join('\n')}\n\n${outcome.log}`, 'utf8');
  addArtifact(db, {taskId: input.task.id, runId: input.run.id, kind: 'report', path: logPath,
    provenance: {check: id, testRunId: row.id, result: outcome.result, implementerRunId: input.implementer.id}});
  for (const artifact of outcome.artifacts ?? [])
    addArtifact(db, {taskId: input.task.id, runId: input.run.id, kind: artifact.kind, path: artifact.path,
      provenance: {check: id, testRunId: row.id, ...artifact.provenance}});
  row = updateTestRun(db, row.id, {result: outcome.result, reportPath: logPath, map: outcome.map ?? null, config: outcome.config ?? null,
    engineVersion: outcome.engine?.split('-')[0] ?? engine});
  appendEvent(db, `test.${outcome.result}`, null, {testRunId: row.id, taskId: row.taskId, runId: row.runId, check: id,
    summary: summarize(outcome.summary).join('\n'), logPath, ...(outcome.blocking ? {blocking: outcome.blocking} : {})});
  return row;
}
