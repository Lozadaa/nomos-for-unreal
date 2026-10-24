import { join } from 'node:path';
import { gamePackage } from './select.ts';
import { unrealOf, type Executor } from './run.ts';

export const scripts = join(import.meta.dirname, '..', '..', 'unreal');
/** Paquetes /Game de los archivos que cumplen `keep`. */
export const packages = (files: string[], keep: (file: string) => boolean) =>
  [...new Set(files.filter(keep).map(gamePackage).filter((p): p is string => !!p))];

/** Blueprints: carga, compila y comprueba que sus referencias /Game existen (editor sin GUI). */
export const blueprintCheck: Executor = async (ctx, {project, files}, deps) => {
  const assets = packages(files, f => /\.uasset$/i.test(f) && !/(^|[\\/])WBP_/i.test(f));
  const {log, reportJson, exitCode} = await unrealOf(ctx, deps).runPython(project.uproject, join(scripts, 'kratos_compile_bp.py'),
    {KRATOS_ASSETS: JSON.stringify(assets)}, 10 * 60_000);
  if (!reportJson) return {result: 'failed', log, summary: [`El editor terminó con código ${exitCode} sin escribir el informe`]};
  return {result: reportJson.ok ? 'passed' : 'failed', log, engine: reportJson.engine as string,
    summary: reportJson.ok ? [`${(reportJson.compiled as unknown[]).length} Blueprints compilados`, ...(reportJson.warnings as string[] ?? [])]
      : reportJson.errors as string[]};
};
