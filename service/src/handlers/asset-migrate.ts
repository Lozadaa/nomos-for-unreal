import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { Handler, WorkerContext } from '../runner.ts';
import type { CatalogEntry } from '../model.ts';
import { createUnrealCmd, type UnrealCmd, type VerifyReport } from '../adapters/unreal-cmd.ts';
import { assetConfig } from '../catalog/paths.ts';
import { extractZip } from '../catalog/zip.ts';
import { acquire, leaseWaitReason } from '../leases.ts';
import { upsertEntry } from '../repo/catalog.ts';
import { addArtifact, recordTestRun } from '../repo/artifacts.ts';
import { blockTask, moveTask, requireTask } from '../repo/tasks.ts';
import { finishRun } from '../repo/runs.ts';
import { appendEvent } from '../store.ts';
import { decisionGate } from './worker-policy.ts';
import { commandRun, exists, requireEntry, targetProject } from './asset-run.ts';

export type AssetDeps = {unreal?: (ctx: WorkerContext) => UnrealCmd};
export const unrealFor = (deps: AssetDeps, ctx: WorkerContext) =>
  deps.unreal?.(ctx) ?? createUnrealCmd({bin: assetConfig(ctx.dataDir).unrealPath});

/** «Publicado para 4.20-5.4; verificado en 5.8.3» cuando el motor no está entre las versiones declaradas del pack. */
export function versionWarning(entry: Pick<CatalogEntry, 'engineVersions'>, engine: string | null): string | null {
  const full = engine?.split('-')[0] ?? null, short = full?.match(/^\d+\.\d+/)?.[0];
  const versions = entry.engineVersions;
  if (!versions.length || !full || !short || versions.includes(short)) return null;
  const declared = versions.length > 1 ? `${versions[0]}-${versions.at(-1)}` : versions[0];
  return `Publicado para ${declared}; verificado en ${full}`;
}

/** Preset MetaHuman de Megascans/Bridge: `Tier0/asset_ue/MetaHumans/{Common,<Nombre>}` se monta en `/Game/MetaHumans`. */
export const metahuman = (entry: CatalogEntry) => entry.source === 'megascans' && entry.category === 'metahuman-preset';
const presetRoot = (entry: CatalogEntry) => join(entry.localPath!, 'Tier0', 'asset_ue', 'MetaHumans');
/** El Blueprint de un MetaHuman de Bridge usa nodos de LiveLink: sin el plugin no compila y se queda sin mallas (KratosFabTest, 2026-10-24). */
export const metahumanPlugins = ['LiveLink'];
function missingPlugins(uproject: string): string[] {
  const enabled = new Set((JSON.parse(readFileSync(uproject, 'utf8')).Plugins ?? []).filter((p: {Enabled?: boolean}) => p.Enabled).map((p: {Name: string}) => p.Name));
  return metahumanPlugins.filter(name => !enabled.has(name));
}
function enablePlugins(uproject: string, names: string[]): void {
  const json = JSON.parse(readFileSync(uproject, 'utf8'));
  json.Plugins = [...(json.Plugins ?? []).filter((p: {Name: string}) => !names.includes(p.Name)), ...names.map(Name => ({Name, Enabled: true}))];
  writeFileSync(uproject, JSON.stringify(json, null, '\t') + '\n', 'utf8');
}

/** Packs del plugin Fab van a `Content/Fab/<pack>`; los del Launcher, a `Content/<pack>` como los deja el propio Launcher.
 *  Plantillas del motor: las compartidas (`TemplateResources/<nivel>/<Mount>/Content`) se montan en `/Game/<Mount>` y las de
 *  proyecto (`<Plantilla>/Content/<ruta>`) conservan su ruta: sus referencias internas (`/Game/Characters/...`) siguen resolviendo. */
export function packTarget(entry: CatalogEntry): {rel: string; zip: boolean} {
  const source = entry.localPath!, zip = source.toLowerCase().endsWith('.zip');
  if (metahuman(entry)) return {rel: 'MetaHumans', zip: false};
  if (entry.source === 'engine') {
    const parts = source.split(/[\\/]/), content = parts.lastIndexOf('Content');
    const rel = content === parts.length - 1 ? parts[content - 1] : parts.slice(content + 1).join('/');
    return {rel, zip: false};
  }
  const plugin = zip || basename(dirname(source)) === 'Fab';
  const pack = zip ? entry.name : basename(source);
  return {rel: plugin ? `Fab/${pack}` : pack, zip};
}

