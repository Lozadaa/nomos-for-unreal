import { setTimeout as sleep } from "node:timers/promises";
import { acquireLock } from "./lock.ts";
import { serviceInfo, request } from "./client.ts";
import type { ServiceInfo } from "./service-info.ts";
import type { EventRow, Status } from "./store.ts";

async function readPending(info: ServiceInfo, since: number): Promise<number> {
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
          if (event.type === "message.received") console.log(JSON.stringify({ seq: event.seq,
            messageId: event.messageId, text: event.payload.text, origin: event.payload.origin }));
          cursor = event.seq;
        }
      }
    } finally { await reader.cancel().catch(() => {}); }
  } catch (error) { if (!controller.signal.aborted) throw error; }
  finally { clearTimeout(timer); }
  return cursor;
}

export async function watch(dataDir: string, session: string): Promise<void> {
  const release = acquireLock(dataDir, "watcher");
  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => process.exit(0));
  let cursor: number | null = null; let startedToken = "";
  try {
    while (true) {
      const began = Date.now();
      try {
        const info = serviceInfo(dataDir);
        await request(info, "/director/heartbeat", { session, started: startedToken !== info.token });
        startedToken = info.token;
        const state: Status = await request(info, "/status");
        cursor = await readPending(info, Math.max(cursor ?? 0, state.lastAckSeq));
      } catch { console.log(JSON.stringify({ error: "service_down" })); }
      await sleep(Math.max(0, 2000 - (Date.now() - began)));
    }
  } finally { release(); }
}
