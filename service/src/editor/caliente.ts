import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { defaultUnrealCmd } from '../adapters/unreal-cmd.ts';
import { quote } from '../adapters/process.ts';
import { assetConfig } from '../catalog/paths.ts';

/**
 * x10: editor caliente. En Herbalist los workers abrieron UnrealEditor-Cmd en frío 1 090 veces (21 h): la
 * inicialización del motor sola es 15 s de mediana y el script, menos de 1 s. Aquí el editor se abre una vez por
 * proyecto (o worktree) con nomos_caliente.py y cada `nomos ue py` le deja un trabajo en `Saved/NomosCaliente`.
 * Se cierra solo tras `inactivo` segundos, con `nomos ue parar` o al devolver el turno de Unreal.
 */
export type WarmOpts = {bin?: string; baseArgs?: string[]; idleSeconds?: number; startTimeoutMs?: number};
export type WarmResult = {ok: boolean; salida: string; error: string | null; ms: number; arranque: number | null};
type Beat = {pid: number; en: number; desde: number; trabajos: number};

const script = join(import.meta.dirname, '..', '..', 'unreal', 'nomos_caliente.py').replace(/\\/g, '/');
export const warmDir = (uproject: string) => join(dirname(uproject), 'Saved', 'NomosCaliente');
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** El latido del editor si está vivo (escrito hace menos de 15 s y con el proceso en pie). */
export function warmBeat(uproject: string): Beat | null {
  try {
    const beat = JSON.parse(readFileSync(join(warmDir(uproject), 'latido.json'), 'utf8')) as Beat;
    return Date.now() / 1000 - beat.en < 15 && alive(beat.pid) ? beat : null;
  } catch { return null; }
}

/** Una compilación de C++ (Binaries) o un .uproject posteriores al arranque dejan el editor viejo: se reabre.
 *  ponytail: solo Binaries/Win64 del juego; los binarios de plugins del proyecto no cuentan. */
function stale(uproject: string, since: number): boolean {
  const bin = join(dirname(uproject), 'Binaries', 'Win64');
  const files = [uproject, ...(existsSync(bin) ? readdirSync(bin).filter(f => /\.(dll|modules)$/i.test(f)).map(f => join(bin, f)) : [])];
  return files.some(f => { try { return statSync(f).mtimeMs / 1000 > since; } catch { return false; } });
}

function launch(uproject: string, opts: WarmOpts): void {
  const dir = warmDir(uproject), bin = opts.bin ?? defaultUnrealCmd;
  if (!existsSync(bin)) throw new Error('unreal_missing');
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(join(dir, 'entrada'), {recursive: true});
  const args = [...[...(opts.baseArgs ?? []), uproject].map(quote), '-NullRHI',
    `-ExecCmds="py import os;exec(open(os.environ['NOMOS_CALIENTE_PY']).read())"`, '-unattended', '-nopause', '-nosplash'];
  const child = spawn(bin, args, {detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, argv0: quote(bin),
    env: {...process.env, PYTHONUTF8: '1', NOMOS_CALIENTE: dir, NOMOS_CALIENTE_PY: script, NOMOS_CALIENTE_INACTIVO: String(opts.idleSeconds ?? 600)}});
  child.on('error', () => {});
  child.unref();
}

/** Deja el editor caliente listo; devuelve los segundos de arranque o null si ya estaba. */
export async function ensureWarm(uproject: string, opts: WarmOpts = {}): Promise<number | null> {
  const beat = warmBeat(uproject);
  if (beat && !stale(uproject, beat.desde)) return null;
  if (beat) await stopWarm(uproject);
  const t0 = Date.now();
  launch(uproject, opts);
  for (const end = t0 + (opts.startTimeoutMs ?? 10 * 60_000); Date.now() < end; await sleep(250))
    if (warmBeat(uproject)) return (Date.now() - t0) / 1000;
  throw new Error('El editor caliente no arrancó a tiempo');
}

