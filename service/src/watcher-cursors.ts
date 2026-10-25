import { readFileSync } from 'node:fs';
import { writeAtomic } from './atomic.ts';
import { join } from 'node:path';

export class CheckpointError extends Error {}
export const defaultTypes=['message.received','run.finished','worker.waiting','command.failed'];
/** Hito 21: una Decisión abierta o actualizada siempre llega al director, la nombre o no la lista de tipos. */
export const requiredTypes=['decision.opened','decision.updated'];
export function normalizeTypes(types: string[]=defaultTypes): string[] {
  const listed=types.map(type=>type.trim()),result=[...new Set([...listed,...requiredTypes])].sort();
  if (!listed.length || result.some(type=>! /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(type))) {
    throw new Error('Uso: --types requiere tipos separados por comas, sin entradas vacías');
  }
  return result;
}
function valid(value: unknown): value is number {return Number.isSafeInteger(value) && Number(value)>=0;}
/**
 * Hito 21: un cursor por sesión (v2), el último evento ya entregado a esa sesión; rearmar con otra lista de tipos
 * nunca reentrega la historia. Un archivo v1 (clave sesión + tipos) migra al mayor cursor de cada sesión.
 */
function migrate(file: any): Record<string,number> {
  if(file?.version===2) return file.cursors;
  const cursors: Record<string,number>={};
  for(const [key,seq] of Object.entries<number>(file.cursors)) {
    const session=JSON.parse(key)[0];
    if(typeof session!=='string') throw new SyntaxError('cursores inválidos');
    cursors[session]=Math.max(cursors[session] ?? 0,seq);
  }
  return cursors;
}
export function deliveryCheckpoint(dataDir: string,session: string) {
  const path=join(dataDir,'watcher-cursors.json'),key=session;
  let cursors: Record<string,number>={};
  try {
    const file=JSON.parse(readFileSync(path,'utf8'));
    if(!file || typeof file!=='object' || ![1,2].includes(file.version) || !file.cursors || typeof file.cursors!=='object' || Array.isArray(file.cursors)
      || !Object.values(file.cursors).every(valid)) throw new SyntaxError('cursores inválidos');
    cursors=migrate(file);
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
    const next={...cursors,[key]:seq};
    try {
      // hito 22: temporal propio, fsync y rename (el reinicio del 25 dejó este archivo lleno de ceros)
      writeAtomic(path,JSON.stringify({version:2,cursors:next})+'\n',0o600);
    } catch(error) {
      throw new CheckpointError(`watcher_checkpoint_error: entrega ${seq} sin guardar; no continuar: ${(error as Error).message}`);
    }
    cursors=next;cursor=seq;
  }};
}
