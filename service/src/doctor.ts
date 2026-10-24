import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { createOrca } from './adapters/orca.ts';
import { createMeshy } from './adapters/meshy.ts';
import { createUnrealCmd, defaultUnrealCmd } from './adapters/unreal-cmd.ts';
import { detectCapabilities } from './repo/capabilities.ts';
import { capabilityList, configFs, type CheckResult } from './capability-checks.ts';
import { readServiceInfo, isAlive } from './service-info.ts';
import type { Lane } from './commands.ts';
import { stalledTasks } from './stall.ts';

type Probe = {isRunning?(): Promise<boolean>; open?(): Promise<void>};
export type CheckDeps = {orca?: Probe; meshy?: {balance(): Promise<number>}; env?: NodeJS.ProcessEnv;
  unrealPath?: string | null; blenderPath?: string | null; dataDir?: string};
const run = promisify(execFile);
const firstLine = async (bin: string, args: string[]) =>
  (await run(bin, args, {timeout: 10_000, windowsHide: true})).stdout.trim().split(/\r?\n/)[0];
const required = ['node', 'orca', 'unreal', 'git'];

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
  const detected = detectCapabilities(env, configFs(deps.dataDir)).find(c => c.id === id);
  if (!detected) throw new Error('unknown_capability');
  return detected.state === 'ausente' ? {state: 'ausente', detail: detected.detail}
    : {state: 'comprobado', detail: detected.detail.replace(/ detectado$/, ' presente')};
}

export type DoctorRow = {id: string; label: string; state: 'ok' | 'aviso' | 'falla'; detail: string};
/** `kratos doctor` y `GET /doctor`: capacidades, Orca en vivo, servicio (sin el token) y los dos carriles con su latido. */
export async function doctor(dataDir: string, db: DatabaseSync, deps: CheckDeps = {}, now = Date.now()): Promise<DoctorRow[]> {
  const rows: DoctorRow[] = capabilityList(dataDir, db).map(c => ({id: c.id, label: c.label, detail: c.detail,
    state: c.state === 'roto' ? 'falla' : c.state === 'ausente' ? required.includes(c.id) ? 'falla' : 'aviso' : 'ok'}));
  const orca = rows.find(r => r.id === 'orca');
  if (orca && orca.state !== 'falla') Object.assign(orca, await (deps.orca ?? createOrca()).isRunning?.()
    ? {state: 'ok', detail: 'Orca abierto'} : {state: 'falla', detail: 'Orca no está abierto: ábrelo o usa «Abrir Orca» en Capacidades'});
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
