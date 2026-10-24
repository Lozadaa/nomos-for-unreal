import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capture } from './map.ts';
import { decodePng, pixelDiffRatio } from './png.ts';
import { unrealOf, type Executor, type Outcome } from './run.ts';

export type UmgOptions = {resolutions?: [number, number][]; map?: string; widgets?: string[]};
export const defaultResolutions: [number, number][] = [[1280, 720], [1920, 1080]];
/** Review Focus 2: con UI y sin UI deben diferir al menos en el 0,5 % de los píxeles. */
export const minUiDiff = 0.005;

type Pie = {ok: boolean; map?: string; widgets: string[]; errors: string[]; engine?: string};

/** Ciclo UMG, fase de captura: por resolución, juego con UI y captura de control; deja la prueba en `running` para el QA visual. */
export function umgCapture(opts: UmgOptions = {}): Executor {
  return async (ctx, {project, dir}, deps) => {
    const unreal = unrealOf(ctx, deps), logs: string[] = [], summary: string[] = [];
    const artifacts: NonNullable<Outcome['artifacts']> = [];
    let map: string | null = opts.map ?? null, engine: string | null = null;
    for (const [width, height] of opts.resolutions ?? defaultResolutions) {
      const name = `ui-${width}x${height}`, shot = join(dir, `${name}.png`), control = join(dir, `${name}-control.png`);
      const run = await capture(unreal, project.uproject, opts.map, [width, height], shot, deps,
        {NOMOS_CONTROL: control, ...(opts.widgets?.length ? {NOMOS_WIDGETS: JSON.stringify(opts.widgets)} : {})});
      logs.push(run.log);
      const pie = run.reportJson as Pie | undefined;
      if (!pie?.ok) return {result: 'failed', log: logs.join('\n'), map, summary: [`${width}×${height}: ${pie?.errors.join('; ') || 'el juego no produjo las capturas'}`]};
      map = pie.map ?? map; engine = pie.engine ?? engine;
      const ratio = pixelDiffRatio(decodePng(readFileSync(shot)), decodePng(readFileSync(control)));
      if (ratio < minUiDiff) return {result: 'failed', log: logs.join('\n'), map, engine,
        summary: [`${width}×${height}: la captura no contiene la UI (difiere un ${(ratio * 100).toFixed(2).replace('.', ',')} % de la captura sin widgets)`,
          `Widgets en el viewport: ${pie.widgets.join(', ') || 'ninguno'}`]};
      summary.push(`${width}×${height}: UI visible (${(ratio * 100).toFixed(1).replace('.', ',')} % de píxeles), widgets ${pie.widgets.join(', ') || 'sin nombre'}`);
      artifacts.push({kind: 'screenshot', path: shot, provenance: {resolution: `${width}x${height}`, map, widget: pie.widgets[0] ?? null,
        widgets: pie.widgets, control, diffRatio: Number(ratio.toFixed(4))}});
    }
    return {result: 'running', log: logs.join('\n'), map, engine, config: (opts.resolutions ?? defaultResolutions).map(r => r.join('x')).join(', '),
      summary: [...summary, 'Capturas listas: esperando el QA visual'], artifacts};
  };
}
