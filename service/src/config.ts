import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type WorkerProvider = 'codex' | 'claude' | 'opencode';
export type SchedulerConfig = {concurrency?: Partial<Record<WorkerProvider,number>>; defaultProvider?: WorkerProvider};
export function concurrency(config: SchedulerConfig): Record<WorkerProvider,number> {
  return config.concurrency===undefined ? {codex:2,claude:2,opencode:0}
    : {codex:config.concurrency.codex ?? 0,claude:config.concurrency.claude ?? 0,opencode:config.concurrency.opencode ?? 0};
}
export function readConfig(dataDir:string): SchedulerConfig & {criticalSystems?: unknown} {
  const file=join(dataDir,'config.json');
  if(!existsSync(file)) return {};
  try {
    const config=JSON.parse(readFileSync(file,'utf8'));
    if(!config || typeof config!=='object' || Array.isArray(config)) throw new Error();
    if(config.concurrency!==undefined && (!config.concurrency || typeof config.concurrency!=='object'
      || Array.isArray(config.concurrency) || Object.entries(config.concurrency).some(([k,v])=>
        !['codex','claude','opencode'].includes(k) || !Number.isSafeInteger(v) || Number(v)<0))) throw new Error();
    if(config.defaultProvider!==undefined && !['codex','claude','opencode'].includes(config.defaultProvider)) throw new Error();
    return config;
  } catch {throw new Error('invalid_worker_config');}
}
