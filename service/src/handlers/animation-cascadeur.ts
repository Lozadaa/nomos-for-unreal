import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler, WorkerContext } from '../runner.ts';
import type { Decision, Run, Task } from '../model.ts';
import { read } from '../repo/rows.ts';
import { requireTask, setTaskWait } from '../repo/tasks.ts';
import { finishRun, startRun } from '../repo/runs.ts';
import { updateRun } from '../repo/worker.ts';
import { addArtifact } from '../repo/artifacts.ts';
import { listDecisions, openDecision, resolveDecision } from '../repo/decisions.ts';
import { enqueue } from '../commands.ts';
import { saveCheck } from '../capability-checks.ts';
import { readConfig } from '../config.ts';
import { withEditor } from '../editor/queue.ts';
import { scripts } from '../checks/blueprint.ts';
import { findCascadeur, runJob, type Cascadeur } from '../adapters/cascadeur.ts';
import { unrealFor, type AssetDeps } from './asset-migrate.ts';
import { targetProject, type Project } from './asset-run.ts';

export type CascadeurDeps = AssetDeps & {cascadeur?: (ctx: WorkerContext) => Cascadeur | null};
/** Política (hito 5b): Cascadeur nunca por defecto; solo si falta el clip, el QA rechazó el retarget o lo pide el usuario. */
export const cascadeurReasons = ['clip_missing', 'retarget_rejected', 'user_request'];
const actions = ['cleanup', 'author', 'fix-retarget'];
type Payload = {taskId?: unknown; action?: unknown; sourceClip?: unknown; why?: unknown; notes?: unknown; targetProject?: unknown;
  mesh?: unknown; targetSkeleton?: unknown};
const game = (v: unknown): v is string => typeof v === 'string' && /^\/Game\/[\w/ .-]+$/.test(v) && !v.includes('..');
const short = (path: string) => path.split('/').at(-1)!.split('.')[0];
const plans = 'https://cascadeur.com/plans';

function parse(p: Payload) {
  if (!cascadeurReasons.includes(p.why as string)) throw new Error('cascadeur_not_justified');
  // `mesh`: el personaje sobre el que se comprueba el clip que vuelve (character.setup); sin él no hay QA posible
  if (typeof p.taskId !== 'string' || !actions.includes(p.action as string) || !game(p.sourceClip) || !game(p.mesh)
    || ![undefined, 'metahuman'].includes(p.targetSkeleton as string)) throw new Error('invalid_cascadeur_payload');
  return {taskId: p.taskId, action: p.action as string, clip: p.sourceClip, notes: typeof p.notes === 'string' ? p.notes : '',
    mesh: p.mesh, targetSkeleton: p.targetSkeleton as 'metahuman' | undefined};
}
const paths = (ctx: WorkerContext, run: Run) => {
  const dir = (name: string) => { const d = join(ctx.dataDir, 'cascadeur', name); mkdirSync(d, {recursive: true}); return d; };
  return {job: join(dir('jobs'), `${run.id}.json`), input: join(dir('in'), `${run.id}.fbx`), out: join(dir('out'), `${run.id}.fbx`),
    report: join(dir('jobs'), `${run.id}-informe.json`)};
};
const lastRun = (ctx: WorkerContext, commandId: string): Run | undefined => {
  const row = ctx.db.prepare(`select id from runs where json_extract(metadata,'$.commandId')=? order by rowid desc limit 1`).get(commandId);
  return row ? read<Run>(ctx.db, 'runs', row.id as string) : undefined;
};
const decisionOf = (ctx: WorkerContext, task: Task, commandId: string): Decision | undefined =>
  listDecisions(ctx.db).filter(d => d.taskId === task.id && d.evidence.some(e => e.kind === 'command' && e.ref === commandId)).at(-1);

