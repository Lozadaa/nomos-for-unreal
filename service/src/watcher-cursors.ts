import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export class CheckpointError extends Error {}
export const defaultTypes=['message.received','run.finished','worker.waiting','command.failed'];
export function normalizeTypes(types: string[]=defaultTypes): string[] {
  const result=[...new Set(types.map(type=>type.trim()))].sort();
  if (!result.length || result.some(type=>! /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(type))) {
    throw new Error('Uso: --types requiere tipos separados por comas, sin entradas vacías');
  }
  return result;
}
/** En Windows renombrar sobre un archivo que otro proceso tiene abierto (antivirus, indexador, un lector) da EPERM un instante. */
function replace(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try { renameSync(from, to); return; } catch (error) {
      if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}
function valid(value: unknown): value is number {return Number.isSafeInteger(value) && Number(value)>=0;}
export function deliveryCheckpoint(dataDir: string,session: string,types: string[]) {
  const path=join(dataDir,'watcher-cursors.json'),key=JSON.stringify([session,types]);
  let cursors: Record<string,number>={};
  try {
    const file=JSON.parse(readFileSync(path,'utf8'));
    if(!file || typeof file!=='object' || file.version!==1 || !file.cursors || typeof file.cursors!=='object' || Array.isArray(file.cursors)
      || !Object.values(file.cursors).every(valid)) throw new SyntaxError('cursores inválidos');
    cursors=file.cursors;
  } catch(error) {
    if(error instanceof SyntaxError) {
      console.error('watcher_checkpoint_recovery: archivo corrupto; cursor=0, puede haber reentregas');
    } else if((error as NodeJS.ErrnoException).code==='ENOENT') {
      // Primera suscripción: empezar desde cero es el flujo normal.
    } else throw new CheckpointError(`watcher_checkpoint_error: no se puede leer ${path}: ${(error as Error).message}`);
  }
  let cursor=cursors[key] ?? 0;
  return {get cursor(){return cursor;},advance(seq: number) {
    if(seq<=cursor) return;
    const next={...cursors,[key]:seq},temporary=path+'.tmp';
    try {
      writeFileSync(temporary,JSON.stringify({version:1,cursors:next})+'\n',{encoding:'utf8',mode:0o600});
      replace(temporary,path);
    } catch(error) {
      throw new CheckpointError(`watcher_checkpoint_error: entrega ${seq} sin guardar; no continuar: ${(error as Error).message}`);
    }
    cursors=next;cursor=seq;
  }};
}
