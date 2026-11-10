import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { createOrca } from './adapters/orca.ts';
import { createMeshy } from './adapters/meshy.ts';
import { createUnrealCmd, defaultUnrealCmd } from './adapters/unreal-cmd.ts';
import { detectCapabilities } from './repo/capabilities.ts';
import { ffmpegVersion, findFfmpeg, type Ffmpeg } from './adapters/ffmpeg.ts';
import { defaultMemoryCommand, readConfig } from './config.ts';
import { assetConfig } from './catalog/paths.ts';
import { gameEngine } from './engine-path.ts';
import { launcherMode } from './adapters/process-terminal.ts';
import { capabilityList, configFs, type CheckResult } from './capability-checks.ts';
import { readServiceInfo, isAlive } from './service-info.ts';
import type { Lane } from './commands.ts';
import { stalledTasks } from './stall.ts';
import { findGraphify, hasCode, ponytailEnabled } from './graph.ts';

type Probe = {isRunning?(): Promise<boolean>; open?(): Promise<void>};
export type CheckDeps = {orca?: Probe; meshy?: {balance(): Promise<number>}; env?: NodeJS.ProcessEnv;
  unrealPath?: string | null; blenderPath?: string | null; dataDir?: string; ffmpeg?: Ffmpeg | null};
const run = promisify(execFile);
const firstLine = async (bin: string, args: string[], env?: NodeJS.ProcessEnv) =>
  (await run(bin, args, {timeout: 10_000, windowsHide: true, env})).stdout.trim().split(/\r?\n/)[0];
const required = ['node', 'unreal', 'git'];

/** «Comprobar ahora» (hito 7): la comprobación real de una capacidad, no solo si el archivo existe. */
export async function checkCapability(id: string, deps: CheckDeps): Promise<CheckResult> {
  const env = deps.env ?? process.env;
  if (id === 'node') {
    const major = Number(process.versions.node.split('.')[0]);
    return major >= 25 ? {state: 'comprobado', detail: `Node.js ${process.versions.node}`}
      : {state: 'roto', detail: `Node.js ${process.versions.node}: hace falta la 25 o posterior`};
  }
  if (id === 'orca') {
    // «Abrir Orca»: si está cerrado se abre (`orca open`) y se vuelve a mirar
    const orca = deps.orca ?? createOrca();
    if (await orca.isRunning?.()) return {state: 'comprobado', detail: 'Orca abierto'};
    try { await orca.open?.(); } catch { /* sigue cerrado */ }
    return await orca.isRunning?.() ? {state: 'comprobado', detail: 'Orca abierto'} : {state: 'roto', detail: 'Orca no está abierto'};
  }
  if (id === 'git') {
    try { return {state: 'comprobado', detail: await firstLine('git', ['--version'])}; }
    catch { return {state: 'ausente', detail: 'Git no encontrado'}; }
  }
  if (id === 'git_lfs') {
    const project = deps.dataDir && /filter=lfs/.test((() => { try { return readFileSync(join(dirname(deps.dataDir), '.gitattributes'), 'utf8'); } catch { return ''; } })())
      ? 'configurado en el proyecto' : 'sin configurar en el proyecto';
    try { return {state: 'comprobado', detail: `${(await firstLine('git', ['lfs', 'version'])).split(' ')[0].replace('/', ' ')} · ${project}`}; }
    catch { return {state: 'ausente', detail: 'git-lfs no está instalado: el contenido pesado solo puede integrarse sin LFS'}; }
  }
  if (id === 'meshy') {
    if (!env.MESHY_API_KEY) return {state: 'ausente', detail: 'Falta MESHY_API_KEY'};
    try { return {state: 'comprobado', detail: `Saldo de Meshy: ${await (deps.meshy ?? createMeshy()).balance()} créditos`}; }
    catch (error) { return {state: 'roto', detail: `Meshy rechazó la consulta: ${error instanceof Error ? error.message : String(error)}`}; }
  }
  if (id === 'unreal') {
    // la versión sale de Engine/Build/Build.version: UnrealEditor-Cmd no tiene un «-version» que salga sin cargar el motor
    const bin = deps.unrealPath || defaultUnrealCmd;
    if (!existsSync(bin)) return {state: 'ausente', detail: 'Editor de Unreal no encontrado'};
    const engine = createUnrealCmd({bin}).engineVersion();
    return engine ? {state: 'comprobado', detail: `Unreal Engine ${engine}`} : {state: 'roto', detail: 'Falta Engine/Build/Build.version'};
  }
  if (id === 'blender') {
    try { return {state: 'comprobado', detail: await firstLine(deps.blenderPath || 'blender', ['--version'])}; }
    catch { return {state: 'ausente', detail: 'Blender no encontrado'}; }
  }
  if (id === 'ffmpeg') {
    const ff = deps.ffmpeg !== undefined ? deps.ffmpeg : findFfmpeg(deps.dataDir ? (readConfig(deps.dataDir) as Record<string, unknown>).ffmpegPath : undefined);
    const version = ff ? await ffmpegVersion(ff) : null;
    return version ? {state: 'comprobado', detail: `ffmpeg ${version}`} : {state: 'ausente', detail: 'ffmpeg no encontrado: los vídeos de animación salen como zip de fotogramas'};
  }
  const detected = detectCapabilities(env, configFs(deps.dataDir)).find(c => c.id === id);
  if (!detected) throw new Error('unknown_capability');
  return detected.state === 'ausente' ? {state: 'ausente', detail: detected.detail}
    : {state: 'comprobado', detail: detected.detail.replace(/ detectado$/, ' presente')};
}

