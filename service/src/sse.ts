import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { listEvents } from "./store.ts";

export function streamEvents(db: DatabaseSync, req: IncomingMessage, res: ServerResponse,
  since: number, streams: Set<ServerResponse>): void {
  const lastId = Number(req.headers["last-event-id"] || 0);
  let cursor = Math.max(since, Number.isSafeInteger(lastId) ? lastId : 0);
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders(); streams.add(res);
  const send = () => {
    for (const event of listEvents(db, cursor)) {
      res.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      cursor = event.seq;
    }
  };
  send();
  const timer = setInterval(send, 500);
  res.on("close", () => { clearInterval(timer); streams.delete(res); });
}
