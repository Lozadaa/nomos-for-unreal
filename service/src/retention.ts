import { existsSync, lstatSync, readdirSync, renameSync, rmSync, statfsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readBuildInfo } from './build-info.ts';
import type { Outcome } from './checks/run.ts';

/** Hito 19, regla del usuario: «No dejes históricos de paquete anda limpiando». Solo queda `Build/Windows-actual` del proyecto. */
const GB = 1024 ** 3;
export const warnBytes = 30 * GB, packBytes = 10 * GB;
export const freeBytes = (dir: string) => { const s = statfsSync(dir); return Number(s.bavail) * Number(s.bsize); };
export const gb = (bytes: number) => (bytes / GB).toLocaleString('es-ES', {maximumFractionDigits: bytes < 10 * GB ? 1 : 0});
export const diskText = (free: number) => `Disco: ${gb(free)} GB libres${free < warnBytes ? ' · ejecuta nomos clean' : ''}`;
/** Para `/status` (y `nomos status`): la unidad de la carpeta de datos, que vive en el proyecto. */
export function diskOf(dir: string | undefined): {free: number; low: boolean; text: string} | null {
  try { const free = freeBytes(dir!); return {free, low: free < warnBytes, text: diskText(free)}; } catch { return null; }
}

const fold = (p: string) => process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p);
/** ¿`inner` es `outer` o cuelga de él? */
export const within = (inner: string, outer: string) => { const rel = relative(fold(outer), fold(inner)); return rel === '' || !rel.startsWith('..') && !isAbsolute(rel); };
export const remove = (path: string) => rmSync(path, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});

/** Tamaño y fecha del cambio más reciente de una carpeta; los enlaces (y uniones de Windows) no se siguen. */
export function measure(path: string): {bytes: number; newest: number} {
  let bytes = 0, newest = 0;
  const walk = (p: string) => {
    let s; try { s = lstatSync(p); } catch { return; }
    newest = Math.max(newest, s.mtimeMs);
    if (s.isSymbolicLink()) return;
    if (!s.isDirectory()) { bytes += s.size; return; }
    for (const name of readdirSync(p)) walk(join(p, name));
  };
  walk(path);
  return {bytes, newest};
}

/** Los paquetes que deja quien empaqueta en un árbol: `Saved/StagedBuilds`, `Saved/Paquete-*` y su `Build/Windows-actual`. */
export function packagesOf(tree: string): string[] {
  const saved = join(tree, 'Saved'), list = (dir: string) => existsSync(dir) ? readdirSync(dir) : [];
  return [...list(saved).filter(n => n === 'StagedBuilds' || n.startsWith('Paquete-')).map(n => join(saved, n)),
    ...existsSync(join(tree, 'Build', 'Windows-actual')) ? [join(tree, 'Build', 'Windows-actual')] : []];
}

/** Tras copiar una build a `keep` (un `Build/Windows-actual`), fuera los paquetes del árbol de origen salvo el propio destino. */
export function cleanSource(tree: string, keep: string): string[] {
  const gone = packagesOf(tree).filter(p => !within(keep, p));
  for (const p of gone) remove(p);
  return gone;
}

/**
 * Al terminar la comprobación build (pase o falle): log del juego y capturas salen del paquete a la carpeta de la
 * comprobación y el paquete se borra. El artefacto `build` apunta a `Build/Windows-actual` si es la misma build; si no, `removed`.
 */
export function retainCheck(outcome: Outcome, out: string, dir: string, projectDir: string): Outcome {
  if (!existsSync(out)) return outcome;
  const actual = join(projectDir, 'Build', 'Windows-actual'), moved = new Map<string, string>();
  const same = (exe: string) => {
    const a = readBuildInfo(dirname(exe)), b = readBuildInfo(actual);
    return !!a && !!b && a.commit === b.commit && a.run === b.run && a.builtAt === b.builtAt && existsSync(join(actual, basename(exe)));
  };
  const artifacts = (outcome.artifacts ?? []).map(a => {
    if (!within(a.path, out)) return a;
    if (a.kind === 'build') return same(a.path) ? {...a, path: join(actual, basename(a.path))} : {...a, provenance: {...a.provenance, removed: true}};
    let target = join(dir, basename(a.path));
    if (existsSync(target)) target = join(dir, `${a.kind}-${basename(a.path)}`);
    renameSync(a.path, target); moved.set(a.path, target);
    return {...a, path: target};
  });
  remove(out);
  const summary = outcome.summary.map(line => [...moved].reduce((text, [from, to]) => text.split(from).join(to), line));
  return {...outcome, summary, artifacts};
}
