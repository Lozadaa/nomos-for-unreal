import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { cleanSource } from './retention.ts';

/** Hito 17: de qué commit sale un paquete. Vive junto al ejecutable como `build-info.json`. */
export type BuildInfo = {commit: string; branch: string | null; builtAt: string; task: string | null; run: string | null};
const file = (dir: string) => join(dir, 'build-info.json');
const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{7,64}$/i.test(v);
const text = (v: unknown) => typeof v === 'string' ? v : null;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']}).trim();

export function writeBuildInfo(dir: string, info: BuildInfo): BuildInfo {
  writeFileSync(file(dir), JSON.stringify(info, null, 2) + '\n');
  return info;
}

/** `null` si no hay archivo o no dice un commit válido: origen desconocido. */
export function readBuildInfo(dir: string): BuildInfo | null {
  try {
    const raw = JSON.parse(readFileSync(file(dir), 'utf8'));
    if (!hash(raw?.commit)) return null;
    return {commit: raw.commit, branch: text(raw.branch), builtAt: text(raw.builtAt) ?? '', task: text(raw.task), run: text(raw.run)};
  } catch { return null; }
}

/** HEAD y rama del árbol `repo`, para estampar a mano (`nomos build stamp`). */
export function stampBuild(dir: string, repo: string): BuildInfo {
  let branch: string | null = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (branch === 'HEAD') branch = null;
  return writeBuildInfo(dir, {commit: git(repo, 'rev-parse', '--verify', 'HEAD'), branch, builtAt: new Date().toISOString(), task: null, run: null});
}

/**
 * ¿El paquete es anterior a main? `true` si `commit` no contiene la punta de `main` (merge-base --is-ancestor falso);
 * `undefined` si no se puede saber (sin git, commit que el repo no tiene).
 */
export function staleBuild(repo: string, main: string, commit: string): boolean | undefined {
  try { git(repo, 'merge-base', '--is-ancestor', main, commit); return false; }
  catch (error) { return (error as {status?: number}).status === 1 ? true : undefined; }
}

/** Rama principal: `config.json: targetBranch` o la rama actual del juego (como la integración). */
export function mainBranch(repo: string, configured: unknown): string | null {
  if (typeof configured === 'string' && /^[\w./-]+$/.test(configured) && !configured.startsWith('-')) return configured;
  try { const b = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'); return b === 'HEAD' ? null : b; } catch { return null; }
}

const ago = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
/** Una línea para `nomos play --status`: commit corto, antigüedad y si es anterior a main. */
export function buildSummary(build: {builtAt: string; origin: BuildInfo | null; stale?: boolean}, now = Date.now()): string {
  const state = build.stale === true ? ', anterior a main' : build.stale === false ? ', al día con main' : '';
  return `Build de ${build.origin ? build.origin.commit.slice(0, 7) : 'origen desconocido'}, ${ago(now - Date.parse(build.builtAt))}${build.origin ? state : ''}`;
}

/** `nomos build stamp <carpeta>`: lo usan el director y los workers que empaquetan a mano. */
export function buildCli(argv: string[]): boolean {
  const words = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--data');
  if (words[0] !== 'build') return false;
  if (words[1] !== 'stamp' || words.length !== 3) throw new Error('Uso: nomos build stamp <carpeta del paquete>');
  const dir = resolve(words[2]), info = stampBuild(dir, process.cwd());
  console.log(`Build estampada: ${info.commit.slice(0, 7)}${info.branch ? ` (${info.branch})` : ''}`);
  // hito 19: copiada a Build/Windows-actual, los paquetes del árbol empaquetado sobran
  if (basename(dir) === 'Windows-actual' && basename(dirname(dir)) === 'Build') {
    const gone = cleanSource(process.cwd(), dir);
    if (gone.length) console.log(`Paquetes retirados del árbol: ${gone.length}`);
  }
  return true;
}
