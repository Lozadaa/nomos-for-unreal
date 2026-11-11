import { gameEngine } from '../engine-path.ts';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { createUnrealCmd, defaultUnrealCmd } from '../adapters/unreal-cmd.ts';
import { quote, runLogged } from '../adapters/process.ts';
import { assetConfig } from '../catalog/paths.ts';
import { request, serviceInfo } from '../client.ts';
import type { ServiceInfo } from '../service-info.ts';
import { openDb } from '../db.ts';
import { dbFile } from '../legacy.ts';
import { enCache, plantillasRecetas, recordar, validarReceta } from './recetas.ts';
import { carpetasCrash, ultimoCrash } from './crash.ts';
import { mcpConnect, type Mcp } from './mcp.ts';

/**
 * x10: editor caliente. En Herbalist los workers abrieron UnrealEditor-Cmd en frío 1 090 veces (21 h): la
 * inicialización del motor sola es 15 s de mediana y el script, menos de 1 s. Aquí el editor se abre una vez por
 * proyecto (o worktree) con nomos_caliente.py y cada `nomos ue py` le deja un trabajo en `Saved/NomosCaliente`.
 * Se cierra solo tras `inactivo` segundos, con `nomos ue parar` o al devolver el turno de Unreal.
 */
export type WarmOpts = {bin?: string; baseArgs?: string[]; idleSeconds?: number; startTimeoutMs?: number; mcpWaitMs?: number};
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

/** Un puerto libre para el MCP de este editor: el 8000 por defecto puede ser del editor que tenga abierto el usuario. */
const freePort = () => new Promise<number>((ok, ko) => {
  const s = createServer().on('error', ko).listen(0, '127.0.0.1', () => { const {port} = s.address() as {port: number}; s.close(() => ok(port)); });
});

function launch(uproject: string, opts: WarmOpts, mcpPort: number): {salio: number | null} {
  const dir = warmDir(uproject), bin = opts.bin ?? defaultUnrealCmd;
  if (!existsSync(bin)) throw new Error('unreal_missing');
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(join(dir, 'entrada'), {recursive: true});
  writeFileSync(join(dir, 'mcp-puerto'), String(mcpPort));
  // RHI real sin ventana: FASTVFX compila shaders y lee get_statistics (con -NullRHI daría 0) y captura con SceneCapture2D.
  // -ReportExportPath: `nomos ue test` lee de ahí el index.json de cada «Automation RunTests».
  const args = [...[...(opts.baseArgs ?? []), uproject].map(quote), '-RenderOffscreen', `-ReportExportPath=${quote(join(dir, 'tests'))}`,
    // 5.9: el plugin ModelContextProtocol arranca solo con el editor (también con -Cmd y sin ventana) [probado]; el 5.8 ignora el argumento
    `-ModelContextProtocolPort=${mcpPort}`,
    `-ExecCmds="py import os;exec(open(os.environ['NOMOS_CALIENTE_PY']).read())"`, '-unattended', '-nopause', '-nosplash'];
  const child = spawn(bin, args, {detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, argv0: quote(bin),
    env: {...process.env, PYTHONUTF8: '1', NOMOS_CALIENTE: dir, NOMOS_CALIENTE_PY: script, NOMOS_CALIENTE_INACTIVO: String(opts.idleSeconds ?? 600)}});
  // el editor que muere al arrancar (crash del motor, binario roto) no late nunca: se ve aquí, no a los 10 min
  const estado = {salio: null as number | null};
  child.on('error', () => { estado.salio = -1; });
  child.on('exit', code => { estado.salio = code ?? -1; });
  child.unref();
  return estado;
}

/** Los módulos del .uproject sin binario del editor. Un worktree nace sin `Binaries` (no está en Git): el editor se
 *  cerraría a los 13 s con «The game module could not be found» y el worker lo tomaría por un crash [TrompoNomosMcp 2026-11-11]. */
export function sinCompilar(uproject: string): string[] {
  let modulos: string[] = [];
  try { modulos = (JSON.parse(readFileSync(uproject, 'utf8')).Modules ?? []).map((m: {Name: string}) => m.Name); } catch { return []; }
  const bin = join(dirname(uproject), 'Binaries');
  const hechos = existsSync(bin) ? readdirSync(bin, {recursive: true}).map(f => String(f).split(/[\\/]/).pop()!) : [];
  return modulos.filter(m => !hechos.some(f => f.startsWith(`UnrealEditor-${m}.`) || f.startsWith(`libUnrealEditor-${m}.`)));
}

