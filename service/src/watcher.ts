import { setTimeout as sleep } from "node:timers/promises";
import { connect } from "node:net";
import { acquireLock } from "./lock.ts";
import { serviceInfo, request } from "./client.ts";
import { readServiceInfo, type ServiceInfo } from "./service-info.ts";
import type { EventRow, Status } from "./store.ts";
import { CheckpointError, deliveryCheckpoint, normalizeTypes } from './watcher-cursors.ts';

/** Lee el SSE hasta 800 ms y entrega los eventos por trozos de red, en cuanto llegan (la reproducción suele ser un trozo). */
async function readPending(info: ServiceInfo, since: number, consume: (events: EventRow[]) => Promise<void>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  let cursor = since;
  try {
    const response = await fetch(`http://127.0.0.1:${info.port}/events?since=${since}`, {
      signal: controller.signal, headers: { Authorization: `Bearer ${info.token}` } });
    if (!response.ok) throw new Error("service_down");
    const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buffer = "";
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let boundary: number; const chunk: EventRow[] = [];
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = block.split("\n").find(line => line.startsWith("data: "));
          if (!data) continue;
          const event: EventRow = JSON.parse(data.slice(6));
          if (event.seq <= cursor) continue;
          chunk.push(event); cursor = event.seq;
        }
        if (chunk.length) await consume(chunk);
      }
    } finally { await reader.cancel().catch(() => {}); }
  } catch (error) { if (error instanceof CheckpointError || !controller.signal.aborted) throw error; }
  finally { clearTimeout(timer); }
}

/**
 * hito 16: un plazo vencido no es una caída. hito 18: tampoco un `/health` lento (el 02:59:40 de Block Kings): se reintenta
 * tres veces en 15 s y solo es caída si no hay `service.json`, su pid ya no existe o el puerto no acepta conexiones;
 * con el pid vivo y el puerto abierto es `slow` (cuánto tardó en contestar, o los 15 s si no llegó a hacerlo).
 */
export type Health = { state: 'up' } | { state: 'down' } | { state: 'slow'; ms: number };
export async function probeService(dataDir: string, healthMs = 5000, tries = 3): Promise<Health> {
  const info = readServiceInfo(dataDir);
  if (!info) return { state: 'down' };
  const began = Date.now();
  for (let attempt = 0; attempt < tries; attempt++) {
    if (!pidAlive(info.pid)) return { state: 'down' };
    const sent = Date.now();
    try {
      const response = await fetch(`http://127.0.0.1:${info.port}/health`, { signal: AbortSignal.timeout(healthMs) });
      if (response.ok) return attempt ? { state: 'slow', ms: Date.now() - began } : { state: 'up' };
    } catch { /* plazo vencido o conexión rechazada: se reintenta */ }
    if (attempt < tries - 1) await sleep(Math.max(0, healthMs - (Date.now() - sent)));
  }
  return await portOpen(info.port) && pidAlive(info.pid) ? { state: 'slow', ms: Date.now() - began } : { state: 'down' };
}
function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
const portOpen = (port: number) => new Promise<boolean>(resolve => {
  const socket = connect({ port, host: '127.0.0.1', timeout: 2000 });
  const done = (open: boolean) => { socket.destroy(); resolve(open); };
  socket.once('connect', () => done(true)).once('error', () => done(false)).once('timeout', () => done(false));
});

/** Orden de salida de un lote: primero `message.*` (el usuario espera), después el resto; cada grupo en su orden. */
export const byPriority=<T extends {type:string}>(batch: T[]): T[]=>[...batch.filter(e=>e.type.startsWith('message.')),...batch.filter(e=>!e.type.startsWith('message.'))];

export async function watch(dataDir: string, session: string, opts: {types?:string[]}={}): Promise<void> {
  const types=normalizeTypes(opts.types);
  const release = acquireLock(dataDir, "watcher");
  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => process.exit(0));
  let transportCursor=0; let startedToken = ""; let down = false; let slowAt = 0;
  try {
    const checkpoint=deliveryCheckpoint(dataDir,session);
    while (true) {
      const began = Date.now();
      try {
        const info = serviceInfo(dataDir);
        await request(info, "/director/heartbeat", { session, started: startedToken !== info.token }, 1500);
        startedToken = info.token;
        const state: Status = await request(info, "/status", undefined, 1500);
        await readPending(info, Math.max(transportCursor,Math.min(state.lastAckSeq,checkpoint.cursor)),async chunk=>{
          const fresh=chunk.filter(event=>event.seq>transportCursor);
          if(!fresh.length) return;
          // hito 10: el usuario espera respuesta en < 1 min; dentro de cada trozo los mensajes salen primero
          for(const event of byPriority(fresh)) {
            if(!types.includes(event.type) || event.seq<=(event.type==='message.received' ? state.lastAckSeq : checkpoint.cursor)) continue;
            const line=event.type==='message.received' ? {seq:event.seq,type:event.type,
              messageId:event.messageId,text:event.payload.text,origin:event.payload.origin}
              : {seq:event.seq,type:event.type,payload:event.payload,createdAt:event.createdAt};
            await new Promise<void>((resolve,reject)=>process.stdout.write(JSON.stringify(line)+'\n',error=>error ? reject(error) : resolve()));
          }
          // el cursor avanza al final del trozo ya impreso: reordenar nunca deja atrás un evento sin entregar
          checkpoint.advance(fresh.at(-1)!.seq);transportCursor=fresh.at(-1)!.seq;
        });
        down = false;
      } catch(error) {
        if(error instanceof CheckpointError) throw error;
        // una línea por caída real; ocupado calla y lento avisa como mucho una vez por minuto
        const health = await probeService(dataDir);
        if(health.state === 'down' && !down) console.log(JSON.stringify({ error: "service_down" }));
        if(health.state === 'slow' && Date.now() - slowAt >= 60_000) { slowAt = Date.now(); console.log(JSON.stringify({ warn: "service_slow", ms: health.ms })); }
        down = health.state === 'down';
      }
      await sleep(Math.max(0, 2000 - (Date.now() - began)));
    }
  } finally { release(); }
}
