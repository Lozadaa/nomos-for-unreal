import * as http from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { createMessage, getMessage, ackEvent, publishReply, heartbeat, status, appendEvent } from "./store.ts";
import { authorized, body, json, staticFile } from "./http.ts";
import { streamEvents } from "./sse.ts";
import { mkdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { openDb } from "./db.ts";
import { readServiceInfo, isAlive, serviceUrl } from "./service-info.ts";
import { parseArgs } from "node:util";
import { acquireLock } from "./lock.ts";
import { production, databaseDirectory } from "./routes/index.ts";
import { panelStatic } from "./static.ts";
import { projectInfo } from "./project-root.ts";
import { startRunner, type Handler } from './runner.ts';
import { createWorkerHandlers } from './handlers/worker.ts';
import { createAssetHandlers } from './handlers/asset.ts';
export { readServiceInfo, isAlive } from "./service-info.ts";

export function createServer(db: DatabaseSync, token: string, webDir: string, dataDir?: string,
  onStopping?: () => void | Promise<void>): http.Server {
  dataDir ??= databaseDirectory(db);
  const streams = new Set<http.ServerResponse>();
  let stopping=false;
  const server = http.createServer(async (req, res) => {
    if (stopping) res.setHeader('Connection','close');
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const path = url.pathname; const parts = path.split("/");
      const method = req.method;
      const origin = req.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${(server.address() as { port: number }).port}`) {
        return json(res, 403, { error: "forbidden_origin" });
      }
      if (method === "GET" && path === "/health") return json(res, 200, { ok: true });
      if (await panelStatic(req, res, path)) return;
      if (method === "GET" && (path === "/" || path.startsWith("/web/"))) {
        return await staticFile(res, webDir, path === "/" ? "index.html" : path.slice(5));
      }
      if (!authorized(req, url, token)) return json(res, 401, { error: "unauthorized" });
      if (await production({db, req, res, url, dataDir})) return;
      if (method === "GET" && path === "/status") return json(res, 200, { ...status(db), project: projectInfo(dataDir) });
      if (method === "GET" && path === "/events") {
        if (stopping) {res.setHeader('Connection','close');return json(res,503,{error:'service_stopping'});}
        const since = Number(url.searchParams.get("since") || 0);
        if (!Number.isSafeInteger(since) || since < 0) return json(res, 400, { error: "invalid_seq" });
        return streamEvents(db, req, res, since, streams);
      }
      if (method === "GET" && parts.length === 3 && parts[1] === "messages") {
        const message = getMessage(db, parts[2]);
        return json(res, message ? 200 : 404, message || { error: "unknown_message" });
      }
      if (method === "POST" && path === "/admin/stop") {
        res.setHeader('Connection','close');
        if(stopping) return json(res,202,{ok:true});
        stopping=true;
        const drained=Promise.resolve(onStopping?.());
        appendEvent(db, "director.stopped", null, { session: status(db).director });
        json(res, 202, { ok: true });
        const closeStreams=()=>{for(const stream of streams) stream.end();};
        process.nextTick(() => {closeStreams();void drained.then(()=>{closeStreams();server.close();});});
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
        if (path === "/director/heartbeat") {
          heartbeat(db, data.session);
          if (data.started === true) appendEvent(db, "director.started", null, { session: data.session });
          res.writeHead(204); res.end(); return;
        }
        const seq = Number(parts[2]);
        if (parts.length !== 4 || !Number.isSafeInteger(seq) || seq <= 0) return json(res, 400, { error: "invalid_seq" });
        ackEvent(db, seq, data.session); return json(res, 200, status(db));
      }
      json(res, 404, { error: "not_found" });
    } catch (error) {
      const message = (error as NodeJS.ErrnoException).code === "ERR_INVALID_URL" ? "invalid_url"
        : error instanceof Error ? error.message : "internal_error";
      const code = message === "body_too_large" ? 413 : ["invalid_json", "invalid_url"].includes(message) ? 400
        : ["decision_stale", "not_empty", "invalid_transition"].includes(message) ? 409
        : message.startsWith("invalid_") || ["unknown_option", "meshy_kind_not_allowed"].includes(message) ? 400
        : message.startsWith("unknown_") ? 404 : 500;
      if (!res.headersSent) json(res, code, { error: code === 500 ? "internal_error" : message });
    }
  });
  return server;
}

export async function start(opts: { dataDir: string; port?: number; webDir?: string;
  runner?: Parameters<typeof startRunner>[2] & {handlers?:Record<string,Handler>} }):
  Promise<{ port: number; token: string; pid: number; url: string }> {
  mkdirSync(opts.dataDir, { recursive: true });
  const release = acquireLock(opts.dataDir, "start");
  try {
  const old = readServiceInfo(opts.dataDir);
  if (old && await isAlive(old)) return { ...old, url: serviceUrl(old) };
  const file = join(opts.dataDir, "service.json");
  rmSync(file, { force: true });
  const db = openDb(join(opts.dataDir, "kratos.db"));
  db.exec("update director set alive_at=null where id=1");
  const token = randomBytes(24).toString("hex");
  let runner: ReturnType<typeof startRunner> | undefined;
  const server = createServer(db, token, opts.webDir || join(import.meta.dirname, "../web"), opts.dataDir,()=>{
    runner?.();return runner?.drained;
  });
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
  runner=startRunner(db,opts.runner?.handlers ?? {...createWorkerHandlers(),...createAssetHandlers()},
    {...opts.runner,context:{dataDir:opts.dataDir,...opts.runner?.context}});
  server.once("close", async () => {
    runner!();await runner!.drained;
    db.close();
    if (readServiceInfo(opts.dataDir)?.token === token) rmSync(file, { force: true });
  });
  return { port, token, pid: process.pid, url: serviceUrl(info) };
  } finally { release(); }
}

if (process.argv.includes("--serve")) {
  const { values } = parseArgs({ options: { serve: { type: "boolean" },
    data: { type: "string", default: ".kratos" }, port: { type: "string", default: "8780" } } });
  await start({ dataDir: values.data!, port: Number(values.port) }).catch(error => {
    console.error("No se pudo arrancar Kratos:", error.message); process.exitCode = 2;
  });
}
