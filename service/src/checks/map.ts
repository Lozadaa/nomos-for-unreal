import { join } from 'node:path';
import type { UnrealCmd } from '../adapters/unreal-cmd.ts';
import { unrealOf, type CheckDeps, type Executor } from './run.ts';
import { packages, scripts } from './blueprint.ts';
import { animMap } from './animation.ts';

/** El mapa de juego que toca el diff. El escenario de animación de Kratos no lo es: lo juega y lo graba la comprobación animation. */
export const gameMap = (files: string[]) => packages(files, f => /\.umap$/i.test(f)).find(p => p !== animMap);

/** Juego a resolución fija (`-game <mapa>`, 10 min como máximo): captura con UI y, si `KRATOS_CONTROL`, sin UI. */
export function capture(unreal: UnrealCmd, uproject: string, map: string | undefined, [width, height]: [number, number],
  shot: string, deps: CheckDeps, extra: Record<string, string> = {}) {
  return unreal.runPython(uproject, join(scripts, 'kratos_pie_capture.py'),
    {KRATOS_SHOT: shot, KRATOS_WAIT: String(deps.playSeconds ?? 30), ...extra}, 10 * 60_000, {render: {width, height, map}});
}

type Validation = {ok: boolean; engine?: string; assets: {package: string; errors: string[]}[]};
type Pie = {ok: boolean; map?: string; errors: string[]; engine?: string};

/** Mapas: Data Validation sobre los assets tocados (si falla, bloquea con la lista) y, si pasa, juego 30 s con captura 1280×720. */
export const mapCheck: Executor = async (ctx, {project, files, dir}, deps) => {
  const unreal = unrealOf(ctx, deps);
  const touched = packages(files, f => /\.(uasset|umap)$/i.test(f));
  const validation = await unreal.runPython(project.uproject, join(scripts, 'kratos_validate.py'), {KRATOS_ASSETS: JSON.stringify(touched)}, 10 * 60_000);
  const report = validation.reportJson as Validation | undefined;
  if (!report) return {result: 'failed', log: validation.log, summary: [`El editor terminó con código ${validation.exitCode} sin el informe de validación`]};
  const broken = report.assets.flatMap(a => a.errors.map(e => `${a.package}: ${e}`));
  if (!report.ok) return {result: 'failed', log: validation.log, engine: report.engine, summary: broken, blocking: broken};
  const map = gameMap(files);
  const shot = join(dir, 'map-1280x720.png');
  const run = await capture(unreal, project.uproject, map, [1280, 720], shot, deps);
  const pie = run.reportJson as Pie | undefined, log = `${validation.log}\n${run.log}`;
  if (!pie?.ok) return {result: 'failed', log, map, summary: pie?.errors.length ? pie.errors : ['El juego no produjo la captura']};
  return {result: 'passed', log, map: pie.map ?? map, engine: pie.engine, config: '1280x720',
    summary: [`${touched.length} assets válidos; captura en ${pie.map ?? map}`],
    artifacts: [{kind: 'screenshot', path: shot, provenance: {resolution: '1280x720', map: pie.map ?? map ?? null}}]};
};
