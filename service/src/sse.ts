import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { listEvents } from "./store.ts";

/**
 * Hito 18: la reproducción va por lotes de 500 y cede el bucle entre lotes (y espera a que el cliente vacíe el socket):
 * abrir el panel con 100 000 eventos lo leía y escribía de golpe, ~1,3 s sin contestar ni a `/health`.
 */
const batch = 500;
export function streamEvents(db: DatabaseSync, req: IncomingMessage, res: ServerResponse,
  since: number, streams: Set<ServerResponse>): void {
  const lastId = Number(req.headers["last-event-id"] || 0);
  let cursor = Math.max(since, Number.isSafeInteger(lastId) ? lastId : 0), paused = false;
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders(); streams.add(res);
  const resume = () => { paused = false; send(); };
  const send = () => {
    if (paused || res.writableEnded || res.destroyed) return;
    const events = listEvents(db, cursor, batch);
    let room = true;
    for (const event of events) {
      room = res.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      cursor = event.seq;
    }
    if (!room) { paused = true; res.once("drain", resume); }
    else if (events.length === batch) { paused = true; setImmediate(resume); }
  };
  send();
  const timer = setInterval(send, 500);
  res.on("close", () => { clearInterval(timer); streams.delete(res); });
}
