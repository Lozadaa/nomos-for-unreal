import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler, WorkerContext } from '../runner.ts';
import type { Decision, Run, Task } from '../model.ts';
import { read } from '../repo/rows.ts';
import { requireTask, setTaskWait } from '../repo/tasks.ts';
import { finishRun, startRun } from '../repo/runs.ts';
import { updateRun } from '../repo/worker.ts';
import { addArtifact } from '../repo/artifacts.ts';
import { listDecisions, openDecision } from '../repo/decisions.ts';
import { appendEvent } from '../store.ts';
import { withEditor } from '../editor/queue.ts';
import { scripts } from '../checks/blueprint.ts';
import { unrealFor, type AssetDeps } from './asset-migrate.ts';
import { targetProject } from './asset-run.ts';

type Step = {step: string; ok: boolean; detail: string};
type Report = {ok: boolean; name: string; steps: Step[]; blueprint: string | null; needs: 'plugin' | 'cloud' | 'gui' | null; errors: string[]};

/** Guion de 5 pasos para crear el MetaHuman a mano cuando el editor por lotes no puede (Review Focus 5). */
function script(name: string, needs: Report['needs']): string {
  return [`1. ${needs === 'plugin' ? 'Activa el plugin MetaHumanCharacter (Edit › Plugins) y reinicia el editor' : 'Abre el proyecto en el editor de Unreal'}.`,
    `2. En el Content Browser: clic derecho › MetaHuman › MetaHuman Character, llámalo ${name}.`,
    '3. Ábrelo, elige cuerpo y cara (inicia sesión en MetaHuman si lo pide) y pulsa Auto-Rig.',
    `4. Assemble con la canalización Optimized en /Game/MetaHumans/${name}.`,
    `5. Avisa a Kratos: kratos asset character /Game/MetaHumans/${name}/BP_${name} --metahuman.`].join(' ');
}

const openRun = (ctx: WorkerContext, commandId: string): Run | undefined => {
  const row = ctx.db.prepare(`select id from runs where json_extract(metadata,'$.commandId')=? order by rowid desc limit 1`).get(commandId);
  return row ? read<Run>(ctx.db, 'runs', row.id as string) : undefined;
};
const decisionOf = (ctx: WorkerContext, task: Task, commandId: string): Decision | undefined =>
  listDecisions(ctx.db).filter(d => d.taskId === task.id && d.evidence.some(e => e.kind === 'command' && e.ref === commandId)).at(-1);

/**
 * `character.metahuman` (hito 5b): crea y ensambla un MetaHuman por script en el editor por lotes
 * (`MetaHumanCharacterEditorSubsystem`). Si un paso necesita el plugin, la nube o la GUI, la run queda esperando y se abre
 * Decisión con guion; nunca se da por hecho un MetaHuman que no existe.
 */
export function createCharacterMetahuman(deps: AssetDeps = {}): Handler {
  return async (command, ctx) => {
    const payload = command.payload as {taskId?: unknown; name?: unknown; targetProject?: unknown};
    if (typeof payload.taskId !== 'string' || typeof payload.name !== 'string' || !/^[A-Za-z][\w]{1,40}$/.test(payload.name))
      throw new Error('invalid_metahuman_payload');
    const task = requireTask(ctx.db, payload.taskId), project = targetProject(ctx, payload.targetProject), name = payload.name;
    const previous = openRun(ctx, command.id), decision = decisionOf(ctx, task, command.id);
    if (previous && decision?.state === 'open') return {deferred: true, reason: `Esperando decisión: ${decision.reason}`};
    if (previous?.state === 'running' && decision?.state === 'resolved') {
      const assisted = decision.chosenOptionId === 'editor';
      finishRun(ctx.db, previous.id, 'cancelled', assisted ? 'Se crea a mano en el editor (guion)' : 'Se usa el maniquí del motor');
      setTaskWait(ctx.db, task.id, assisted ? 'Esperando al usuario: MetaHuman en el editor' : null);
      return assisted ? {assisted: true} : {fallback: 'engine'};
    }
    const run = previous?.state === 'running' ? previous
      : startRun(ctx.db, {taskId: task.id, role: 'animacion', provider: 'unreal', attempt: (previous?.attempt ?? 0) + 1, metadata: {commandId: command.id, kind: 'metahuman'}});
    const outcome = await withEditor(ctx, project, run, async () => {
      const {reportJson, exitCode} = await unrealFor(deps, ctx).runPython(project.uproject, join(scripts, 'kratos_metahuman.py'),
        {KRATOS_NAME: name, KRATOS_DEST: '/Game/MetaHumans'}, 10 * 60_000);
      return (reportJson as Report | undefined) ?? {ok: false, name, steps: [], blueprint: null, needs: 'gui',
        errors: [`El editor terminó con código ${exitCode} sin el informe`]} as Report;
    });
    if ('deferred' in outcome) return outcome;
    const dir = join(ctx.dataDir, 'artifacts', 'reports');
    mkdirSync(dir, {recursive: true});
    const path = join(dir, `metahuman-${run.id}.json`);
    writeFileSync(path, JSON.stringify(outcome, null, 2), 'utf8');
    addArtifact(ctx.db, {taskId: task.id, runId: run.id, kind: 'report', path, provenance: {label: 'MetaHuman · informe', name}});
    if (outcome.ok && outcome.blueprint) {
      finishRun(ctx.db, run.id, 'done', `MetaHuman ${name} creado y ensamblado por script`);
      appendEvent(ctx.db, 'metahuman.created', null, {taskId: task.id, runId: run.id, blueprint: outcome.blueprint});
      return {ok: true, blueprint: outcome.blueprint};
    }
    const failed = outcome.steps.find(s => !s.ok)?.detail ?? outcome.errors[0] ?? 'paso desconocido';
    updateRun(ctx.db, run.id, {waiting: true, phase: 'waiting', question: failed});
    setTaskWait(ctx.db, task.id, `Esperando externo: crear el MetaHuman ${name} en el editor`);
    openDecision(ctx.db, {taskId: task.id, reason: `MetaHuman por script no terminó: ${failed}`,
      evidence: [{kind: 'command', ref: command.id}, ...outcome.steps.map(s => ({kind: s.step, ref: s.ok ? 'ok' : s.detail}))],
      options: [{id: 'editor', label: 'Crearlo en el editor', description: script(name, outcome.needs)},
        {id: 'engine', label: 'Usar maniquí del motor', description: 'Seguir con Manny, sin MetaHuman propio'}]});
    return {deferred: true, reason: `Esperando externo: ${failed}`};
  };
}
