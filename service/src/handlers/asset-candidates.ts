import type { Handler, WorkerContext } from '../runner.ts';
import type { CatalogEntry, Decision, Task } from '../model.ts';
import { enqueue } from '../commands.ts';
import { assetPath, candidateKinds, pickCandidates, type Candidate } from '../catalog/candidates.ts';
import { listCatalog } from '../repo/catalog.ts';
import { listDecisions, openDecision } from '../repo/decisions.ts';
import { blockTask, moveTask, requireTask, setTaskWait } from '../repo/tasks.ts';
import { appendEvent } from '../store.ts';
import { targetProject, type Project } from './asset-run.ts';

type Payload = {taskId?: unknown; query?: unknown; kinds?: unknown; animations?: unknown; targetProject?: unknown};
const fabOption = {id: 'fab', label: 'Buscar en Fab', description: 'Descargar un personaje de Fab (nivel 2, con clics en el Launcher)'};
const engineOption = {id: 'engine', label: 'Usar maniquí del motor', description: 'Seguir con Manny, el maniquí UE5 de las plantillas'};
const fabBlocked = 'Buscar en Fab (nivel 2, con clics): no hay personaje en el catálogo';

function parse(payload: Payload) {
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  const kinds = payload.kinds === undefined ? ['character', 'metahuman-preset'] : payload.kinds;
  const animations = payload.animations === undefined ? [] : payload.animations;
  if (!query || !Array.isArray(kinds) || !kinds.length || !kinds.every(k => (candidateKinds as readonly unknown[]).includes(k))
    || !Array.isArray(animations) || !animations.every(a => typeof a === 'string' && /^[\w-]+$/.test(a))) throw new Error('invalid_candidates');
  return {query, kinds: kinds as string[], animations: animations as string[]};
}

/** Clips pedidos por nombre (`AM_ComboAttack`) → ruta `/Game` y el pack que hay que migrar para tenerlo. */
function clips(ctx: WorkerContext, names: string[]) {
  const found: {name: string; path: string; entry: CatalogEntry}[] = [], missing: string[] = [];
  const packs = listCatalog(ctx.db).filter(e => ['engine', 'fab'].includes(e.source));
  for (const name of names) {
    const hit = packs.filter(e => e.tags.includes(name)).map(entry => ({name, entry, path: assetPath(entry, name)})).find(h => h.path);
    if (hit) found.push(hit as typeof found[number]); else missing.push(name);
  }
  return {found, missing};
}

function choose(ctx: WorkerContext, task: Task, project: Project, payload: Payload, chosen: Candidate) {
  const {animations} = parse(payload);
  const {found, missing} = clips(ctx, animations);
  const target = typeof payload.targetProject === 'string' && payload.targetProject.trim() ? {targetProject: payload.targetProject} : {};
  for (const entry of [...new Map([chosen.entry, ...found.map(c => c.entry)].map(e => [e.id, e])).values()])
    enqueue(ctx.db, 'asset.migrate', {entryId: entry.id, ...target}, `migrate:${entry.id}:${project.name}`);
  // después de las migraciones: el carril largo las ejecuta en orden de llegada y character.setup comprueba que la malla existe
  enqueue(ctx.db, 'character.setup', {taskId: task.id, mesh: chosen.mesh, ...(chosen.targetSkeleton ? {targetSkeleton: chosen.targetSkeleton} : {}),
    animations: found.map(c => c.path), ...target}, `character.setup:${task.id}:${chosen.id}`);
  if (requireTask(ctx.db, task.id).state === 'pendiente') moveTask(ctx.db, task.id, 'preparada');
  setTaskWait(ctx.db, task.id, 'Esperando editor');
  appendEvent(ctx.db, 'asset.candidate_chosen', null, {taskId: task.id, entryId: chosen.entry.id, label: chosen.label, missingClips: missing});
  return {ok: true, taskId: task.id, chosen: chosen.label, missingClips: missing};
}

/**
 * `asset.candidates`: hasta tres personajes del catálogo como Decisión (miniatura, origen, licencia, coste). Mientras se decide,
 * la orden queda diferida; al elegir encola la migración del personaje y de los clips y después `character.setup`.
 */
export const assetCandidates: Handler = async (command, ctx) => {
  const payload = command.payload as Payload;
  const {query, kinds} = parse(payload);
  const task = requireTask(ctx.db, typeof payload.taskId === 'string' ? payload.taskId : '');
  const project = targetProject(ctx, payload.targetProject);
  const decision: Decision | undefined = listDecisions(ctx.db).reverse()
    .find(d => d.taskId === task.id && d.evidence.some(e => e.kind === 'candidates' && e.ref === query) && d.state !== 'stale');
  const candidates = pickCandidates(ctx.db, query, kinds, project.name);
  if (!decision) {
    const options = candidates.length
      ? candidates.map((c, i) => ({id: c.id, label: c.label, description: c.description, ...(i === 0 ? {recommended: true} : {}),
        ...(c.thumbnail ? {thumbnail: c.thumbnail} : {})}))
      : [fabOption, engineOption];
    openDecision(ctx.db, {taskId: task.id, evidence: [{kind: 'candidates', ref: query}], options,
      reason: candidates.length ? `Elegir personaje base: ${candidates.length} candidatos del catálogo` : 'Elegir personaje base: ningún candidato en el catálogo'});
    return {deferred: true, reason: 'Esperando elección de personaje base'};
  }
  if (decision.state === 'open') return {deferred: true, reason: 'Esperando elección de personaje base'};
  if (decision.chosenOptionId === 'fab') {
    blockTask(ctx.db, task.id, fabBlocked);
    return {ok: false, taskId: task.id, blocked: fabBlocked};
  }
  const pool = decision.chosenOptionId === 'engine' ? pickCandidates(ctx.db, 'Manny', ['character'], project.name, 10).filter(c => c.entry.source === 'engine')
    : candidates.some(c => c.id === decision.chosenOptionId) ? candidates : pickCandidates(ctx.db, query, kinds, project.name, Infinity);
  const chosen = decision.chosenOptionId === 'engine' ? pool[0] : pool.find(c => c.id === decision.chosenOptionId);
  if (!chosen) {
    blockTask(ctx.db, task.id, 'El personaje elegido ya no está en el catálogo');
    return {ok: false, taskId: task.id, blocked: 'candidate_missing'};
  }
  return choose(ctx, task, project, payload, chosen);
};
