import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildCookRun } from '../adapters/unreal-build.ts';
import { runLogged } from '../adapters/process.ts';
import { buildOf, type Executor } from './run.ts';

const pngs = (dir: string): string[] => !existsSync(dir) ? [] : readdirSync(dir, {withFileTypes: true})
  .flatMap(e => e.isDirectory() ? pngs(join(dir, e.name)) : e.name.toLowerCase().endsWith('.png') ? [join(dir, e.name)] : []);
// arranca el juego, lo deja correr y lo cierra (taskkill del árbol): el tiempo agotado es lo esperado
const launch = (exe: string, args: string[], ms: number) => runLogged(exe, args, {timeoutMs: ms}).then(() => undefined, () => undefined);

/** Build: BuildCookRun (40 min) y arranque del ejecutable 30 s con captura HighResShot 1280×720. */
export const buildCheck: Executor = async (ctx, {project, dir}, deps) => {
  const out = join(dir, 'build');
  const result = await buildCookRun(project.uproject, out, buildOf(ctx, deps));
  if (!result.ok || !result.exePath) return {result: 'failed', log: result.log, config: 'Development Win64',
    summary: result.errors.length ? result.errors : ['El empaquetado no produjo un ejecutable']};
  await (deps.launch ?? launch)(result.exePath, ['-windowed', '-ResX=1280', '-ResY=720', '-ExecCmds="HighResShot 1280x720"'], 30_000);
  const shot = pngs(out).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs).at(-1);
  return {result: shot ? 'passed' : 'failed', log: result.log, config: 'Development Win64',
    summary: shot ? [`Empaquetado en ${result.exePath}`] : ['El ejecutable arrancó pero no dejó la captura'],
    artifacts: [{kind: 'build', path: result.exePath, provenance: {config: 'Development Win64'}},
      ...(shot ? [{kind: 'screenshot' as const, path: shot, provenance: {resolution: '1280x720', source: 'build'}}] : [])]};
};
