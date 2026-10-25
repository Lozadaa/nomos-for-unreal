import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { WorkerContext } from '../runner.ts';
import type { Artifact, JsonValue, Run, Task, TestRun } from '../model.ts';
import type { Project } from '../handlers/asset-run.ts';
import { createUnrealCmd, type UnrealCmd } from '../adapters/unreal-cmd.ts';
import { engineDirOf, type BuildOpts } from '../adapters/unreal-build.ts';
import { assetConfig } from '../catalog/paths.ts';
import { addArtifact, recordTestRun, updateTestRun } from '../repo/artifacts.ts';
import { appendEvent } from '../store.ts';
import type { CheckId } from './select.ts';
import { checkArtifactLabel, checkReportLabel } from '../artifact-label.ts';
import { readConfig, visualTolerance } from '../config.ts';
import { compareBaseline } from './visual.ts';
import { findFfmpeg, type Ffmpeg } from '../adapters/ffmpeg.ts';

export type CheckDeps = {
  unreal?: (ctx: WorkerContext) => UnrealCmd; build?: (ctx: WorkerContext) => BuildOpts;
  /** Arranca el ejecutable empaquetado y lo cierra al cabo de `ms`; en pruebas se sustituye. */
  launch?: (exe: string, args: string[], ms: number) => Promise<Launch | void>;
  /** Segundos de juego antes de capturar (30 en el plan; las pruebas usan 0). */
  playSeconds?: number;
  /** ffmpeg para el vídeo de la comprobación animation (hito 5b); null = no está. */
  ffmpeg?: (ctx: WorkerContext) => Ffmpeg | null;
  /** Hito 19: bytes libres en la unidad del proyecto (en pruebas se fija). */
  freeBytes?: (dir: string) => number;
};
/** Vida del ejecutable: `killed` = Nomos lo cerró al acabar su tiempo; si no, terminó solo a los `seconds`. */
export type Launch = {exitCode: number | null; seconds: number; killed: boolean; error?: string};
export type CheckInput = {task: Task; run: Run; implementer: Run; project: Project; files: string[]; worktree: string};
export type Outcome = {
  /** `running`: la máquina terminó y falta un juicio posterior (QA visual del ciclo UMG). */
  result: 'passed' | 'failed' | 'skipped' | 'unavailable' | 'running'; log: string; summary: string[];
  /** `mapDefault`: nadie eligió el mapa (ni el diff ni el recorrido); es el que el juego carga por defecto. */
  map?: string | null; mapDefault?: boolean; config?: string | null; engine?: string | null; blocking?: string[];
  artifacts?: {kind: Artifact['kind']; path: string; provenance?: Record<string, JsonValue>; previewPath?: string}[];
};
export type Executor = (ctx: WorkerContext, input: CheckInput & {dir: string}, deps: CheckDeps) => Promise<Outcome>;

export const unrealOf = (ctx: WorkerContext, deps: CheckDeps) => deps.unreal?.(ctx) ?? createUnrealCmd({bin: assetConfig(ctx.dataDir).unrealPath});
export const ffmpegOf = (ctx: WorkerContext, deps: CheckDeps) => deps.ffmpeg ? deps.ffmpeg(ctx) : findFfmpeg((readConfig(ctx.dataDir) as Record<string, unknown>).ffmpegPath);
export const buildOf = (ctx: WorkerContext, deps: CheckDeps): BuildOpts => deps.build?.(ctx) ?? {engineDir: engineDirOf(assetConfig(ctx.dataDir).unrealPath)};
/** Resumen del evento (Review Focus 3): el titular y después las líneas con «error» (30 en total); sin errores, las 30 primeras. */
export const summarize = (lines: string[]) => [lines[0], ...lines.slice(1).filter(l => /error/i.test(l) || !lines.some(m => /error/i.test(m)))]
  .filter(l => l !== undefined).slice(0, 30);

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
      ? {result: 'unavailable', log, summary: [`Motor de Unreal no encontrado: revisa unrealPath en .nomos/config.json`]}
      : message === 'unreal_timeout'
        ? {result: 'failed', log, summary: ['Tiempo máximo agotado: se cerró el editor', ...log.split(/\r?\n/).filter(l => /error/i.test(l))]}
        : {result: 'failed', log, summary: [`Error al ejecutar la comprobación: ${message}`]};
  }
  if (['umg', 'build', 'map'].includes(id) && ['passed', 'running'].includes(outcome.result)) outcome = visualCheck(ctx, id, dir, outcome);
  const logPath = join(dir, 'log.txt');
  writeFileSync(logPath, `${outcome.summary.join('\n')}\n\n${outcome.log}`, 'utf8');
  addArtifact(db, {taskId: input.task.id, runId: input.run.id, kind: 'report', path: logPath,
    provenance: {check: id, testRunId: row.id, result: outcome.result, implementerRunId: input.implementer.id, label: checkReportLabel(id)}}, ctx.dataDir);
  for (const artifact of outcome.artifacts ?? [])
    addArtifact(db, {taskId: input.task.id, runId: input.run.id, kind: artifact.kind, path: artifact.path,
      provenance: {check: id, testRunId: row.id, ...artifact.provenance,
        label: (artifact.provenance?.label as string | undefined) ?? checkArtifactLabel(id, artifact.kind, artifact.path, artifact.provenance as Record<string, unknown>)},
      previewPath: artifact.previewPath ?? null}, ctx.dataDir);
  row = updateTestRun(db, row.id, {result: outcome.result, reportPath: logPath, map: outcome.map ?? null, config: outcome.config ?? null,
    engineVersion: outcome.engine?.split('-')[0] ?? engine});
  appendEvent(db, `test.${outcome.result}`, null, {testRunId: row.id, taskId: row.taskId, runId: row.runId, check: id,
    summary: summarize(outcome.summary).join('\n'), logPath, ...(outcome.blocking ? {blocking: outcome.blocking} : {})});
  return row;
}

