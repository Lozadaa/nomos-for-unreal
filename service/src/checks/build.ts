import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { buildCookRun, errorLines } from '../adapters/unreal-build.ts';
import { quote } from '../adapters/process.ts';
import { readConfig } from '../config.ts';
import { gameMap } from './map.ts';
import { buildOf, type Executor, type Launch } from './run.ts';

const pngs = (dir: string): string[] => !existsSync(dir) ? [] : readdirSync(dir, {withFileTypes: true})
  .flatMap(e => e.isDirectory() ? pngs(join(dir, e.name)) : e.name.toLowerCase().endsWith('.png') ? [join(dir, e.name)] : []);
/** Tres acciones por consola que existen en cualquier juego; el juego puede fijar las suyas en `config.json: walkthrough.commands`. */
export const defaultCommands = ['stat fps', 'stat unit', 'r.VSync 0'];
export const minLifeSeconds = 20, lifeSeconds = 30;

/**
 * Recorrido guionado fuera del editor: mapa, acciones por consola, 120 fotogramas de estabilización
 * (`r.HighResScreenshotDelay`, unos 2 s) y `HighResShot`; Kratos cierra el proceso al acabar su tiempo de vida.
 */
export function walkthroughArgs(opts: {map?: string; commands?: string[]; tracefile?: string} = {}): string[] {
  const commands = opts.commands ?? defaultCommands;
  // ExecCmds separa por comas y termina en la comilla: ninguna acción puede llevarlas
  if (commands.some(c => typeof c !== 'string' || !c.trim() || /[,"\r\n]/.test(c))) throw new Error('invalid_walkthrough');
  return [...(opts.map ? [opts.map] : []), '-windowed', '-ResX=1280', '-ResY=720', '-log',
    `-ExecCmds="${['r.HighResScreenshotDelay 120', ...commands, 'HighResShot 1280x720'].join(',')}"`,
    ...(opts.tracefile ? ['-trace=cpu,gpu,memory', `-tracefile=${quote(opts.tracefile)}`] : [])];
}

/** La línea «Fatal error» del log del juego y la siguiente, que suele decir la causa. */
export function fatalOf(log: string): string | null {
  const lines = log.split(/\r?\n/), at = lines.findIndex(l => /Fatal error/i.test(l));
  return at < 0 ? null : [lines[at].replace(/^\[[^\]]*\]\[[^\]]*\]/, '').trim(), lines[at + 1]?.trim()].filter(Boolean).join(' · ');
}

/** Errores del log del juego sin la marca «[fecha][fotograma]» (los 5 primeros). */
const gameErrors = (log: string) => errorLines(log.split(/\r?\n/).map(l => l.replace(/^\[[^\]]*\]\[[^\]]*\]/, '')).join('\n')).slice(0, 5);

/** Los fallos de Windows llegan como NTSTATUS (3221225734 = 0xC0000106, ruta demasiado larga): mejor en hexadecimal. */
export const exitText = (code: number | null) => code === null ? 'desconocido'
  : code > 0x7fffffff ? `${code} (0x${code.toString(16).toUpperCase()})` : String(code);

/** Arranca el ejecutable y lo cierra (taskkill del árbol) a los `ms`; dice si terminó antes por su cuenta. */
export const launch = (exe: string, args: string[], ms: number): Promise<Launch> => new Promise(accept => {
  const start = Date.now();
  const child = spawn(exe, args, {windowsVerbatimArguments: true, argv0: quote(exe), stdio: 'ignore'});
  const timer = setTimeout(() => {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true});
    else child.kill();
    accept({exitCode: null, seconds: ms / 1000, killed: true});
  }, ms);
  child.once('error', error => { clearTimeout(timer); accept({exitCode: null, seconds: 0, killed: false, error: error.message}); });
  child.once('exit', code => { clearTimeout(timer); accept({exitCode: code, seconds: (Date.now() - start) / 1000, killed: false}); });
});

/** Build (hito 7): BuildCookRun (40 min), arranque fuera del editor con el recorrido y 20 s de vida mínima; log y traza como evidencia. */
export const buildCheck: Executor = async (ctx, {project, files, dir}, deps) => {
  const out = join(dir, 'build');
  const config = readConfig(ctx.dataDir) as {walkthrough?: {map?: unknown; commands?: unknown}};
  const map = typeof config.walkthrough?.map === 'string' ? config.walkthrough.map : gameMap(files);
  const result = await buildCookRun(project.uproject, out, buildOf(ctx, deps), map ? [map] : []);
  if (!result.ok || !result.exePath) return {result: 'failed', log: result.log, config: 'Development Win64',
    summary: result.errors.length ? result.errors : ['El empaquetado no produjo un ejecutable']};
  const commands = Array.isArray(config.walkthrough?.commands) ? config.walkthrough.commands as string[] : undefined;
  // la traza de Insights (cpu, gpu, memoria) de 30 s pesó ~0,9 GB en KratosFabTest: solo con `walkthrough.trace: true`
  const tracefile = (config.walkthrough as {trace?: unknown} | undefined)?.trace === true ? join(dir, 'traza.utrace') : undefined;
  const life = await (deps.launch ?? launch)(result.exePath, walkthroughArgs({map, commands, tracefile}), lifeSeconds * 1000)
    ?? {exitCode: null, seconds: lifeSeconds, killed: true};
  const name = basename(project.uproject, '.uproject'), saved = join(dirname(result.exePath), name, 'Saved');
  const gameLog = join(saved, 'Logs', `${name}.log`);
  const evidence = [{kind: 'build' as const, path: result.exePath, provenance: {config: 'Development Win64'}},
    ...(existsSync(gameLog) ? [{kind: 'report' as const, path: gameLog, provenance: {source: 'game-log'}}] : []),
    ...(tracefile && existsSync(tracefile) && statSync(tracefile).size > 0 ? [{kind: 'report' as const, path: tracefile, provenance: {source: 'insights'}}] : [])];
  // salir con código cero antes de tiempo no es aprobar: el juego tiene que aguantar el recorrido (Review Focus 4)
  if (!life.killed && life.seconds < minLifeSeconds) return {result: 'failed', log: result.log, config: 'Development Win64', artifacts: evidence,
    summary: [life.error ? `El ejecutable no arrancó: ${life.error}`
      : `El proceso terminó a los ${Math.round(life.seconds)} s con código ${exitText(life.exitCode)}`, `Log del juego: ${gameLog}`]};
  // un error fatal deja el proceso vivo con el informador de fallos: la causa está en el log, no en la falta de captura
  const gameText = existsSync(gameLog) ? readFileSync(gameLog, 'utf8') : '', fatal = fatalOf(gameText);
  if (fatal) return {result: 'failed', log: result.log, config: 'Development Win64', artifacts: evidence,
    summary: [`El juego tuvo un error fatal: ${fatal}`, `Log del juego: ${gameLog}`]};
  const shot = pngs(out).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs).at(-1);
  return {result: shot ? 'passed' : 'failed', log: result.log, config: 'Development Win64', map: map ?? null,
    summary: shot ? [`Empaquetado en ${result.exePath}; recorrido de ${Math.round(life.seconds)} s`] : ['El ejecutable arrancó pero no dejó la captura', ...gameErrors(gameText)],
    artifacts: [...evidence, ...(shot ? [{kind: 'screenshot' as const, path: shot, provenance: {resolution: '1280x720', source: 'build'}}] : [])]};
};