/** Deja el editor caliente listo; devuelve los segundos de arranque o null si ya estaba. */
export async function ensureWarm(uproject: string, opts: WarmOpts = {}): Promise<number | null> {
  const beat = warmBeat(uproject);
  if (beat && !stale(uproject, beat.desde)) return null;
  if (beat) await stopWarm(uproject);
  const faltan = sinCompilar(uproject);
  if (faltan.length) throw new Error(`Esta carpeta aún no está compilada (falta el módulo ${faltan.join(', ')} en Binaries): `
    + 'compila primero con Scripts/compilar.ps1 y repite la orden. No es un crash de Unreal.');
  const t0 = Date.now();
  const proceso = launch(uproject, opts, await freePort());
  for (const end = t0 + (opts.startTimeoutMs ?? 10 * 60_000); Date.now() < end; await sleep(250)) {
    if (warmBeat(uproject)) return (Date.now() - t0) / 1000;
    if (proceso.salio !== null)
      throw new Error(`El editor caliente se cerró al arrancar (código ${proceso.salio}, ${Math.round((Date.now() - t0) / 1000)} s); nomos ue crash da el motivo`);
  }
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
  // mientras corre un script el editor no late (el tick está ocupado) y leer el latido puede fallar mientras se reemplaza:
  // se da por cerrado solo si su proceso ya no existe
  let pid = warmBeat(uproject)?.pid;
  for (const end = Date.now() + timeoutMs + 5000; Date.now() < end; await sleep(100)) {
    pid ??= warmBeat(uproject)?.pid;
    if (existsSync(done)) {
      const result = JSON.parse(readFileSync(done, 'utf8'));
      rmSync(done, {force: true});
      return {...result, arranque};
    }
    if (pid ? !alive(pid) : !warmBeat(uproject)) { await sleep(1500); if (!existsSync(done)) throw new Error('El editor caliente se cerró durante el script'); }
  }
  throw new Error('unreal_timeout');
}

const LIVE = 'LiveCodingToolset.LiveCodingToolset', APP = 'EditorToolset.EditorAppToolset', CAP = 'SceneCaptureToolset.SceneCaptureToolset',
  PY = 'editor_toolset.toolsets.python_scripting.PythonScriptingTools';

/** El MCP del editor caliente, arrancándolo si hace falta. Solo Unreal 5.9 con `AllToolsets` en el .uproject. */
async function warmMcp(uproject: string, opts: WarmOpts): Promise<Mcp> {
  await ensureWarm(uproject, opts);
  const sinMcp = 'Este editor no tiene MCP: hace falta Unreal 5.9 y el plugin AllToolsets en el .uproject (y recompilar el editor)';
  let port: number;
  try { port = Number(readFileSync(join(warmDir(uproject), 'mcp-puerto'), 'utf8')); } catch { throw new Error(sinMcp); }
  // el servidor sube unos segundos después del primer latido
  for (const end = Date.now() + (opts.mcpWaitMs ?? 20_000); ; await sleep(500)) {
    try { return await mcpConnect(port); } catch (e) { if (Date.now() > end) throw new Error(`${sinMcp} (${e instanceof Error ? e.message : e})`); }
  }
}

export type LiveResult = {ok: boolean; resultado: string; salida: string; ms: number};
/** Live Coding en el editor caliente: recompila cuerpos de funciones sin cerrarlo (6-20 s frente a cerrar, Build.bat y reabrir).
 *  No actualiza el DLL del disco y no sirve para clases, UPROPERTY o UFUNCTION nuevos: eso sigue siendo Build.bat. */
export async function liveCompile(uproject: string, opts: WarmOpts & {timeoutMs?: number} = {}): Promise<LiveResult> {
  const t0 = Date.now(), mcp = await warmMcp(uproject, opts);
  if ((await mcp.call(LIVE, 'IsLiveCodingReady')).value !== true) {
    await mcp.call(LIVE, 'EnableLiveCoding', {}, 60_000);
    for (const end = Date.now() + 60_000; (await mcp.call(LIVE, 'IsLiveCodingReady')).value !== true; await sleep(500))
      if (Date.now() > end) throw new Error('Live Coding no quedó listo en 60 s; compila con Build.bat');
  }
  const salida = String((await mcp.call(LIVE, 'CompileLiveCoding', {}, opts.timeoutMs ?? 10 * 60_000)).value ?? '');
  const resultado = salida.match(/^Result:\s*(\w+)/m)?.[1] ?? 'Desconocido';
  return {ok: ['Success', 'NoChanges'].includes(resultado), resultado, salida, ms: Date.now() - t0};
}