function saveReport(ctx: WorkerContext, runId: string, report: VerifyReport & {warning: string | null}): string {
  const dir = join(ctx.dataDir, 'artifacts', 'reports');
  mkdirSync(dir, {recursive: true});
  const file = join(dir, `verify-${runId}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

export function createMigrate(deps: AssetDeps = {}): Handler {
  return async (command, ctx) => {
    const payload = command.payload as {entryId?: unknown; targetProject?: unknown};
    const entry = requireEntry(ctx, payload.entryId);
    if (!(['fab', 'engine'].includes(entry.source) || metahuman(entry)) || !exists(entry.localPath)) throw new Error('invalid_migrate_source');
    const project = targetProject(ctx, payload.targetProject);
    const {rel, zip} = packTarget(entry);
    const dest = join(project.dir, 'Content', ...rel.split('/'));
    const same = resolve(dest).toLowerCase() === resolve(entry.localPath).toLowerCase();
    const {task, run} = commandRun(ctx, command, {title: `Migrar ${entry.name} a ${project.name}`,
      provider: 'unreal', role: 'arte', metadata: {entryId: entry.id}});
    // la puerta va antes de la reserva: reservar mientras la Decisión espera cambiaría su contexto y la caducaría
    const plugins = metahuman(entry) ? missingPlugins(project.uproject) : [];
    if (plugins.length) {
      const ok = decisionGate(ctx, task, 'metahuman_plugins', `MetaHuman necesita el plugin ${plugins.join(', ')} en ${project.name}`, {plugins, project: project.name},
        [{id: 'approve', label: `Activar ${plugins.join(', ')}`, description: `Añadirlo a ${basename(project.uproject)}, como hace Bridge al importar un MetaHuman`},
          {id: 'cancel', label: 'No migrar', description: 'Sin el plugin, el Blueprint del MetaHuman no compila'}]);
      if (!ok && requireTask(ctx.db, task.id).decisionId) return {deferred: true, reason: `Esperando decisión: plugin ${plugins.join(', ')}`};
      if (!ok) { finishRun(ctx.db, run.id, 'cancelled', 'Sin los plugins de MetaHuman'); return {ok: false, skipped: 'metahuman_plugins'}; }
      enablePlugins(project.uproject, plugins);
      appendEvent(ctx.db, 'project.plugins_enabled', null, {taskId: task.id, project: project.name, plugins});
    }
    let replace = false;
    // una plantilla del motor ya copiada no se reemplaza: se verifica lo que hay y se dice
    const existing = entry.source === 'engine' && existsSync(dest);
    // el preset trae su carpeta y el Common compartido entre MetaHumans: se copia cada parte que falte, nunca se pisa
    const preset = metahuman(entry) ? readdirSync(presetRoot(entry), {withFileTypes: true}).filter(d => d.isDirectory()).map(d => d.name) : [];
    if (!same && !existing && !preset.length && existsSync(dest)) {
      replace = decisionGate(ctx, task, 'replace', `${basename(dest)} ya existe en ${project.name}`, {entryId: entry.id, dest},
        [{id: 'approve', label: 'Reemplazar', description: 'Borrar la carpeta del proyecto y copiar el pack'},
          {id: 'cancel', label: 'Conservar', description: 'Dejar la carpeta actual y no migrar'}]);
      if (!replace && requireTask(ctx.db, task.id).decisionId)
        return {deferred: true, reason: 'asset_exists: esperando «Reemplazar» o «Conservar»'};
      if (!replace) {
        finishRun(ctx.db, run.id, 'cancelled', 'Se conserva la carpeta existente');
        return {ok: false, skipped: 'asset_exists'};
      }
    }
    // un solo editor por proyecto: migrar y verificar a la vez lanzarían dos editores sobre los mismos archivos
    const lease = acquire(ctx.db, run.id, task.id, [`editor/${project.name}`]);
    if (!lease.ok) return {deferred: true, reason: leaseWaitReason(lease.conflicts)};
    try {
      if (replace) rmSync(dest, {recursive: true, force: true});
      if (preset.length) {
        for (const part of preset.filter(part => !existsSync(join(dest, part))))
          cpSync(join(presetRoot(entry), part), join(dest, part), {recursive: true, errorOnExist: true, force: false});
      } else if (!same && zip) extractZip(entry.localPath, dest);
      // plantilla ya presente: se copia solo lo que falta (force: false nunca pisa un archivo del proyecto)
      else if (!same && existing) cpSync(entry.localPath, dest, {recursive: true, errorOnExist: false, force: false});
      else if (!same) cpSync(entry.localPath, dest, {recursive: true, errorOnExist: true, force: false});
      const root = preset.length ? `/Game/${rel}/${entry.name}` : `/Game/${rel}`;
      const verified = await unrealFor(deps, ctx).verifyPack(project.uproject, root);
      const warning = versionWarning(entry, verified.engine);
      const report = {...verified, warning, engineVersions: entry.engineVersions};
      const reportPath = saveReport(ctx, run.id, report);
      const engine = verified.engine?.split('-')[0] ?? null;
      recordTestRun(ctx.db, {taskId: task.id, runId: run.id, result: verified.ok ? 'passed' : 'failed', engineVersion: engine, reportPath});
      addArtifact(ctx.db, {taskId: task.id, runId: run.id, kind: 'report', path: reportPath,
        provenance: {provider: 'unreal', entryId: entry.id, root, engine, label: 'Verificación de pack · informe'}, license: entry.license});
      const detail = {entryId: entry.id, taskId: task.id, runId: run.id, project: project.name, root, engine, warning, existing,
        assets: verified.assets.length, missing: verified.missing_dependencies.length};
      if (!verified.ok) {
        appendEvent(ctx.db, 'asset.verify_failed', null, {...detail, errors: verified.errors.slice(0, 5)});
        blockTask(ctx.db, task.id, 'Verificación sin GUI fallida: revisa el informe');
        finishRun(ctx.db, run.id, 'failed', `Verificación fallida en ${project.name}`);
        return {ok: false, ...detail};
      }
      upsertEntry(ctx.db, {...entry, state: 'imported', verifiedEngine: engine,
        projects: [...new Set([...entry.projects, project.name])]});
      appendEvent(ctx.db, 'asset.migrated', null, detail);
      moveTask(ctx.db, task.id, 'cerrando'); moveTask(ctx.db, task.id, 'done');
      const kept = existing ? `/Game/${rel} ya existía en ${project.name}: solo se copia lo que faltaba, nada se sobrescribe. ` : '';
      finishRun(ctx.db, run.id, 'done', kept + (warning ? `Migrado y verificado. ${warning}` : 'Migrado y verificado sin GUI'));
      return {ok: true, ...detail};
    } catch (error) {
      finishRun(ctx.db, run.id, 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
}