/** Hito 30: lo que Nomos no puede traer en el repo del juego (Necesario) y lo que solo suma (Opcional). */
export type Requirement = {name: string; present: boolean; detail: string; lost: string};
const tool = async (bin: string, env: NodeJS.ProcessEnv) => {
  try { return await firstLine(bin, ['--version'], env); } catch { return null; }
};
export async function necessary(dataDir: string, deps: CheckDeps = {}): Promise<Requirement[]> {
  const env = deps.env ?? process.env, node = Number(process.versions.node.split('.')[0]);
  let unreal = deps.unrealPath;
  if (unreal === undefined) try { unreal = assetConfig(dataDir).unrealPath; } catch { /* config ilegible: el valor por defecto */ }
  unreal ||= defaultUnrealCmd;
  // jam 2026-11-10: el .uproject pide un motor que no está: se dice cuál, no se cae al 5.8 en silencio
  let own: unknown;
  try { own = (readConfig(dataDir) as Record<string, unknown>).unrealPath; } catch { /* config ilegible: la fila de configuración lo dice */ }
  const engine = deps.unrealPath === undefined && !own ? gameEngine(dataDir) : null;
  const wanted = engine && 'missing' in engine ? engine.missing : null;
  const [git, claude] = await Promise.all([tool('git', env), tool('claude', env)]);
  return [
    {name: 'Git', present: !!git, detail: git ?? 'no está en el PATH', lost: 'sin worktrees, ramas ni integración'},
    {name: 'Node ≥ 25', present: node >= 25, detail: `Node.js ${process.versions.node}`, lost: 'el servicio no arranca'},
    {name: 'Claude Code', present: !!claude, detail: claude ?? '`claude` no está en el PATH', lost: 'sin director ni workers'},
    {name: 'Unreal', present: !wanted && existsSync(unreal), detail: wanted ? `Este juego pide Unreal ${wanted} y no está instalado` : unreal, lost: 'sin compilar, probar ni capturar el juego (unrealPath en .nomos/config.json)'},
  ];
}
export async function optional(dataDir: string, deps: CheckDeps = {}): Promise<Requirement[]> {
  const env = deps.env ?? process.env, graphify = findGraphify(env), brain = defaultMemoryCommand(env)?.at(-1);
  let ffPath: unknown;
  try { ffPath = (readConfig(dataDir) as Record<string, unknown>).ffmpegPath; } catch { /* config ilegible */ }
  const ff = deps.ffmpeg !== undefined ? deps.ffmpeg : findFfmpeg(ffPath), orca = !!await (deps.orca ?? createOrca({env})).isRunning?.();
  return [
    {name: 'Orca', present: orca, detail: orca ? 'abierto' : 'cerrado o sin instalar', lost: 'los workers corren como procesos `claude` sin terminal visible'},
    {name: 'graphify', present: !!graphify, detail: graphify ?? 'no encontrado', lost: 'sin grafo del código del juego'},
    {name: 'ponytail', present: ponytailEnabled(env), detail: 'plugin de Claude Code', lost: 'los workers no aplican la escalera de diff mínimo'},
    {name: 'Second Brain', present: !!brain, detail: brain ?? 'brain.py no encontrado', lost: 'memoria apagada: el cierre no guarda lecciones'},
    {name: 'ffmpeg', present: !!ff, detail: ff?.bin ?? 'no encontrado', lost: 'los vídeos de animación salen como zip de fotogramas'},
  ];
}
export function renderRequirements(title: string, rows: Requirement[]): string {
  const width = Math.max(title.length, ...rows.map(r => r.name.length));
  return [`${title.padEnd(width)}  Estado    Detalle (si falta, qué se pierde)`,
    ...rows.map(r => `${r.name.padEnd(width)}  ${(r.present ? 'presente' : 'ausente').padEnd(8)}  ${r.present ? r.detail : `${r.detail} · ${r.lost}`}`)].join('\n');
}