/** El FBX vuelve a Unreal sobre el esqueleto del clip original; el clip nuevo se comprueba después con `animation`. */
async function importBack(ctx: WorkerContext, deps: CascadeurDeps, project: Project, task: Task, run: Run, spec: ReturnType<typeof parse>) {
  const p = paths(ctx, run), job = JSON.parse(readFileSync(p.job, 'utf8'));
  const result = await withEditor(ctx, project, run, async () => (await unrealFor(deps, ctx).runPython(project.uproject,
    join(scripts, 'kratos_import_anim.py'), {KRATOS_FBX: p.out, KRATOS_SKELETON: job.skeleton ?? '', KRATOS_DEST: '/Game/Kratos/Cascadeur',
      KRATOS_NAME: `${short(spec.clip)}_cascadeur`}, 10 * 60_000)).reportJson as Record<string, any> | undefined);
  if (result && 'deferred' in result) return result;
  const report = existsSync(p.report) ? JSON.parse(readFileSync(p.report, 'utf8')) : {manual: true};
  writeFileSync(p.report, JSON.stringify({...report, job, import: result ?? null}, null, 2), 'utf8');
  addArtifact(ctx.db, {taskId: task.id, runId: run.id, kind: 'report', path: p.report, provenance: {label: 'Cascadeur · informe', action: spec.action}});
  if (!result?.ok) {
    finishRun(ctx.db, run.id, 'failed', 'El FBX de Cascadeur no se pudo importar');
    return {ok: false, errors: result?.errors ?? ['sin informe de importación']};
  }
  updateRun(ctx.db, run.id, {waiting: false, phase: 'finished'});
  finishRun(ctx.db, run.id, 'done', `Clip de Cascadeur importado: ${result.clip}`);
  setTaskWait(ctx.db, task.id, null);
  // todo clip que vuelve pasa por la comprobación animation (vídeo y deformación); uno nuevo pide además la Decisión del
  // usuario, que character.setup abre solo si esa comprobación pasa
  enqueue(ctx.db, 'character.setup', {taskId: task.id, mesh: spec.mesh, ...(spec.targetSkeleton ? {targetSkeleton: spec.targetSkeleton} : {}),
    animations: [result.clip], ...(spec.action === 'author' ? {newClip: true} : {})}, `character.setup:${task.id}:cascadeur:${run.id}`);
  return {ok: true, clip: result.clip};
}

function waitExternally(ctx: WorkerContext, task: Task, run: Run, commandId: string, spec: ReturnType<typeof parse>, license: boolean, detail: string) {
  const out = paths(ctx, run).out;
  updateRun(ctx.db, run.id, {waiting: true, phase: 'waiting', question: detail});
  setTaskWait(ctx.db, task.id, `Esperando externo: Cascadeur (${spec.action})`);
  // la gratuita (Basic) importa y procesa sin ventana, pero bloquea la exportación FBX (comprobado en 2026.2.3)
  if (license) saveCheck(ctx.db, 'cascadeur', {state: 'roto', detail: `Plan Basic: solo guarda .casc; la exportación FBX exige Indie o Pro (${detail})`});
  const guion = `1. ${license ? 'Activa en Cascadeur una licencia con exportación FBX (la gratuita y la de prueba solo guardan .casc)' : 'Abre Cascadeur'}. `
    + `2. Importa ${paths(ctx, run).input} y aplica ${spec.action} (Commands › Kratos › ${spec.action}). 3. Revisa el resultado. `
    + `4. File › Export Fbx › Without Meshes, FbxUpAxis Z, ASCII off. 5. Guárdalo como ${out}: Kratos sigue solo.`;
  openDecision(ctx.db, {taskId: task.id, reason: license ? `Cascadeur sin exportación FBX por licencia: ${detail}` : `Cascadeur no terminó solo: ${detail}`,
    evidence: [{kind: 'command', ref: commandId}], options: [{id: 'manual', label: license ? 'Exportar a mano' : 'Hacerlo en Cascadeur', description: guion},
      {id: 'retarget', label: 'Usar solo retarget', description: 'Seguir con el clip retargeteado, sin Cascadeur'},
      ...(license ? [{id: 'license', label: 'Activar licencia', description: `Activa Indie o Pro (${plans}) y Kratos vuelve a lanzar el trabajo`}] : [])]});
  return {deferred: true, reason: `Esperando externo: Cascadeur (${spec.action})`};
}

