import type { Handler } from '../runner.ts';
import type { CatalogEntry, Task } from '../model.ts';
import { openDecision } from '../repo/decisions.ts';
import { createTask, moveTask } from '../repo/tasks.ts';
import { decode } from '../repo/rows.ts';
import { appendEvent } from '../store.ts';
import { packTarget } from './asset-migrate.ts';
import { requireEntry, targetProject } from './asset-run.ts';

/** Spec con los cinco encabezados de docs/task-spec.md y el contrato `ue-asset-intake`. */
export function intakeSpec(entry: CatalogEntry, project: string, folder: string): string {
  const forbidden = entry.aiForbidden
    ? ['', '**Prohibido para IA.** Este asset no puede usarse como entrada de Meshy ni de ninguna generación.'] : [];
  return [
    '## Qué', `Preparar «${entry.name}» (${entry.source}) para ${project} con el contrato \`ue-asset-intake\`.`, ...forbidden,
    '', '## Por qué', 'Todo asset del catálogo entra al juego con escala, pivote, colisión, materiales y licencia comprobados.',
    '', '## Criterios de aceptación',
    '1. Escala real en centímetros comprobada (un objeto de mano no mide metros).',
    '2. Pivote en la base o en el punto de agarre, según el uso.',
    '3. Colisión simple (UCX o primitivas) en cada malla estática.',
    '4. Materiales sin referencias rotas; verificación sin GUI en verde.',
    `5. Licencia registrada: ${entry.license ?? 'pendiente de Decisión'}.`,
    '', '## Alcance', `- ${folder}`,
    '', '## No tocar', '- Content/StarterContent', '- Config',
  ].join('\n');
}

export const assetPrepare: Handler = async (command, ctx) => {
  const payload = command.payload as {entryId?: unknown; targetProject?: unknown};
  const entry = requireEntry(ctx, payload.entryId);
  const project = targetProject(ctx, payload.targetProject);
  const folder = entry.localPath ? `Content/${packTarget(entry).rel}` : `Content/${entry.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}`;
  const title = `Preparar ${entry.name} para ${project.name}`;
  // reintentos de la misma orden: una sola tarea abierta por asset y proyecto
  const open = ctx.db.prepare("select * from tasks where title=? and area='assets' and state!='done' order by rowid limit 1").get(title);
  if (open) return {taskId: decode<Task>(open).id, existing: true};
  const spec = intakeSpec(entry, project.name, folder);
  const task = createTask(ctx.db, {title, area: 'assets', spec, assigneeRole: 'arte', assigneeProvider: 'claude',
    acceptance: spec.split('\n').filter(l => /^\d+\. /.test(l)).map(l => l.replace(/^\d+\. /, '')), scope: [folder], leases: [folder]});
  if (!entry.license) {
    openDecision(ctx.db, {taskId: task.id, reason: 'Licencia desconocida', evidence: [{kind: 'catalog', ref: entry.id}],
      options: [{id: 'register', label: 'Registrar licencia', description: 'La busco en el origen y la anoto antes de importar'},
        {id: 'discard', label: 'No usar este asset', description: 'Buscar otra opción en el catálogo'}]});
  } else moveTask(ctx.db, task.id, 'preparada');
  appendEvent(ctx.db, 'asset.prepared', null, {entryId: entry.id, taskId: task.id, project: project.name, licensed: !!entry.license});
  return {taskId: task.id, state: entry.license ? 'preparada' : 'pendiente'};
};
