import * as http from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { createMessage, getMessage, ackEvent, publishReply, heartbeat, status } from "./store.ts";
import { authorized, body, json, staticFile } from "./http.ts";
import { streamEvents } from "./sse.ts";
import { mkdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { openDb } from "./db.ts";
import { readServiceInfo, isAlive, serviceUrl } from "./service-info.ts";
export { readServiceInfo, isAlive } from "./service-info.ts";

export function createServer(db: DatabaseSync, token: string, webDir: string): http.Server {
  const streams = new Set<http.ServerResponse>();
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname; const parts = path.split("/");
    const method = req.method;
    try {
      const origin = req.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${(server.address() as { port: number }).port}`) {
        return json(res, 403, { error: "forbidden_origin" });
      }
      if (method === "GET" && path === "/health") return json(res, 200, { ok: true });
      if (method === "GET" && (path === "/" || path.startsWith("/web/"))) {
        return await staticFile(res, webDir, path === "/" ? "index.html" : path.slice(5));
      }
      if (!authorized(req, url, token)) return json(res, 401, { error: "unauthorized" });
      if (method === "GET" && path === "/status") return json(res, 200, status(db));
      if (method === "GET" && path === "/events") {
        const since = Number(url.searchParams.get("since") || 0);
        if (!Number.isSafeInteger(since) || since < 0) return json(res, 400, { error: "invalid_seq" });
        return streamEvents(db, req, res, since, streams);
      }
      if (method === "GET" && parts.length === 3 && parts[1] === "messages") {
        const message = getMessage(db, parts[2]);
        return json(res, message ? 200 : 404, message || { error: "unknown_message" });
      }
      if (method === "POST" && path === "/admin/stop") {
        json(res, 202, { ok: true });
        process.nextTick(() => { for (const stream of streams) stream.end(); server.close(); });
        return;
      }
      if (method !== "POST") return json(res, 404, { error: "not_found" });
      const data = await body(req);
      if (path === "/messages" || (parts[1] === "messages" && parts[3] === "reply")) {
        if (typeof data.text !== "string" || !data.text.trim()) return json(res, 400, { error: "empty_text" });
        if (path === "/messages") return json(res, 201, createMessage(db, data.text, "web"));
        if (parts.length === 4) return json(res, 201, publishReply(db, parts[2], data.text));
      }
      if (path === "/director/heartbeat" || (parts[1] === "events" && parts[3] === "ack")) {
        if (typeof data.session !== "string" || !data.session.trim()) return json(res, 400, { error: "empty_session" });
        if (path === "/director/heartbeat") { heartbeat(db, data.session); res.writeHead(204); res.end(); return; }
        const seq = Number(parts[2]);
        if (parts.length !== 4 || !Number.isSafeInteger(seq) || seq <= 0) return json(res, 400, { error: "invalid_seq" });
        ackEvent(db, seq, data.session); return json(res, 200, status(db));
      }
      json(res, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "internal_error";
      const code = message === "body_too_large" ? 413 : message === "invalid_json" ? 400
        : message.startsWith("unknown_") ? 404 : 500;
      if (!res.headersSent) json(res, code, { error: code === 500 ? "internal_error" : message });
    }
  });
  return server;
}

export async function start(opts: { dataDir: string; port?: number; webDir?: string }):
  Promise<{ port: number; token: string; pid: number; url: string }> {
  mkdirSync(opts.dataDir, { recursive: true });
  const old = readServiceInfo(opts.dataDir);
  if (old && await isAlive(old)) return { ...old, url: serviceUrl(old) };
  const file = join(opts.dataDir, "service.json");
  rmSync(file, { force: true });
  const db = openDb(join(opts.dataDir, "kratos.db"));
  db.exec("update director set alive_at=null where id=1");
  const token = randomBytes(24).toString("hex");
  const server = createServer(db, token, opts.webDir || join(import.meta.dirname, "../web"));
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(opts.port ?? 8780, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    });
  } catch (error) { db.close(); throw error; }
  const port = (server.address() as { port: number }).port;
  const info = { pid: process.pid, port, token, startedAt: new Date().toISOString() };
  const temporary = file + `.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(info), { mode: 0o600 }); renameSync(temporary, file);
  server.once("close", () => {
    db.close();
    if (readServiceInfo(opts.dataDir)?.token === token) rmSync(file, { force: true });
  });
  return { port, token, pid: process.pid, url: serviceUrl(info) };
}