/**
 * `animation.cascadeur` (hito 5b, carril largo): Unreal exporta el clip a FBX, Cascadeur lo procesa sin ventana y el FBX
 * vuelve a Unreal. Sin flag o sin licencia, la run espera con Decisión y guion; el FBX que aparezca en `out/` la reanuda.
 */
export function createAnimationCascadeur(deps: CascadeurDeps = {}): Handler {
  return async (command, ctx) => {
    const spec = parse(command.payload as Payload), task = requireTask(ctx.db, spec.taskId);
    const project = targetProject(ctx, (command.payload as Payload).targetProject);
    const previous = lastRun(ctx, command.id);
    if (previous?.state === 'running' && previous.metadata.waiting) {
      const decision = decisionOf(ctx, task, command.id);
      if (existsSync(paths(ctx, previous).out)) {
        if (decision?.state === 'open') try { resolveDecision(ctx.db, decision.id, 'manual', 'kratos'); } catch { /* caducada: da igual */ }
        // la run sigue «esperando» hasta importar: si el editor está ocupado, el reintento vuelve aquí y nunca re-exporta
        return importBack(ctx, deps, project, task, previous, spec);
      }
      // con la licencia ya activada, el trabajo se repite desde la exportación de Unreal en una run nueva
      if (decision?.state === 'resolved' && decision.chosenOptionId === 'license') finishRun(ctx.db, previous.id, 'cancelled', 'Reintento con licencia');
      else if (decision?.state === 'resolved' && decision.chosenOptionId === 'retarget') {
        finishRun(ctx.db, previous.id, 'cancelled', 'Se usa solo el retarget');
        setTaskWait(ctx.db, task.id, null);
        return {fallback: 'retarget'};
      }
      else return {deferred: true, reason: `Esperando externo: Cascadeur (${spec.action})`};
    }
    const run = previous?.state === 'running' && !previous.metadata.waiting ? previous
      : startRun(ctx.db, {taskId: task.id, role: 'animacion', provider: 'kratos', metadata: {commandId: command.id, kind: 'cascadeur'}});
    const p = paths(ctx, run);
    const exported = await withEditor(ctx, project, run, async () => (await unrealFor(deps, ctx).runPython(project.uproject,
      join(scripts, 'kratos_export_fbx.py'), {KRATOS_CLIP: spec.clip, KRATOS_FBX: p.input}, 10 * 60_000)).reportJson as Record<string, any> | undefined);
    if (exported && 'deferred' in exported) return exported;
    if (!exported?.ok) { finishRun(ctx.db, run.id, 'failed', 'Unreal no exportó el clip a FBX'); return {ok: false, errors: exported?.errors ?? []}; }
    writeFileSync(p.job, JSON.stringify({action: spec.action, notes: spec.notes, input_fbx: p.input, output_fbx: p.out, report: p.report,
      skeleton: exported.skeleton, export: {up_axis: 'Z', mode: 'Binary', meshes: false}}, null, 2), 'utf8');
    // crear un clip nuevo no se hace por script (el job solo limpia y reexporta): siempre con el animador en Cascadeur
    if (spec.action === 'author') return waitExternally(ctx, task, run, command.id, spec, false, 'crear un clip nuevo es trabajo de animador en Cascadeur');
    const csc = deps.cascadeur ? deps.cascadeur(ctx) : findCascadeur((readConfig(ctx.dataDir) as Record<string, unknown>).cascadeurPath);
    if (csc) await runJob(csc, p.job).catch(() => null);
    const report = existsSync(p.report) ? JSON.parse(readFileSync(p.report, 'utf8')) : null;
    if (report?.ok && existsSync(p.out)) return importBack(ctx, deps, project, task, run, spec);
    const detail = !csc ? 'Cascadeur no está instalado' : report?.errors?.[0] ?? 'el job no dejó informe (sin --run-python-code o con ventana)';
    return waitExternally(ctx, task, run, command.id, spec, report?.needs === 'license', detail);
  };
}