/** Captura del juego en marcha dentro del editor caliente (PIE en ventana flotante, con su HUD): 1-3 s frente a lanzar `-game`.
 *  `env` se pone en el proceso del editor antes de arrancar (el modo demo por variable de entorno). No es el .exe empaquetado. */
export async function capturePie(uproject: string, salida: string,
  o: WarmOpts & {env?: Record<string, string>; esperaS?: number; mapa?: string} = {}): Promise<{ancho: number; alto: number; ms: number}> {
  const t0 = Date.now(), mcp = await warmMcp(uproject, o);
  const py = (code: string) => mcp.call(PY, 'execute_python', {script: {content: code, language: 'Python'}}, 120_000);
  if ((await mcp.call(APP, 'IsPIERunning')).value === true) await mcp.call(APP, 'StopPIE', {}, 60_000);
  if (o.mapa) await py(`unreal.EditorLoadingAndSavingUtils.load_map(${JSON.stringify(o.mapa)})`);
  if (Object.keys(o.env ?? {}).length) await py(`import os\nos.environ.update(${JSON.stringify(o.env)})`);
  await mcp.call(APP, 'StartPIE', {options: {playMode: 'PlayMode_InEditorFloating'}}, 120_000);
  try {
    const mundos = (await mcp.call(CAP, 'ListWorlds')).value as {world: {refPath: string}; worldType: string}[];
    const world = mundos.find(w => w.worldType === 'PIE')?.world;
    if (!world) throw new Error('El juego no llegó a arrancar en el editor (sin mundo PIE); nomos ue crash o el log dan el motivo');
    await sleep((o.esperaS ?? 3) * 1000);
    // el primer PIE tras abrir el editor tarda unos segundos en tener viewport [probado]: se reintenta
    for (const end = Date.now() + 20_000; ; await sleep(1000)) {
      try {
        const r = await mcp.call(CAP, 'CaptureGameViewport', {world, maxResolution: 1920}, 60_000), v = r.value as {width: number; height: number};
        if (!r.image) throw new Error('La captura no trajo imagen');
        mkdirSync(dirname(resolve(salida)), {recursive: true});
        writeFileSync(salida, r.image);
        return {ancho: v.width, alto: v.height, ms: Date.now() - t0};
      } catch (e) { if (Date.now() > end) throw e; }
    }
  } finally { await mcp.call(APP, 'StopPIE', {}, 60_000).catch(() => {}); }
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
  // hasta que no queda el proceso: quien cierra el caliente suele abrir otro Unreal justo después (un editor a la vez)
  // (process.kill(pid, 0) ya falla mientras Windows aún lista el proceso cerrándose: se mira tasklist, como probeMachine)
  const listado = () => process.platform === 'win32' && (spawnSync('tasklist', ['/FI', `PID eq ${beat.pid}`, '/NH'], {encoding: 'utf8', windowsHide: true}).stdout ?? '').includes(String(beat.pid));
  for (const end = Date.now() + 15_000; Date.now() < end && (alive(beat.pid) || listado()); ) await sleep(200);
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
 * Pide el turno de Unreal de `tarea` al servicio y espera a que se lo den (`nomos worker turn --wait` y `ue … --tarea`).
 * Antes de volver cierra los editores calientes de otros que el servicio dice que siguen abiertos (un editor a la vez).
 * `held`: el turno ya era suyo (pedido a mano).
 */
export async function pedirTurno(info: ServiceInfo, tarea: string, uproject?: string, cadaMs = 5000): Promise<{held: boolean}> {
  const path = `/tasks/${encodeURIComponent(tarea)}/turn`;
  for (let last = ''; ; await sleep(cadaMs)) {
    const answer = await request(info, path, uproject ? {uproject} : {}) as {granted: boolean; reason?: string; held?: boolean; cerrar?: string[]};
    if (answer.granted) {
      for (const otro of answer.cerrar ?? []) await stopWarm(otro);
      return {held: !!answer.held};
    }
    if (answer.reason !== last) console.error(last = answer.reason ?? '');
  }
}

/** x10: turno por operación. Con `--tarea`, `ue py`/`ue test` piden el turno, ejecutan y lo sueltan dejando el editor
 *  caliente abierto (el servicio lo apunta y lo cierra si otro necesita Unreal). Un turno pedido a mano no se suelta. */
async function conTurno<T>(turno: {info: ServiceInfo; tarea: string} | null, uproject: string, fn: () => Promise<T>): Promise<T> {
  if (!turno) return fn();
  const {held} = await pedirTurno(turno.info, turno.tarea, uproject, 2000);
  try { return await fn(); } finally {
    if (!held) await request(turno.info, `/tasks/${encodeURIComponent(turno.tarea)}/turn/release`, warmBeat(uproject) ? {caliente: uproject} : {});
  }
}

/**
 * `nomos ue py SCRIPT [--env K=V]… [--proyecto X.uproject] [--timeout S] [--tarea ID]`: el script en el editor caliente;
 * `nomos ue test FILTRO` corre «Automation RunTests» en él y escribe el resumen JSON;
 * `nomos ue parar` lo cierra y `nomos ue estado` dice si está abierto. Sale con 1 si el script o algún test falla.
 * En pruebas `NOMOS_UE_FAKE` es el editor falso (se lanza con node).
 */
/** El UnrealEditor-Cmd que pide el `.uproject` de `dir`, si está instalado. */
const engineCmd = (dir: string) => { const e = gameEngine(dir); return e && 'cmd' in e ? e.cmd : undefined; };
export async function ueCli(argv: string[]): Promise<boolean> {
  // solo si `ue` es la orden (el primer posicional): `nomos reply ID ue …` no es esto
  const first = argv.find((arg, i) => !arg.startsWith('--') && !['--data', '--env', '--proyecto', '--timeout', '--tarea', '--espera', '--mapa'].includes(argv[i - 1] ?? ''));
  if (first !== 'ue') return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'},
    env: {type: 'string', multiple: true}, proyecto: {type: 'string'}, timeout: {type: 'string'}, tarea: {type: 'string'},
    espera: {type: 'string'}, mapa: {type: 'string'},
    validar: {type: 'boolean'}, forzar: {type: 'boolean'}}});
  const [, action, file, ...extra] = positionals;
  if (!['py', 'test', 'receta', 'recetas', 'parar', 'estado', 'crash', 'compilar', 'captura'].includes(action) || extra.length
    || ['py', 'test', 'receta', 'captura'].includes(action) !== !!file)
    throw new Error('Uso: nomos ue py SCRIPT.py [--env K=V]… [--proyecto X.uproject] [--timeout S] | ue test FILTRO [--proyecto X] [--timeout S]'
      + ' | ue receta RECETA.json [--validar] [--forzar] | ue recetas | ue parar | ue estado | ue crash [--proyecto X]'
      + ' | ue compilar | ue captura SALIDA.png [--env K=V]… [--espera S] [--mapa /Game/…]');
  if (action === 'recetas') { console.log(JSON.stringify(plantillasRecetas, null, 2)); return true; }
  if (action === 'receta' && values.validar) {
    const v = validarReceta(JSON.parse(readFileSync(file, 'utf8')));
    console.log(JSON.stringify(v.ok ? {ok: true} : v));
    if (!v.ok) process.exitCode = 1;
    return true;
  }
  const uproject = resolve(values.proyecto ?? findUproject(process.cwd()));
  if (action === 'crash') { console.log(JSON.stringify(ultimoCrash(carpetasCrash(dirname(uproject)), dirname(uproject)), null, 2)); return true; }
  const fake = process.env.NOMOS_UE_FAKE;
  const opts: WarmOpts = fake ? {bin: process.execPath, baseArgs: [fake], startTimeoutMs: 20_000}
    // el motor de config.json o el del juego; con --proyecto fuera de --data, el que pide ese .uproject (no el 5.8 por defecto)
    : {bin: assetConfig(resolve(values.data ?? '.nomos')).unrealPath ?? engineCmd(dirname(uproject))};
  if (action === 'estado') { const beat = warmBeat(uproject); console.log(JSON.stringify(beat ? {abierto: true, ...beat} : {abierto: false})); return true; }
  if (action === 'parar') { console.log(JSON.stringify({cerrado: await stopWarm(uproject)})); return true; }
  const timeout = values.timeout ? {timeoutMs: Number(values.timeout) * 1000} : {};
  const turno = values.tarea ? {info: serviceInfo(resolve(values.data ?? '.nomos')), tarea: values.tarea} : null;
  if (action === 'test') {
    const r = await conTurno(turno, uproject, () => runTests(uproject, file, {...opts, ...timeout}));
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 1;
    return true;
  }
  if (action === 'receta') {
    const v = validarReceta(JSON.parse(readFileSync(file, 'utf8')));
    if (!v.ok) throw new Error(`Receta no válida:\n${v.errores.join('\n')}`);
    const dataDir = resolve(values.data ?? '.nomos'), ue = createUnrealCmd({bin: opts.bin}).engineVersion() ?? 'desconocida';
    mkdirSync(dataDir, {recursive: true});
    const db = openDb(dbFile(dataDir));
    try {
      const t0 = Date.now();
      if (!values.forzar && enCache(db, uproject, v.receta, ue)) { console.log(JSON.stringify({ok: true, plantilla: v.receta.plantilla, acierto: true, ms: Date.now() - t0})); return true; }
      const tmp = mkdtempSync(join(tmpdir(), 'nomos-receta-')), job = join(tmp, 'receta.json'), report = join(tmp, 'informe.json');
      writeFileSync(job, JSON.stringify(v.receta));
      try {
        const env = {NOMOS_RECETA_JOB: job, NOMOS_REPORT: report}, script = join(unrealDir, 'nomos_recetas.py');
        const r = await conTurno(turno, uproject, async () => {
          if (calienteActivo()) try { return await runWarm(uproject, script, env, {...opts, ...timeout}); } catch (e) {
            if (e instanceof Error && e.message === 'unreal_timeout') throw e;
            console.error(`editor caliente: ${e instanceof Error ? e.message : e}; receta en frío`);
            await stopWarm(uproject);
          }
          const frio = await createUnrealCmd({bin: opts.bin, baseArgs: opts.baseArgs}).runPython(uproject, script, env, timeout.timeoutMs ?? 30 * 60_000);
          return {ok: frio.exitCode === 0, salida: '', error: frio.exitCode === 0 ? null : frio.log.split(/\r?\n/).filter(l => /error/i.test(l)).slice(-10).join('\n'), ms: 0};
        });
        const informe = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : {ok: false, errores: [r.error ?? 'el editor no dejó informe']};
        const ok = r.ok && informe.ok === true;
        if (ok) recordar(db, v.receta, ue);
        console.log(JSON.stringify({...informe, ok, ms: Date.now() - t0}, null, 2));
        if (!ok) process.exitCode = 1;
      } finally { rmSync(tmp, {recursive: true, force: true}); }
    } finally { db.close(); }
    return true;
  }
  const env = Object.fromEntries((values.env ?? []).map(pair => {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new Error(`--env espera CLAVE=valor: ${pair}`);
    return [pair.slice(0, eq), pair.slice(eq + 1)];
  }));
  if (action === 'compilar') {
    const r = await conTurno(turno, uproject, () => liveCompile(uproject, {...opts, ...timeout}));
    console.error(`live coding: ${r.resultado} en ${(r.ms / 1000).toFixed(1)} s`);
    if (!r.ok) { process.stdout.write(r.salida + '\n'); process.exitCode = 1; }
    return true;
  }
  if (action === 'captura') {
    const r = await conTurno(turno, uproject, () => capturePie(uproject, resolve(file),
      {...opts, env, mapa: values.mapa, ...(values.espera ? {esperaS: Number(values.espera)} : {})}));
    console.log(JSON.stringify({captura: resolve(file), ...r}));
    return true;
  }
  const result = await conTurno(turno, uproject, () => runWarm(uproject, resolve(file), env, {...opts, ...timeout}));
  console.error(result.arranque === null ? `editor caliente: ${result.ms} ms` : `editor caliente: abierto en ${result.arranque.toFixed(0)} s; script ${result.ms} ms`);
  if (result.salida) process.stdout.write(result.salida.endsWith('\n') ? result.salida : result.salida + '\n');
  if (result.error) console.error(result.error);
  if (!result.ok) process.exitCode = 1;
  return true;
}
