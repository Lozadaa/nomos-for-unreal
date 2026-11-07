import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { defaultUnrealCmd } from '../adapters/unreal-cmd.ts';
import { quote, runLogged } from '../adapters/process.ts';
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

const unrealDir = join(import.meta.dirname, '..', '..', 'unreal');
const script = join(unrealDir, 'nomos_caliente.py').replace(/\\/g, '/');
/** `NOMOS_CALIENTE=off` apaga el editor caliente: FASTVFX y `ue test` vuelven a UnrealEditor-Cmd en frío. */
export const calienteActivo = () => process.env.NOMOS_CALIENTE !== 'off';
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
  // RHI real sin ventana: FASTVFX compila shaders y lee get_statistics (con -NullRHI daría 0) y captura con SceneCapture2D.
  // -ReportExportPath: `nomos ue test` lee de ahí el index.json de cada «Automation RunTests».
  const args = [...[...(opts.baseArgs ?? []), uproject].map(quote), '-RenderOffscreen', `-ReportExportPath=${quote(join(dir, 'tests'))}`,
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
  const timeoutMs = opts.timeoutMs ?? 30 * 60_000;
  // `limite`: el editor abandona un trabajo de varios ticks (nomos_pendiente) que pase de ahí
  writeFileSync(pending, JSON.stringify({id, script: file.replace(/\\/g, '/'), env, limite: timeoutMs / 1000}));
  renameSync(pending, join(dir, 'entrada', `${id}.json`));
  for (const end = Date.now() + timeoutMs + 5000; Date.now() < end; await sleep(100)) {
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

export type ResumenTests = {filtro: string; ok: boolean; modo: 'caliente' | 'frio'; pasados: number; avisos: number; fallidos: number;
  no_ejecutados: number; fallos: {test: string; errores: string[]}[]; ms: number};
type Informe = {succeeded?: number; succeededWithWarnings?: number; failed?: number; notRun?: number;
  tests?: {fullTestPath: string; state: string; entries?: {event?: {type?: string; message?: string}}[]}[]};

/** Resumen del index.json que deja «Automation RunTests» en -ReportExportPath. */
function resumen(indice: string, filtro: string, modo: ResumenTests['modo'], t0: number): ResumenTests {
  const r = JSON.parse(readFileSync(indice, 'utf8').replace(/^\uFEFF/, '')) as Informe;
  const pasados = (r.succeeded ?? 0) + (r.succeededWithWarnings ?? 0), fallidos = r.failed ?? 0;
  const fallos = (r.tests ?? []).filter(t => t.state === 'Fail').map(t => ({test: t.fullTestPath,
    errores: (t.entries ?? []).filter(e => e.event?.type === 'Error').map(e => String(e.event?.message))}));
  return {filtro, ok: !fallidos && pasados > 0, modo, pasados, avisos: r.succeededWithWarnings ?? 0, fallidos,
    no_ejecutados: r.notRun ?? 0, fallos, ms: Date.now() - t0};
}

/** Tests de automatización: en el editor caliente (nomos_ue_test.py) y, si no arranca o muere, en frío con
 *  `-ExecCmds="Automation RunTests <filtro>; Quit"`. Un fallo de los tests no reintenta en frío. */
export async function runTests(uproject: string, filtro: string, opts: WarmOpts & {timeoutMs?: number} = {}): Promise<ResumenTests> {
  if (!/^[^;"\r\n]+$/.test(filtro)) throw new Error(`Filtro de tests no válido (sin ; ni comillas): ${filtro}`);
  const t0 = Date.now();
  if (calienteActivo()) {
    let r: WarmResult | null = null;
    try { r = await runWarm(uproject, join(unrealDir, 'nomos_ue_test.py'), {NOMOS_TEST_FILTRO: filtro}, opts); }
    catch (e) {
      if (e instanceof Error && e.message === 'unreal_timeout') throw e;
      console.error(`editor caliente: ${e instanceof Error ? e.message : e}; tests en frío`);
      await stopWarm(uproject);  // un editor a la vez
    }
    if (r && !r.ok) throw new Error(r.error ?? 'Los tests no terminaron en el editor caliente');
    if (r) return resumen(join(warmDir(uproject), 'tests', 'index.json'), filtro, 'caliente', t0);
  }
  const bin = opts.bin ?? defaultUnrealCmd, dir = mkdtempSync(join(tmpdir(), 'nomos-uetest-'));
  try {
    const {exitCode} = await runLogged(bin, [...[...(opts.baseArgs ?? []), uproject].map(quote), `-ExecCmds="Automation RunTests ${filtro}; Quit"`,
      `-ReportExportPath=${quote(dir)}`, '-NullRHI', '-unattended', '-nopause', '-nosplash'], {timeoutMs: opts.timeoutMs ?? 30 * 60_000});
    if (!existsSync(join(dir, 'index.json')))
      throw new Error(`El editor terminó con código ${exitCode} sin informe de tests (No automation tests matched '${filtro}'?)`);
    return resumen(join(dir, 'index.json'), filtro, 'frio', t0);
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

/** El único .uproject de `dir` (la raíz del juego o del worktree). */
export function findUproject(dir: string): string {
  const found = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.uproject'));
  if (found.length !== 1) throw new Error(found.length ? `Hay varios .uproject en ${dir}; usa --proyecto` : `No hay .uproject en ${dir}; usa --proyecto`);
  return join(dir, found[0]);
}

/**
 * `nomos ue py SCRIPT [--env K=V]… [--proyecto X.uproject] [--timeout S]`: el script en el editor caliente;
 * `nomos ue test FILTRO` corre «Automation RunTests» en él y escribe el resumen JSON;
 * `nomos ue parar` lo cierra y `nomos ue estado` dice si está abierto. Sale con 1 si el script o algún test falla.
 * En pruebas `NOMOS_UE_FAKE` es el editor falso (se lanza con node).
 */
export async function ueCli(argv: string[]): Promise<boolean> {
  // solo si `ue` es la orden (el primer posicional): `nomos reply ID ue …` no es esto
  const first = argv.find((arg, i) => !arg.startsWith('--') && !['--data', '--env', '--proyecto', '--timeout'].includes(argv[i - 1] ?? ''));
  if (first !== 'ue') return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'},
    env: {type: 'string', multiple: true}, proyecto: {type: 'string'}, timeout: {type: 'string'}}});
  const [, action, file, ...extra] = positionals;
  if (!['py', 'test', 'parar', 'estado'].includes(action) || extra.length || ['py', 'test'].includes(action) !== !!file)
    throw new Error('Uso: nomos ue py SCRIPT.py [--env K=V]… [--proyecto X.uproject] [--timeout S] | ue test FILTRO [--proyecto X] [--timeout S] | ue parar | ue estado');
  const uproject = resolve(values.proyecto ?? findUproject(process.cwd()));
  const fake = process.env.NOMOS_UE_FAKE;
  const opts: WarmOpts = fake ? {bin: process.execPath, baseArgs: [fake], startTimeoutMs: 20_000}
    : {bin: assetConfig(resolve(values.data ?? '.nomos')).unrealPath ?? undefined};
  if (action === 'estado') { const beat = warmBeat(uproject); console.log(JSON.stringify(beat ? {abierto: true, ...beat} : {abierto: false})); return true; }
  if (action === 'parar') { console.log(JSON.stringify({cerrado: await stopWarm(uproject)})); return true; }
  const timeout = values.timeout ? {timeoutMs: Number(values.timeout) * 1000} : {};
  if (action === 'test') {
    const r = await runTests(uproject, file, {...opts, ...timeout});
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 1;
    return true;
  }
  const env = Object.fromEntries((values.env ?? []).map(pair => {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new Error(`--env espera CLAVE=valor: ${pair}`);
    return [pair.slice(0, eq), pair.slice(eq + 1)];
  }));
  const result = await runWarm(uproject, resolve(file), env, {...opts, ...timeout});
  console.error(result.arranque === null ? `editor caliente: ${result.ms} ms` : `editor caliente: abierto en ${result.arranque.toFixed(0)} s; script ${result.ms} ms`);
  if (result.salida) process.stdout.write(result.salida.endsWith('\n') ? result.salida : result.salida + '\n');
  if (result.error) console.error(result.error);
  if (!result.ok) process.exitCode = 1;
  return true;
}
