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
  workerModel?: WorkerModel};
/** Codex apagado por defecto (hito 7, regla del usuario): se habilita con `concurrency.codex` en config.json. */
export function concurrency(config: SchedulerConfig): Record<WorkerProvider,number> {
  return config.concurrency===undefined ? {codex:0,claude:2,opencode:0}
    : {codex:config.concurrency.codex ?? 0,claude:config.concurrency.claude ?? 0,opencode:config.concurrency.opencode ?? 0};
}
export const visualTolerance = (config: SchedulerConfig) => config.visualTolerance ?? 0.02;
export const workerModel = (config: SchedulerConfig): WorkerModel => config.workerModel ?? 'sonnet';
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
    if(config.limits!==undefined && (!config.limits || typeof config.limits!=='object' || Array.isArray(config.limits)
      || Object.entries(config.limits).some(([k,v])=>k!=='corrections' || !count(v)))) throw new Error();
    return config;
  } catch {throw new Error('invalid_worker_config');}
}
