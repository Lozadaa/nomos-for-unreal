import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Carpetas de informes de Unreal en Windows: la del proyecto y las del motor por versión (%LOCALAPPDATA%\UnrealEngine\<v>\Saved\Crashes). */
export function carpetasCrash(projectDir: string | null, localAppData = process.env.LOCALAPPDATA ?? ''): string[] {
  const motor = localAppData && existsSync(join(localAppData, 'UnrealEngine'))
    ? readdirSync(join(localAppData, 'UnrealEngine')).map(v => join(localAppData, 'UnrealEngine', v, 'Saved', 'Crashes')) : [];
  return [...projectDir ? [join(projectDir, 'Saved', 'Crashes')] : [], ...motor].filter(d => existsSync(d));
}

const xml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** El informe más reciente: su ErrorMessage, la pila de CrashContext y 60 líneas del log desde «Fatal error»,
 *  «Assertion failed» o «Critical error» (o las 60 últimas). Sin log en la carpeta, el último de Saved/Logs. */
export function ultimoCrash(carpetas: string[], projectDir: string | null = null) {
  const informes = carpetas.flatMap(c => readdirSync(c).map(n => join(c, n))).filter(d => statSync(d).isDirectory())
    .map(d => ({d, t: statSync(d).mtimeMs})).sort((a, b) => b.t - a.t);
  if (!informes.length) return null;
  const {d, t} = informes[0], ctx = join(d, 'CrashContext.runtime-xml'), texto = existsSync(ctx) ? readFileSync(ctx, 'utf8') : '';
  const campo = (k: string) => { const m = new RegExp(`<${k}>([^]*?)</${k}>`).exec(texto); return m ? xml(m[1]).trim() : null; };
  const logs = readdirSync(d).filter(n => n.endsWith('.log')).map(n => join(d, n));
  const saved = projectDir ? join(projectDir, 'Saved', 'Logs') : null;
  if (!logs.length && saved && existsSync(saved))
    logs.push(...readdirSync(saved).filter(n => n.endsWith('.log')).map(n => join(saved, n)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs).slice(0, 1));
  const lineas = logs.length ? readFileSync(logs[0], 'utf8').split(/\r?\n/) : [];
  const i = lineas.findIndex(l => /Fatal error|Assertion failed|Critical error|Ensure condition failed/.test(l));
  return {carpeta: d, fecha: new Date(t).toISOString(), error: campo('ErrorMessage')?.split(/\r?\n\s*\r?\nStack:/)[0].trim() ?? null, pila: campo('CallStack')?.split(/\r?\n/).slice(0, 30) ?? [],
    log: logs[0] ?? null, extracto: i >= 0 ? lineas.slice(i, i + 60) : lineas.slice(-60)};
}
