import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type WorkerProvider = 'codex' | 'claude' | 'opencode';
export type Limits = {corrections: number};
export type WorkerModel = 'sonnet' | 'opus' | 'haiku';
const models=['sonnet','opus','haiku'];
export type SchedulerConfig = {concurrency?: Partial<Record<WorkerProvider,number>>; defaultProvider?: WorkerProvider;
  /** Hito 7: fracción de píxeles distintos que tolera la regresión visual (2 % por defecto). */
  visualTolerance?: number; limits?: Partial<Limits>;
  /** Modelo de los workers y revisores Claude (`claude --model …`); sonnet por defecto. */
  workerModel?: WorkerModel;
  /** Hito 12: modelo de OpenCode, siempre explícito para no heredar el caro del usuario; gratuito por defecto. */
  opencodeModel?: string;
  /** Hito 16: minutos que una run en marcha aguanta sin respuesta de Orca antes de marcarse failed (10 por defecto). */
  orca?: {graceMinutes?: number;
    /** Hito 19: minutos que Orca deja vivo el terminal de un worker (240); el relevo llega 15 min antes. */
    maxWorkerMinutes?: number;
    /** Hito 22: milisegundos que se espera a que Orca cree el worktree (180 000); en frío pasa del minuto. */
    createTimeoutMs?: number};
  /** Hito 22: el PC aguanta un Unreal pesado a la vez y pide RAM libre para abrirlo. */
  scheduler?: {heavy?: {maxConcurrent?: number}; minFreeRamGb?: number; heavyRequiresNoEditor?: boolean}};
/** Codex apagado por defecto (hito 7, regla del usuario): se habilita con `concurrency.codex` en config.json. */
export function concurrency(config: SchedulerConfig): Record<WorkerProvider,number> {
  return config.concurrency===undefined ? {codex:0,claude:2,opencode:0}
    : {codex:config.concurrency.codex ?? 0,claude:config.concurrency.claude ?? 0,opencode:config.concurrency.opencode ?? 0};
}
export const visualTolerance = (config: SchedulerConfig) => config.visualTolerance ?? 0.02;
export const workerModel = (config: SchedulerConfig): WorkerModel => config.workerModel ?? 'sonnet';
/** Solo modelos de OpenCode Zen/Go, sin espacios ni comillas: viajan en la orden del terminal. */
export const isOpencodeModel = (v: unknown) => typeof v==='string' && /^opencode(-go)?\/[\w.-]+$/.test(v);
export const opencodeModel = (config: SchedulerConfig): string => config.opencodeModel ?? 'opencode/beam-free';
export const orcaGraceMinutes = (config: SchedulerConfig) => config.orca?.graceMinutes ?? 10;
export const maxWorkerMinutes = (config: SchedulerConfig) => config.orca?.maxWorkerMinutes ?? 240;
export const heavyMax = (config: SchedulerConfig) => config.scheduler?.heavy?.maxConcurrent ?? 1;
export const minFreeRamGb = (config: SchedulerConfig) => config.scheduler?.minFreeRamGb ?? 6;
export const heavyRequiresNoEditor = (config: SchedulerConfig) => config.scheduler?.heavyRequiresNoEditor ?? true;
export const orcaCreateTimeoutMs = (config: SchedulerConfig) => config.orca?.createTimeoutMs ?? 180_000;
export const limits = (config: SchedulerConfig): Limits => ({corrections: config.limits?.corrections ?? 3});
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
    return config;
  } catch {throw new Error('invalid_worker_config');}
}