export type DoctorRow = {id: string; label: string; state: 'ok' | 'aviso' | 'falla'; detail: string};
/** `nomos doctor` y `GET /doctor`: capacidades, Orca en vivo, servicio (sin el token) y los dos carriles con su latido. */
export async function doctor(dataDir: string, db: DatabaseSync, deps: CheckDeps = {}, now = Date.now()): Promise<DoctorRow[]> {
  const rows: DoctorRow[] = capabilityList(dataDir, db).map(c => ({id: c.id, label: c.label, detail: c.detail,
    state: c.state === 'roto' ? 'falla' : c.state === 'ausente' ? required.includes(c.id) ? 'falla' : 'aviso' : 'ok'}));
  const orca = rows.find(r => r.id === 'orca'), orcaUp = orca?.state !== 'falla' && !!await (deps.orca ?? createOrca()).isRunning?.();
  if (orca && orca.state !== 'falla') Object.assign(orca, orcaUp
    ? {state: 'ok', detail: 'Orca abierto'} : {state: 'aviso', detail: 'Orca no está abierto: los workers van como procesos (ábrelo o usa «Abrir Orca» en Capacidades)'});
  // hito 30: sin Orca, los workers son procesos `claude` hijos
  let mode = 'auto';
  try { mode = launcherMode(readConfig(dataDir)); } catch { /* config inválida: la fila de configuración lo dice */ }
  rows.push({id: 'workers', label: 'Lanzador de workers', state: 'ok',
    detail: mode === 'orca' || mode === 'auto' && orcaUp ? 'Orca' : 'proceso (`claude` en PATH)'});
  // hito 23: el grafo de cada juego es imprescindible; ponytail (plugin de Claude Code) solo avisa
  const env = deps.env ?? process.env, graphify = findGraphify(env);
  rows.push({id: 'graphify', label: 'graphify', ...!hasCode(dirname(dataDir)) ? {state: 'ok' as const, detail: 'sin código C++, apagado (solo indexa código; no ve Blueprints ni mapas)'}
    : graphify ? {state: 'ok' as const, detail: graphify}
    : {state: 'aviso' as const, detail: 'graphify no encontrado (PATH o ~/.local/bin): sin grafo del código'}});
  rows.push({id: 'ponytail', label: 'ponytail', ...ponytailEnabled(env) ? {state: 'ok' as const, detail: 'Plugin activo en ~/.claude/settings.json'}
    : {state: 'aviso' as const, detail: 'Falta "ponytail@ponytail": true en enabledPlugins de ~/.claude/settings.json'}});
  const info = readServiceInfo(dataDir);
  rows.push({id: 'service', label: 'Servicio', ...(info && await isAlive(info)
    ? {state: 'ok' as const, detail: `http://127.0.0.1:${info.port} · token en service.json`}
    : {state: 'aviso' as const, detail: 'Servicio detenido'})});
  for (const lane of ['normal', 'long'] as Lane[]) {
    const active = db.prepare("select type,heartbeat_at from commands where state='running' and lane=? order by rowid limit 1").get(lane);
    const age = active?.heartbeat_at ? Math.max(0, Math.round((now - Date.parse(active.heartbeat_at as string)) / 1000)) : null;
    rows.push({id: `lane:${lane}`, label: lane === 'normal' ? 'Carril normal' : 'Carril largo',
      state: active && (age === null || age > 60) ? 'falla' : 'ok',
      detail: !active ? 'Libre' : age === null ? `${active.type} · sin latido` : `${active.type} · último latido hace ${age} s`});
  }
  const stalls = stalledTasks(db, now);
  rows.push({id: 'stalls', label: 'Tareas atascadas', state: stalls.length ? 'falla' : 'ok',
    detail: stalls.length ? stalls.map(s => `${s.title} · ${s.state} · ${Math.round(s.quietSeconds / 60)} min sin paso en marcha`).join('; ') : 'Ninguna'});
  return rows;
}

export function renderDoctor(rows: DoctorRow[]): string {
  const width = Math.max('Capacidad'.length, ...rows.map(r => r.label.length));
  const states = {ok: 'OK', aviso: 'AVISO', falla: 'FALLA'};
  return [`${'Capacidad'.padEnd(width)}  Estado  Detalle`,
    ...rows.map(r => `${r.label.padEnd(width)}  ${states[r.state].padEnd(6)}  ${r.detail}`)].join('\n');
}
