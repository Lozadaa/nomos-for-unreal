import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type WorkerProvider = 'codex' | 'claude' | 'opencode';
export type Limits = {corrections: number};
export type WorkerModel = 'sonnet' | 'opus' | 'haiku';
const models=['sonnet','opus','haiku'];
export type SchedulerConfig = {concurrency?: Partial<Record<WorkerProvider,number>>; defaultProvider?: WorkerProvider;
  /** Hito 7: fracción de píxeles distintos que tolera la regresión visual (2 % por defecto). */
  visualTolerance?: number; limits?: Partial<Limits>;
  /** Modelo Claude de implementación cuando `models` no lo fija (compatibilidad). */
  workerModel?: WorkerModel;
  /** Hito 24: un modelo Claude por rol; opus implementa y sonnet hace el resto por defecto. */
  models?: Partial<Record<ModelRole,WorkerModel>>;
  /** Hito 12: modelo de OpenCode, siempre explícito para no heredar el caro del usuario; gratuito por defecto. */
  opencodeModel?: string;
  /** Hito 16: minutos que una run en marcha aguanta sin respuesta de Orca antes de marcarse failed (10 por defecto). */
  orca?: {graceMinutes?: number;
    /** Hito 19: minutos que Orca deja vivo el terminal de un worker (240); el relevo llega 15 min antes. */
    maxWorkerMinutes?: number;
    /** Hito 22: milisegundos que se espera a que Orca cree el worktree (180 000); en frío pasa del minuto. */
    createTimeoutMs?: number};
  /** Hito 30: quién lanza los workers; `auto` = Orca si responde, si no proceso `claude` hijo. */
  launcher?: 'auto' | 'orca' | 'process';
  /** Hito 22: el PC aguanta un Unreal pesado a la vez y pide RAM libre para abrirlo. */
  scheduler?: {heavy?: {maxConcurrent?: number}; minFreeRamGb?: number; heavyRequiresNoEditor?: boolean}};