/** Ejecuta `file` (.py) en el editor caliente, arrancándolo si hace falta. */
export async function runWarm(uproject: string, file: string, env: Record<string, string> = {}, opts: WarmOpts & {timeoutMs?: number} = {}): Promise<WarmResult> {
  const arranque = await ensureWarm(uproject, opts), id = randomUUID(), dir = warmDir(uproject);
  const pending = join(dir, 'entrada', `${id}.tmp`), done = join(dir, 'salida', `${id}.json`);
  writeFileSync(pending, JSON.stringify({id, script: file.replace(/\\/g, '/'), env}));
  renameSync(pending, join(dir, 'entrada', `${id}.json`));
  for (const end = Date.now() + (opts.timeoutMs ?? 30 * 60_000); Date.now() < end; await sleep(100)) {
    if (existsSync(done)) {
      const result = JSON.parse(readFileSync(done, 'utf8'));
      rmSync(done, {force: true});
      return {...result, arranque};
    }
    if (!warmBeat(uproject)) { await sleep(1500); if (!existsSync(done) && !warmBeat(uproject)) throw new Error('El editor caliente se cerró durante el script'); }
  }
  throw new Error('unreal_timeout');
}

/** Cierra el editor caliente del proyecto si lo hay: trabajo `salir` y, si no sale en 30 s, se mata. */
export async function stopWarm(uproject: string): Promise<boolean> {
  const beat = warmBeat(uproject), dir = warmDir(uproject);
  if (!beat) return false;
  const id = randomUUID();
  writeFileSync(join(dir, 'entrada', `${id}.tmp`), JSON.stringify({id, salir: true}));
  renameSync(join(dir, 'entrada', `${id}.tmp`), join(dir, 'entrada', `${id}.json`));
  for (const end = Date.now() + 30_000; Date.now() < end && alive(beat.pid); ) await sleep(200);
  if (alive(beat.pid)) spawn('taskkill', ['/pid', String(beat.pid), '/T', '/F'], {windowsHide: true}).on('error', () => {});
  rmSync(join(dir, 'latido.json'), {force: true});
  return true;
}

/** El único .uproject de `dir` (la raíz del juego o del worktree). */
export function findUproject(dir: string): string {
  const found = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.uproject'));
  if (found.length !== 1) throw new Error(found.length ? `Hay varios .uproject en ${dir}; usa --proyecto` : `No hay .uproject en ${dir}; usa --proyecto`);
  return join(dir, found[0]);
}

/**
 * `nomos ue py SCRIPT [--env K=V]… [--proyecto X.uproject] [--timeout S]`: el script en el editor caliente;
 * `nomos ue parar` lo cierra y `nomos ue estado` dice si está abierto. Sale con 1 si el script falla.
 * En pruebas `NOMOS_UE_FAKE` es el editor falso (se lanza con node).
 */
export async function ueCli(argv: string[]): Promise<boolean> {
  // solo si `ue` es la orden (el primer posicional): `nomos reply ID ue …` no es esto
  const first = argv.find((arg, i) => !arg.startsWith('--') && !['--data', '--env', '--proyecto', '--timeout'].includes(argv[i - 1] ?? ''));
  if (first !== 'ue') return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'},
    env: {type: 'string', multiple: true}, proyecto: {type: 'string'}, timeout: {type: 'string'}}});
  const [, action, file, ...extra] = positionals;
  if (!['py', 'parar', 'estado'].includes(action) || extra.length || (action === 'py') !== !!file)
    throw new Error('Uso: nomos ue py SCRIPT.py [--env K=V]… [--proyecto X.uproject] [--timeout S] | ue parar | ue estado');
  const uproject = resolve(values.proyecto ?? findUproject(process.cwd()));
  const fake = process.env.NOMOS_UE_FAKE;
  const opts: WarmOpts = fake ? {bin: process.execPath, baseArgs: [fake], startTimeoutMs: 20_000}
    : {bin: assetConfig(resolve(values.data ?? '.nomos')).unrealPath ?? undefined};
  if (action === 'estado') { const beat = warmBeat(uproject); console.log(JSON.stringify(beat ? {abierto: true, ...beat} : {abierto: false})); return true; }
  if (action === 'parar') { console.log(JSON.stringify({cerrado: await stopWarm(uproject)})); return true; }
  const env = Object.fromEntries((values.env ?? []).map(pair => {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new Error(`--env espera CLAVE=valor: ${pair}`);
    return [pair.slice(0, eq), pair.slice(eq + 1)];
  }));
  const result = await runWarm(uproject, resolve(file), env, {...opts, ...(values.timeout ? {timeoutMs: Number(values.timeout) * 1000} : {})});
  console.error(result.arranque === null ? `editor caliente: ${result.ms} ms` : `editor caliente: abierto en ${result.arranque.toFixed(0)} s; script ${result.ms} ms`);
  if (result.salida) process.stdout.write(result.salida.endsWith('\n') ? result.salida : result.salida + '\n');
  if (result.error) console.error(result.error);
  if (!result.ok) process.exitCode = 1;
  return true;
}
