import { unrealOf, type Executor } from './run.ts';
import { packages } from './blueprint.ts';

/** Criterios de ue-asset-intake legibles en el informe de verificación: escala razonable en cm y materiales asignados.
 *  ponytail: la colisión no está en el informe de kratos_verify.py; se añade cuando el script la lea. */
function intake(asset: Record<string, any>): string[] {
  const problems: string[] = [];
  if (asset.loaded === false) problems.push(`${asset.package}: no carga`);
  if (Array.isArray(asset.bounds_cm) && asset.bounds_cm.some((v: number) => v <= 0 || v > 100_000))
    problems.push(`${asset.package}: escala fuera de rango (${asset.bounds_cm.join(' × ')} cm)`);
  if (Array.isArray(asset.materials) && asset.materials.some((m: unknown) => m === null)) problems.push(`${asset.package}: material vacío`);
  return problems;
}

/** Assets: verifyPack del hito 4 sobre cada carpeta tocada más los criterios de entrada. */
export const assetCheck: Executor = async (ctx, {project, files}, deps) => {
  const folders = [...new Set(packages(files, f => /\.uasset$/i.test(f)).map(p => p.split('/').slice(0, -1).join('/')))];
  const summary: string[] = [], logs: string[] = [];
  let engine: string | null = null;
  for (const root of folders) {
    const report = await unrealOf(ctx, deps).verifyPack(project.uproject, root);
    engine = report.engine ?? engine;
    logs.push(JSON.stringify(report, null, 2));
    summary.push(...report.errors, ...report.missing_dependencies.map(d => `${d.from}: falta ${d.to}`), ...report.assets.flatMap(intake));
    if (!report.ok && !summary.length) summary.push(`${root}: verificación fallida`);
  }
  return {result: summary.length ? 'failed' : 'passed', log: logs.join('\n'), engine,
    summary: summary.length ? summary : [`${folders.length} carpetas verificadas`]};
};