/** Regresión visual (hito 7) de cada captura contra `<juego>/docs/baseline/<check>-[<mapa>-]<captura>.png`. */
function visualCheck(ctx: WorkerContext, id: CheckId, dir: string, outcome: Outcome): Outcome {
  const tolerance = visualTolerance(readConfig(ctx.dataDir)), lines: string[] = [], extra: NonNullable<Outcome['artifacts']> = [];
  let failed = false;
  // hito 10: solo la vista del jugador tiene línea base; las del rig y la hoja de contactos no se comparan
  const judged = (a: NonNullable<Outcome['artifacts']>[number]) => a.kind === 'screenshot' && !a.provenance?.sheet && (!a.provenance?.view || a.provenance.view === 'player');
  for (const shot of (outcome.artifacts ?? []).filter(judged)) {
    const base = basename(shot.path, extname(shot.path)).replace(/^HighresScreenshot\d+$/i, '1280x720');
    // hito 5b: la línea base es de un mapa; un build o un PIE de otro mapa se compara con la suya (o la crea)
    const map = ['map', 'build'].includes(id) && outcome.map ? `${outcome.map.split('/').at(-1)}-` : '';
    const shotName = base.startsWith(`${id}-`) ? base.slice(id.length + 1) : base, name = `${id}-${map}${shotName}`;
    try {
      // la línea base sin mapa de antes es la del mapa por defecto: se adopta renombrándola, no se pierde
      const dirBase = join(ctx.projectDir, 'docs', 'baseline'), legacy = join(dirBase, `${id}-${shotName}.png`);
      if (map && outcome.mapDefault && existsSync(legacy) && !existsSync(join(dirBase, `${name}.png`))) {
        renameSync(legacy, join(dirBase, `${name}.png`));
        lines.push(`Línea base sin mapa adoptada para ${map.slice(0, -1)}: ${name}`);
      }
      const visual = compareBaseline(shot.path, dirBase, name, tolerance, join(dir, `${name}-diferencia.png`));
      lines.push(visual.summary);
      shot.provenance = {...shot.provenance, visual: visual.result, baseline: visual.baseline, ...(visual.ratio === null ? {} : {visualRatio: Number(visual.ratio.toFixed(4))})};
      if (visual.result === 'failed') failed = true;
      if (visual.diff) extra.push({kind: 'screenshot', path: visual.diff, provenance: {...shot.provenance, visual: 'diff', source: shot.path}});
    } catch (error) { lines.push(`${name}: no se pudo comparar (${error instanceof Error ? error.message : String(error)})`); }
  }
  if (!lines.length) return outcome;
  return {...outcome, result: failed ? 'failed' : outcome.result, artifacts: [...(outcome.artifacts ?? []), ...extra],
    summary: failed ? [...lines.filter(l => /difiere|mide|adoptada/.test(l)), ...outcome.summary] : [...outcome.summary, ...lines]};
}
