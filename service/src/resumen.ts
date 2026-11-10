import * as nodeFs from 'node:fs';
import { existsSync, statfsSync } from 'node:fs';
import { homedir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createMeshy } from './adapters/meshy.ts';
import { balances, meshyAccounts } from './adapters/meshy-accounts.ts';
import { createUnrealCmd, defaultUnrealCmd } from './adapters/unreal-cmd.ts';
import { assetConfig } from './catalog/paths.ts';
import { concurrency, readConfig } from './config.ts';
import { necessary, optional, type Requirement } from './doctor.ts';
import { gameEngine } from './engine-path.ts';
import { probeMachine, type Machine } from './machine.ts';
import { unrealServers } from './repo/capabilities.ts';
import { behindCounts, listPeers, teamConfig } from './team.ts';

/**
 * Jam panel: `GET /resumen`, la tarjeta de estado de Inicio. Solo datos que existen: una fuente sin configurar no da
 * cifra, sale en `falta`. Ninguna clave sale de aquí (de Meshy solo el nombre de la cuenta y su saldo).
 */
export type Falta = {que: string; comando?: string; detalle?: string};
export type Resumen = {
  claude: {tokensHoy: number; tokensSemana: number; workers: number; director: boolean};
  ias: {id: 'codex' | 'opencode'; nombre: string; cupo: number; enUso: number}[];
  meshy: {cuentas: {nombre: string; creditos: number | null}[]; total: number} | null;
  maquina: {unreal: string | null; ramLibreGb: number; ramTotalGb: number; discoLibreGb: number | null; discoTotalGb: number | null; discoBajo: boolean; editores: number};
  equipo: {personas: number; conectadas: number; atrasados: {nombre: string; commits: number}[]} | null;
  falta: Falta[];
  generado: string;
};

/** Lo que tarda o cuesta (procesos, red, API de pago): se cachea en la ruta. */
export type Lentas = {
  requisitos: Requirement[]; maquina: Machine; ramTotalGb: number; disco: {libreGb: number; totalGb: number} | null;
  unreal: string | null; unrealMcp: boolean | null; emsdk: boolean | null;
  equipo: Resumen['equipo'];
};
export type Meshy = {nombre: string; creditos: number | null}[];

export const DISCO_MINIMO_GB = 25;
const GB = 2 ** 30;

/** Comando que arregla cada requisito ausente de doctor (sin comando: se dice qué falta y qué se pierde). */
const arreglo: Record<string, string> = {
  'Git': 'winget install Git.Git',
  'Node ≥ 25': 'winget install OpenJS.NodeJS',
  'Claude Code': 'npm install -g @anthropic-ai/claude-code',
  'ffmpeg': 'winget install Gyan.FFmpeg',
  'Pillow': 'pip install pillow',
};

export function resumen(db: DatabaseSync, dataDir: string | undefined, lentas: Lentas, meshy: Meshy, now = new Date()): Resumen {
  const hoy = new Date(now); hoy.setHours(0, 0, 0, 0);
  const semana = new Date(now.getTime() - 7 * 86_400_000);
  const tokens = (desde: Date) => Number(db.prepare("select coalesce(sum(amount),0) n from spends where kind='tokens' and updated_at>=?").get(desde.toISOString())!.n);
  const vivos = db.prepare("select provider,role from runs where state='running'").all() as {provider: string; role: string}[];
  let config = {};
  try { if (dataDir) config = readConfig(dataDir); } catch { /* config ilegible: cupos por defecto */ }
  const cupo = concurrency(config);
  const ias = (['codex', 'opencode'] as const).filter(id => cupo[id] > 0)
    .map(id => ({id, nombre: id === 'codex' ? 'Codex' : 'OpenCode', cupo: cupo[id], enUso: vivos.filter(r => r.provider === id && r.role !== 'director').length}));

  const falta: Falta[] = lentas.requisitos.filter(r => !r.present)
    .map(r => ({que: r.name, detalle: `${r.detail} · ${r.lost}`, ...(arreglo[r.name] ? {comando: arreglo[r.name]} : {})}));
  if (!meshy.length) falta.push({que: 'Meshy sin cuentas', comando: `powershell -File ${join(homedir(), '.nomos', 'guardar-claves-meshy.ps1')}`});
  else if (meshy.every(c => c.creditos === 0)) falta.push({que: 'Meshy sin créditos', detalle: 'Todas las cuentas están a 0: recarga una o añade otra'});
  if (lentas.unrealMcp === false) falta.push({que: 'MCP de Unreal', comando: 'claude mcp add --transport http unreal-mcp http://127.0.0.1:8000/mcp'});
  if (lentas.emsdk === false) falta.push({que: 'emsdk para la versión web', comando: 'git clone --depth 1 https://github.com/emscripten-core/emsdk %USERPROFILE%\\emsdk && %USERPROFILE%\\emsdk\\emsdk.bat install 6.0.10'});
  const discoBajo = lentas.disco !== null && lentas.disco.libreGb < DISCO_MINIMO_GB;
  if (discoBajo) falta.push({que: 'Poco disco', comando: 'nomos clean', detalle: `Quedan ${Math.floor(lentas.disco!.libreGb)} GB; Unreal pide al menos ${DISCO_MINIMO_GB}`});

  return {
    claude: {tokensHoy: tokens(hoy), tokensSemana: tokens(semana), workers: vivos.filter(r => r.role !== 'director' && ['claude', 'codex'].includes(r.provider)).length,
      director: vivos.some(r => r.role === 'director')},
    ias,
    meshy: meshy.length ? {cuentas: meshy, total: meshy.reduce((n, c) => n + (c.creditos ?? 0), 0)} : null,
    maquina: {unreal: lentas.unreal, ramLibreGb: lentas.maquina.freeGb, ramTotalGb: lentas.ramTotalGb, discoLibreGb: lentas.disco?.libreGb ?? null,
      discoTotalGb: lentas.disco?.totalGb ?? null, discoBajo, editores: lentas.maquina.editors},
    equipo: lentas.equipo,
    falta,
    generado: now.toISOString(),
  };
}

