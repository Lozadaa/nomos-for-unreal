import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { quote, runLogged } from '../adapters/process.ts';
import type { Ffmpeg } from '../adapters/ffmpeg.ts';
import { readConfig } from '../config.ts';
import type { Outcome } from './run.ts';

/** Hito 10: map y build entregan, además de la vista del jugador (la que juzga la regresión), tres de un rig fijo. */
export const extraViews = ['left', 'right', 'top'] as const;
export const viewLabels: Record<string, string> = {player: 'Jugador', left: '3/4 izquierda', right: '3/4 derecha', top: 'Picado'};
/** Tiempo máximo para las vistas extra; pasado, se entregan las que haya y se anota en el resumen. */
export const viewsBudgetSeconds = 90;

/** `checks.views` del config.json: 4 por defecto; 1 recupera el comportamiento anterior (solo la del jugador). */
export function viewCount(dataDir: string): number {
  const value = (readConfig(dataDir) as {checks?: {views?: unknown}}).checks?.views;
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(4, Math.max(1, value)) : 4;
}

/** Variables para nomos_pie_capture.py: qué vistas extra y dónde dejarlas. */
export function viewsEnv(dir: string, prefix: string, count: number): Record<string, string> {
  const views = extraViews.slice(0, count - 1).map(view => ({view, path: join(dir, `${prefix}-${view}.png`)}));
  return views.length ? {NOMOS_VIEWS: JSON.stringify(views), NOMOS_VIEWS_BUDGET: String(viewsBudgetSeconds)} : {};
}

type ViewReport = {views?: Record<string, string>; views_note?: string; views_errors?: string[]};

/** Las vistas que el editor dejó, como capturas con `provenance.view`, y las líneas que anotar si faltan. */
export function viewShots(report: ViewReport | undefined, count: number, base: Record<string, unknown>): {shots: NonNullable<Outcome['artifacts']>; notes: string[]} {
  const views = report?.views ?? {};
  const shots = extraViews.filter(view => views[view] && existsSync(views[view]))
    .map(view => ({kind: 'screenshot' as const, path: views[view], provenance: {...base, view, label: `Vista ${viewLabels[view].toLowerCase()} 1280×720`}}));
  const notes = [...(report?.views_note ? [report.views_note] : []), ...(report?.views_errors ?? [])];
  if (count > 1 && shots.length < count - 1 && !notes.length) notes.push(`Vistas extra: ${shots.length} de ${count - 1}`);
  return {shots, notes};
}

/** Hoja de contactos 2×2 con el rótulo de cada vista (JPG); sin ffmpeg o con una sola vista, ninguna. */
export async function contactSheet(ff: Ffmpeg | null, shots: {view: string; path: string}[], out: string): Promise<string | null> {
  if (!ff || shots.length < 2) return null;
  const tiles = [...shots, ...shots].slice(0, 4);
  const font = "fontfile='C\\:/Windows/Fonts/arial.ttf':";
  const label = (i: number) => process.platform === 'win32' && existsSync('C:/Windows/Fonts/arial.ttf')
    ? `,drawtext=${font}text='${viewLabels[tiles[i].view] ?? tiles[i].view}':x=12:y=12:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6` : '';
  const filter = tiles.map((_, i) => `[${i}:v]scale=640:360${label(i)}[v${i}]`).join(';') + ';[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0';
  const args = ['-y', '-loglevel', 'error', ...tiles.flatMap(t => ['-i', t.path]), '-filter_complex', filter, '-frames:v', '1', '-update', '1', '-q:v', '3', out];
  try {
    const {exitCode} = await runLogged(ff.bin, [...(ff.baseArgs ?? []), ...args].map(quote), {timeoutMs: 60_000});
    return exitCode === 0 && existsSync(out) ? out : null;
  } catch { return null; }
}
