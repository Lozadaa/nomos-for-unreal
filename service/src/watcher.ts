import { setTimeout as sleep } from "node:timers/promises";
import { acquireLock } from "./lock.ts";
import { serviceInfo, request } from "./client.ts";
import type { ServiceInfo } from "./service-info.ts";
import type { EventRow, Status } from "./store.ts";
import { CheckpointError, deliveryCheckpoint, normalizeTypes } from './watcher-cursors.ts';

async function readPending(info: ServiceInfo, since: number, consume: (event: EventRow) => Promise<void>): Promise<void> {
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
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = block.split("\n").find(line => line.startsWith("data: "));
          if (!data) continue;
          const event: EventRow = JSON.parse(data.slice(6));
          if (event.seq <= cursor) continue;
          await consume(event);
          cursor = event.seq;
        }
      }
    } finally { await reader.cancel().catch(() => {}); }
  } catch (error) { if (error instanceof CheckpointError || !controller.signal.aborted) throw error; }
  finally { clearTimeout(timer); }
}

export async function watch(dataDir: string, session: string, opts: {types?:string[]}={}): Promise<void> {
  const types=normalizeTypes(opts.types);
  const release = acquireLock(dataDir, "watcher");
  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => process.exit(0));
  let transportCursor=0; let startedToken = "";
  try {
    const checkpoint=deliveryCheckpoint(dataDir,session,types);
    while (true) {
      const began = Date.now();
      try {
        const info = serviceInfo(dataDir);
        await request(info, "/director/heartbeat", { session, started: startedToken !== info.token }, 1500);
        startedToken = info.token;
        const state: Status = await request(info, "/status", undefined, 1500);
        await readPending(info, Math.max(transportCursor,Math.min(state.lastAckSeq,checkpoint.cursor)),async event=>{
          if(event.seq<=transportCursor) return;
          const selected=types.includes(event.type) && event.seq>(event.type==='message.received' ? state.lastAckSeq : checkpoint.cursor);
          if(selected) {
            const line=event.type==='message.received' ? {seq:event.seq,type:event.type,
              messageId:event.messageId,text:event.payload.text,origin:event.payload.origin}
              : {seq:event.seq,type:event.type,payload:event.payload,createdAt:event.createdAt};
            await new Promise<void>((resolve,reject)=>process.stdout.write(JSON.stringify(line)+'\n',error=>error ? reject(error) : resolve()));
          }
          checkpoint.advance(event.seq);transportCursor=event.seq;
        });
      } catch(error) {
        if(error instanceof CheckpointError) throw error;
        console.log(JSON.stringify({ error: "service_down" }));
      }
      await sleep(Math.max(0, 2000 - (Date.now() - began)));
    }
  } finally { release(); }
}