/** Codex apagado por defecto (hito 7, regla del usuario): se habilita con `concurrency.codex` en config.json. */
export function concurrency(config: SchedulerConfig): Record<WorkerProvider,number> {
  return config.concurrency===undefined ? {codex:0,claude:2,opencode:0}
    : {codex:config.concurrency.codex ?? 0,claude:config.concurrency.claude ?? 0,opencode:config.concurrency.opencode ?? 0};
}
export const visualTolerance = (config: SchedulerConfig) => config.visualTolerance ?? 0.02;
export type ModelRole = 'implementacion' | 'revisor' | 'qa' | 'integrador' | 'animacion';
const modelRoles=['implementacion','revisor','qa','integrador','animacion'];
/** Hito 24: el rol de un worker (cualquier rol de juego es implementación; la QA visual es un revisor con capturas). */
export function roleModel(config: SchedulerConfig, role: string, qa=false): WorkerModel {
  const key=(qa ? 'qa' : modelRoles.includes(role) ? role : 'implementacion') as ModelRole;
  return config.models?.[key] ?? (key==='implementacion' ? config.workerModel ?? 'opus' : 'sonnet');
}
/** Solo modelos de OpenCode Zen/Go, sin espacios ni comillas: viajan en la orden del terminal. */
export const isOpencodeModel = (v: unknown) => typeof v==='string' && /^opencode(-go)?\/[\w.-]+$/.test(v);
export const opencodeModel = (config: SchedulerConfig): string => config.opencodeModel ?? 'opencode/beam-free';
export const orcaGraceMinutes = (config: SchedulerConfig) => config.orca?.graceMinutes ?? 10;
export const maxWorkerMinutes = (config: SchedulerConfig) => config.orca?.maxWorkerMinutes ?? 240;
export const heavyMax = (config: SchedulerConfig) => config.scheduler?.heavy?.maxConcurrent ?? 1;
export const minFreeRamGb = (config: SchedulerConfig) => config.scheduler?.minFreeRamGb ?? 6;
export const heavyRequiresNoEditor = (config: SchedulerConfig) => config.scheduler?.heavyRequiresNoEditor ?? true;
export const orcaCreateTimeoutMs = (config: SchedulerConfig) => config.orca?.createTimeoutMs ?? 180_000;
/** Hito 22: CVars de consola antes de cada captura (sin comas ni comillas: viajan en -ExecCmds). */
export const captureCvars = (config: SchedulerConfig): string[] => (config as {checks?: {captureCvars?: string[]}}).checks?.captureCvars ?? [];
export const limits = (config: SchedulerConfig): Limits => ({corrections: config.limits?.corrections ?? 3});
/** Hito 30: brain.py de Second Brain en `SECOND_BRAIN_ROOT` o en `~/Documents/SecondBrain`; sin él, null y la memoria queda apagada. */
export function defaultMemoryCommand(env: NodeJS.ProcessEnv = process.env): string[] | null {
  const home = env.USERPROFILE || env.HOME || homedir();
  const brain = [env.SECOND_BRAIN_ROOT, join(home, 'Documents', 'SecondBrain')].filter(Boolean)
    .map(root => join(root!, '.system', 'brain.py')).find(file => existsSync(file));
  if (!brain) return null;
  return [existsSync('C:/Python314/python.exe') ? 'C:/Python314/python.exe' : process.platform === 'win32' ? 'python' : 'python3', '-X', 'utf8', brain];
}
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
export function readConfig(dataDir:string): SchedulerConfig & {criticalSystems?: unknown} {
  const file=join(dataDir,'config.json');
  if(!existsSync(file)) return {};
  try {
    const config=JSON.parse(readFileSync(file,'utf8'));
    if(!config || typeof config!=='object' || Array.isArray(config)) throw new Error();
    if(config.concurrency!==undefined && (!config.concurrency || typeof config.concurrency!=='object'
      || Array.isArray(config.concurrency) || Object.entries(config.concurrency).some(([k,v])=>
        !['codex','claude','opencode'].includes(k) || !count(v)))) throw new Error();
    if(config.defaultProvider!==undefined && !['codex','claude','opencode'].includes(config.defaultProvider)) throw new Error();
    if(config.visualTolerance!==undefined && (typeof config.visualTolerance!=='number' || !(config.visualTolerance>=0 && config.visualTolerance<=1))) throw new Error();
    if(config.workerModel!==undefined && !models.includes(config.workerModel)) throw new Error();
    if(config.models!==undefined && (!config.models || typeof config.models!=='object' || Array.isArray(config.models)
      || Object.entries(config.models).some(([k,v])=>!modelRoles.includes(k) || !models.includes(v as string)))) throw new Error();
    if(config.opencodeModel!==undefined && !isOpencodeModel(config.opencodeModel)) throw new Error();
    if(config.limits!==undefined && (!config.limits || typeof config.limits!=='object' || Array.isArray(config.limits)
      || Object.entries(config.limits).some(([k,v])=>k!=='corrections' || !count(v)))) throw new Error();
    if(config.orca!==undefined && (!config.orca || typeof config.orca!=='object' || Array.isArray(config.orca)
      || Object.entries(config.orca).some(([k,v])=>!['graceMinutes','maxWorkerMinutes','createTimeoutMs'].includes(k) || typeof v!=='number'
        || (k==='createTimeoutMs' ? !(v>0 && v<=3_600_000) : !(v>=0 && v<=24*60) || k==='maxWorkerMinutes' && v<=0)))) throw new Error();
    const scheduler=config.scheduler,object=(v:unknown)=>!!v && typeof v==='object' && !Array.isArray(v);
    if(scheduler!==undefined && (!object(scheduler) || Object.entries(scheduler).some(([k,v])=>
      k==='heavy' ? !object(v) || Object.entries(v as object).some(([h,n])=>h!=='maxConcurrent' || !count(n) || n<1)
      : k==='minFreeRamGb' ? typeof v!=='number' || !(v>=0 && v<=1024) : k!=='heavyRequiresNoEditor' || typeof v!=='boolean'))) throw new Error();
    if(config.graphify!==undefined && (!object(config.graphify) || Object.entries(config.graphify).some(([k,v])=>k!=='enabled' || typeof v!=='boolean'))) throw new Error();
    // hito 25: la orden de Second Brain (brain.py) a la que el cierre añade `--cwd <juego> capture …`
    if(config.memory!==undefined && (!object(config.memory) || Object.entries(config.memory).some(([k,v])=>k==='enabled' ? typeof v!=='boolean'
      : k!=='command' || !Array.isArray(v) || !v.length || v.some((c:unknown)=>typeof c!=='string' || !c)))) throw new Error();
    if(config.launcher!==undefined && !['auto','orca','process'].includes(config.launcher)) throw new Error();
    // hito 29: equipo (rama nomos/equipo del remoto origin); name y frente los pone `nomos team init`
    if(config.team!==undefined && (!object(config.team) || Object.entries(config.team).some(([k,v])=>k==='enabled' ? typeof v!=='boolean'
      : ['name','frente','branch'].includes(k) ? typeof v!=='string' || !v.trim() : k!=='pullSeconds' || typeof v!=='number' || !(v>=10 && v<=3600)))) throw new Error();
    const cvars=config.checks?.captureCvars;
    if(cvars!==undefined && (!Array.isArray(cvars) || cvars.some((c:unknown)=>typeof c!=='string' || !c.trim() || /[,"\r\n]/.test(c)))) throw new Error();
    return config;
  } catch {throw new Error('invalid_worker_config');}
}