/** Las fuentes de verdad de este PC y este juego. */
export async function lentasReales(db: DatabaseSync, dataDir: string): Promise<Lentas> {
  const game = dirname(dataDir), engine = gameEngine(dataDir);
  let bin: string | null = engine && 'cmd' in engine ? engine.cmd : null;
  if (!bin && !(engine && 'missing' in engine)) try { bin = assetConfig(dataDir).unrealPath || defaultUnrealCmd; } catch { bin = defaultUnrealCmd; }
  const version = bin && existsSync(bin) ? createUnrealCmd({bin}).engineVersion() : null;
  let disco: Lentas['disco'] = null;
  try { const s = statfsSync(dataDir); disco = {libreGb: s.bavail * s.bsize / GB, totalGb: s.blocks * s.bsize / GB}; } catch { /* sin datos de disco */ }
  const [nec, opt] = await Promise.all([necessary(dataDir), optional(dataDir)]);
  // emsdk solo cuenta si el juego va en Unreal 5.9 (la versión web)
  const web = /^5\.9/.test(version ?? (engine && 'version' in engine ? engine.version : ''));
  let equipo: Lentas['equipo'] = null;
  if (teamConfig(dataDir)) {
    const peers = listPeers(db), behind = await behindCounts(dataDir, game, peers).catch(() => ({} as Record<string, number>));
    equipo = {personas: peers.length, conectadas: peers.filter(p => p.present).length,
      atrasados: peers.filter(p => (behind[p.id] ?? 0) > 0).map(p => ({nombre: p.name, commits: behind[p.id]}))};
  }
  return {
    requisitos: [...nec, ...opt], maquina: probeMachine(), ramTotalGb: totalmem() / GB, disco, unreal: version,
    unrealMcp: unrealServers(nodeFs, game, process.env.USERPROFILE ?? process.env.HOME).length > 0,
    emsdk: web ? existsSync(join(homedir(), 'emsdk', 'emsdk.bat')) : null,
    equipo,
  };
}

/** Saldo por cuenta (env y meshy-claves.json): solo nombre y créditos. */
export async function meshyReal(): Promise<Meshy> {
  const accounts = meshyAccounts();
  const known = await balances(accounts, a => createMeshy({apiKey: a.key()}));
  return accounts.map((a, i) => ({nombre: a.name, creditos: known[i]}));
}

/** Caché por carpeta de datos: lo lento 30 s, Meshy 5 min (es una API de pago con límite). */
const cache = new Map<string, {lentas?: {at: number; value: Promise<Lentas>}; meshy?: {at: number; value: Promise<Meshy>}}>();
export const LENTAS_MS = 30_000, MESHY_MS = 5 * 60_000;
export async function resumenCacheado(db: DatabaseSync, dataDir: string,
  fuentes: {lentas: () => Promise<Lentas>; meshy: () => Promise<Meshy>} = {lentas: () => lentasReales(db, dataDir), meshy: meshyReal},
  now = Date.now()): Promise<Resumen> {
  const entry = cache.get(dataDir) ?? {};
  cache.set(dataDir, entry);
  if (!entry.lentas || now - entry.lentas.at > LENTAS_MS) entry.lentas = {at: now, value: fuentes.lentas()};
  if (!entry.meshy || now - entry.meshy.at > MESHY_MS) entry.meshy = {at: now, value: fuentes.meshy()};
  const lentas = entry.lentas.value, meshy = entry.meshy.value;
  try { return resumen(db, dataDir, await lentas, await meshy, new Date(now)); }
  catch (error) { if (entry.lentas.value === lentas) delete entry.lentas; if (entry.meshy.value === meshy) delete entry.meshy; throw error; }
}
export const olvidarResumen = () => cache.clear();
