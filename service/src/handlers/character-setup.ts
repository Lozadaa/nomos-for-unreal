import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Handler, WorkerContext } from '../runner.ts';
import type { Artifact, Task, TestRun } from '../model.ts';
import { filtered } from '../repo/rows.ts';
import { blockTask, requireTask, setTaskWait } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { openDecision } from '../repo/decisions.ts';
import { appendEvent } from '../store.ts';
import { withEditor } from '../editor/queue.ts';
import { runCheck, type CheckDeps } from '../checks/run.ts';
import { animationCheck, specFile, type CharacterSpec } from '../checks/animation.ts';
import { commandRun, targetProject } from './asset-run.ts';

type Payload = {taskId?: unknown; mesh?: unknown; animations?: unknown; targetSkeleton?: unknown; targetProject?: unknown; newClip?: unknown};
const gamePath = (v: unknown): v is string => typeof v === 'string' && /^\/Game\/[\p{L}\p{N}_ /.-]+$/u.test(v) && !v.includes('..');

function parse(p: Payload): CharacterSpec & {taskId: string} {
  // un clip por comprobación: animation captura y graba un solo clip, y el resto quedaría aprobado sin verlo
  if (typeof p.taskId !== 'string' || !gamePath(p.mesh) || !Array.isArray(p.animations) || p.animations.length !== 1
    || !p.animations.every(gamePath) || ![undefined, 'metahuman'].includes(p.targetSkeleton as string)) throw new Error('invalid_character_payload');
  return {taskId: p.taskId, mesh: p.mesh, animations: p.animations as string[], ...(p.targetSkeleton ? {targetSkeleton: 'metahuman' as const} : {})};
}

/** Review Focus 1: cadenas principales sin mapear → guion para hacerlo a mano en el editor; la tarea no avanza sola. */
function manualRetarget(ctx: WorkerContext, task: Task, row: TestRun, summary: string) {
  const report = filtered<Artifact>(ctx.db, 'artifacts', {taskId: task.id, kind: 'report'})
    .find(a => (a.provenance as Record<string, unknown>)?.testRunId === row.id && (a.provenance as Record<string, unknown>)?.label === 'Retarget · informe');
  const retarget = report ? JSON.parse(readFileSync(report.path, 'utf8')) : {};
  const rtg = typeof retarget.retargeter === 'string' ? retarget.retargeter.split('.')[0] : 'el IK Retargeter de /Game/Kratos/Retarget';
  openDecision(ctx.db, {taskId: task.id, reason: `${summary}: la animación no se aprueba rota`,
    evidence: [{kind: 'test', ref: row.id}, ...(retarget.critical_unmapped ?? []).map((c: string) => ({kind: 'cadena', ref: c}))],
    options: [{id: 'manual', label: 'Retarget a mano', description: `1. Abre ${rtg} en el editor. 2. En Chain Mapping empareja ${(retarget.critical_unmapped ?? []).join(', ')} (o elige un personaje que tenga esas cadenas). `
      + '3. Comprueba la pose en el visor del retargeter. 4. Guarda. 5. Vuelve a lanzar character.setup.'},
      {id: 'engine', label: 'Usar maniquí del motor', description: 'Cambiar el personaje por Manny, que comparte esqueleto con los clips de las plantillas'}]});
}

/**
 * `character.setup` (hito 5b, carril largo): con el editor reservado, monta el personaje con sus clips (retarget si hace falta)
 * y pasa la comprobación `animation`: PIE a dos resoluciones, deformación y vídeo. Deja la ficha `kratos-personaje.json` para
 * que `checks.run` la repita sobre el diff. Nunca aprueba una animación rota: bloquea o abre Decisión.
 */
export function createCharacterSetup(deps: CheckDeps = {}): Handler {
  return async (command, ctx) => {
    const spec = parse(command.payload as Payload), payload = command.payload as Payload;
    const task = requireTask(ctx.db, spec.taskId), project = targetProject(ctx, payload.targetProject);
    if (!existsSync(join(project.dir, 'Content', `${spec.mesh.slice('/Game/'.length)}.uasset`))) {
      const migrating = ctx.db.prepare("select 1 from commands where type='asset.migrate' and state in ('pending','running') limit 1").get();
      if (!migrating) throw new Error('character_mesh_missing');
      setTaskWait(ctx.db, task.id, 'Esperando migración del personaje');
      return {deferred: true, reason: 'Esperando migración del personaje'};
    }
    const {run} = commandRun(ctx, command, {title: task.title, provider: 'unreal', role: 'animacion', taskId: task.id, metadata: {kind: 'character'}});
    const {taskId: _, ...file} = spec;
    writeFileSync(join(project.dir, specFile), JSON.stringify(file, null, 2) + '\n', 'utf8');
    const input = {task, run, implementer: run, project, files: [], worktree: project.dir};
    const row = await withEditor(ctx, project, run, () => runCheck('animation', animationCheck(file), ctx, input, deps));
    if ('deferred' in row) {
      setTaskWait(ctx.db, task.id, `Esperando editor · ${row.reason}`);
      return row;
    }
    const event = ctx.db.prepare(`select payload from events where type like 'test.%' and json_extract(payload,'$.testRunId')=? order by seq desc limit 1`).get(row.id);
    const summary = event ? String(JSON.parse(event.payload as string).summary ?? '').split('\n')[0] : '';
    if (row.result === 'passed') {
      finishRun(ctx.db, run.id, 'done', summary || 'Personaje animado y comprobado');
      // el bloqueo lo puso una comprobación anterior de esta misma orden de trabajo: con esta en verde, sobra
      ctx.db.prepare("update tasks set blocked_reason=null,updated_at=? where id=? and blocked_reason like 'Animación rota%'").run(new Date().toISOString(), task.id);
      appendEvent(ctx.db, 'character.ready', null, {taskId: task.id, runId: run.id, testRunId: row.id, mesh: spec.mesh});
      // un clip nuevo de Cascadeur es una elección creativa: se pregunta ya con su vídeo y su comprobación en verde
      if (payload.newClip === true) openDecision(ctx.db, {taskId: task.id, reason: `Clip nuevo de Cascadeur: ${spec.animations[0].split('/').at(-1)} · míralo en Entregas`,
        evidence: [{kind: 'test', ref: row.id}], options: [{id: 'approve', label: 'Usar este clip', description: 'Visto el vídeo de dos ángulos en Entregas'},
          {id: 'discard', label: 'Descartarlo', description: 'Volver al clip del catálogo'}]});
      return {passed: true, testRunId: row.id};
    }
    finishRun(ctx.db, run.id, 'failed', summary || 'La comprobación animation falló');
    if (/^Retarget manual:/.test(summary)) manualRetarget(ctx, task, row, summary);
    else blockTask(ctx.db, task.id, `Animación rota: ${summary || row.result}`);
    return {passed: false, testRunId: row.id, result: row.result};
  };
}
