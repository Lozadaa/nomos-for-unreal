import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { WorkerContext } from '../runner.ts';
import type { Run } from '../model.ts';
import type { Meshy, MeshyTask } from '../adapters/meshy.ts';
import { addArtifact } from '../repo/artifacts.ts';
import { upsertEntry } from '../repo/catalog.ts';
import { appendEvent } from '../store.ts';
import { requireTask } from '../repo/tasks.ts';
import { lowerFirst } from '../artifact-label.ts';

export const meshyLicense = 'Meshy (según plan)';
async function fetchTo(meshy: Meshy, url: string | undefined, file: string): Promise<string | null> {
  if (!url) return null;
  try { await meshy.download(url, file); return file; } catch { return null; }
}

/**
 * Copia propia en `<dataDir>/artifacts/meshy/<runId>/` (los enlaces de Meshy caducan a los 3 días). Sin copia del modelo,
 * el artefacto queda con `previewPath: null` y Entregas ofrece «Regenerar», que vuelve a pasar por presupuesto.
 */
export async function saveMeshyResult(ctx: WorkerContext, meshy: Meshy, run: Run, job: MeshyTask, dir: string) {
  const format = job.modelUrls.glb ? 'glb' : job.modelUrls.fbx ? 'fbx' : 'glb';
  const modelFile = join(dir, `model.${format}`);
  const model = await fetchTo(meshy, job.modelUrls[format], modelFile);
  const thumbnail = await fetchTo(meshy, job.thumbnailUrl ?? undefined, join(dir, 'thumbnail.png'));
  const textures: string[] = [];
  for (const [map, url] of Object.entries(job.textureUrls[0] ?? {}))
    if (/^\w+$/.test(map)) { const file = await fetchTo(meshy, url, join(dir, `${map}.png`)); if (file) textures.push(file); }
  const {kind, prompt, params, estimatedCredits} = run.metadata;
  const provenance = {provider: 'meshy', remoteId: job.id, kind: kind ?? null, prompt: prompt ?? null, params: params ?? {},
    estimatedCredits: estimatedCredits ?? 0, taskId: run.taskId};
  const title = lowerFirst(requireTask(ctx.db, run.taskId).title);
  const artifact = addArtifact(ctx.db, {taskId: run.taskId, runId: run.id, kind: 'model', path: modelFile,
    previewPath: model && existsSync(model) ? model : null, provenance: {...provenance, label: `Modelo Meshy · ${title}`}, license: meshyLicense});
  for (const file of textures)
    addArtifact(ctx.db, {taskId: run.taskId, runId: run.id, kind: 'texture', path: file, previewPath: file,
      provenance: {...provenance, label: `Textura Meshy · ${basename(file, '.png')}`}, license: meshyLicense});
  if (!model) {
    appendEvent(ctx.db, 'meshy.link_expired', null, {taskId: run.taskId, runId: run.id, artifactId: artifact.id, remoteId: job.id});
    return {model: null, artifactId: artifact.id, entryId: null, textures: textures.length};
  }
  const entry = upsertEntry(ctx.db, {source: 'meshy', name: (prompt ?? `Meshy ${kind}`).slice(0, 80), category: 'hard surface',
    description: 'Pieza hard surface generada con Meshy', state: 'downloaded', localPath: dir, thumbnailPath: thumbnail,
    license: meshyLicense, formats: [format], tags: ['meshy', String(kind), job.id]});
  return {model, artifactId: artifact.id, entryId: entry.id, textures: textures.length};
}
