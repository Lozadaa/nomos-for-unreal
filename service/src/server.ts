import * as http from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { createMessage, getMessage, ackEvent, publishReply, heartbeat, status, appendEvent } from "./store.ts";
import { checkTyping, listMessages, startTyping } from "./chat.ts";
import { listProjects, projectCapture, register, unregister } from "./projects.ts";
import { readFile } from "node:fs/promises";
import { authorized, body, json, staticFile } from "./http.ts";
import { streamEvents } from "./sse.ts";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { queueGraph } from "./graph.ts";
import { tokensByRole } from "./transcript.ts";
import { writeResume } from "./resume.ts";
import { openDb } from "./db.ts";
import { dbFile, legacyEnv, migratedFrom } from "./legacy.ts";
import { repairArtifactPaths } from "./repair-paths.ts";
import { writeLog } from "./log.ts";
import { readServiceInfo, isAlive, serviceUrl, folderToken } from "./service-info.ts";
import { parseArgs } from "node:util";
import { acquireLock } from "./lock.ts";
import { production, databaseDirectory } from "./routes/index.ts";
import { panelStatic } from "./static.ts";
import { projectInfo } from "./project-root.ts";
import { startRunner, type Handler } from './runner.ts';
import { workerProcesses } from './sweep.ts';
import { activeHolds } from './hold.ts';
import { capacityNote } from './scheduler-state.ts';
import { machineWaits } from './scheduler.ts';
import { readConfig } from './config.ts';
import { createWorkerHandlers } from './handlers/worker.ts';
import { createAssetHandlers } from './handlers/asset.ts';
import { createCheckHandlers } from './handlers/checks.ts';
import { createClosingHandlers } from './handlers/closing.ts';
import { recoverMeshy } from './handlers/asset-meshy.ts';
import { createMeshy } from './adapters/meshy.ts';
import { diskOf } from './retention.ts';
import { writeAtomic } from './atomic.ts';
import { pendingCount } from './approvals.ts';
import { listPeers, syncTeam } from './team.ts';
export { readServiceInfo, isAlive } from "./service-info.ts";

/** Hito 17: «cupo lleno: J1.10 corrigiendo» si un worker terminado sigue ocupando hueco; config ilegible = sin nota. */
const capacity = (db: DatabaseSync, dataDir?: string) => { try { return dataDir ? capacityNote(db, readConfig(dataDir)) : null; } catch { return null; } };

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
      // hito 18: sin base ni Git; si tarda, es que el bucle de eventos está parado (ver docs/aceptacion-hito18.md)
      if (method === "GET" && path === "/health") return json(res, 200, { ok: true, pid: process.pid, uptime: Math.round(process.uptime()) });
      // hito 10: el panel de otro proyecto se abre en http://127.0.0.1:<puerto>/ y pide aquí su token. Solo el propio origen
      // (Host 127.0.0.1:<puerto>, sin Origin ajeno, y fetch del mismo sitio): otra web ni un rebinding de DNS lo leen
      if (method === "GET" && path === "/session") {
        const own = `127.0.0.1:${(server.address() as { port: number }).port}`, site = req.headers["sec-fetch-site"];
        if (req.headers.host !== own || (site && !["same-origin", "none"].includes(String(site)))) return json(res, 403, { error: "forbidden_origin" });
        res.setHeader("Cache-Control", "no-store");
        return json(res, 200, { token });
      }
      if (await panelStatic(req, res, path)) return;
      if (method === "GET" && (path === "/" || path.startsWith("/web/"))) {
        return await staticFile(res, webDir, path === "/" ? "index.html" : path.slice(5));
      }
      if (!authorized(req, url, token)) return json(res, 401, { error: "unauthorized" });
      if (await production({db, req, res, url, dataDir})) return;
      if (method === "GET" && path === "/projects") return json(res, 200, dataDir ? listProjects(dataDir) : []);
      if (method === "GET" && parts.length === 4 && parts[1] === "projects" && parts[3] === "capture") {
        const file = projectCapture(Number(parts[2]));
        if (!file) return json(res, 404, { error: "unknown_file" });
        res.writeHead(200, { "Content-Type": /\.jpe?g$/i.test(file) ? "image/jpeg" : "image/png", "Cache-Control": "no-store" });
        return res.end(await readFile(file));
      }
      if (method === "GET" && path === "/status") return json(res, 200, { ...status(db), project: projectInfo(dataDir), workers: workerProcesses(db), holds: activeHolds(db), capacity: capacity(db, dataDir), unreal: machineWaits(db), approvals: pendingCount(db), team: listPeers(db).map(p => ({ name: p.name, frente: p.frente, present: p.present, tasks: p.tasks.length, leases: p.leases.map(l => l.path), build: p.build?.commit ?? null })), disk: diskOf(dataDir), tokens: tokensByRole(db) });
      if (method === "GET" && path === "/events") {
        if (stopping) {res.setHeader('Connection','close');return json(res,503,{error:'service_stopping'});}
        const since = Number(url.searchParams.get("since") || 0);
        if (!Number.isSafeInteger(since) || since < 0) return json(res, 400, { error: "invalid_seq" });
        return streamEvents(db, req, res, since, streams);
      }
      if (method === "GET" && path === "/messages") return json(res, 200, listMessages(db));
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
      // hito 10: el director avisa de que empieza a redactar la respuesta
      if (parts.length === 4 && parts[1] === "messages" && parts[3] === "typing") return json(res, 200, startTyping(db, parts[2]));
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
        : ["decision_stale", "not_empty", "invalid_transition", "approval_pending"].includes(message) ? 409
        : message.startsWith("invalid_") || ["unknown_option", "meshy_kind_not_allowed", "cascadeur_not_justified"].includes(message) ? 400
        : message.startsWith("unknown_") ? 404 : 500;
      if (!res.headersSent) json(res, code, { error: code === 500 ? "internal_error" : message });
    }
  });
  return server;
}

export async function start(opts: { dataDir: string; port?: number; webDir?: string; newToken?: boolean;
  runner?: Parameters<typeof startRunner>[2] & {handlers?:Record<string,Handler>} }):
  Promise<{ port: number; token: string; pid: number; url: string }> {
  mkdirSync(opts.dataDir, { recursive: true });
  const release = acquireLock(opts.dataDir, "start");
  try {
  const old = readServiceInfo(opts.dataDir);
  if (old && await isAlive(old)) return { ...old, url: serviceUrl(old) };
  const file = join(opts.dataDir, "service.json");
  const migrated = migratedFrom(opts.dataDir);
  const token = folderToken(opts.dataDir, opts.newToken);
  rmSync(file, { force: true });
  const db = openDb(dbFile(opts.dataDir));
  // hito 15: rutas absolutas de una carpeta de datos que se movió → relativas (idempotente)
  repairArtifactPaths(db, opts.dataDir);
  db.exec("update director set alive_at=null where id=1");
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
  const info = { pid: process.pid, port, token, startedAt: new Date().toISOString(), ...(migrated ? { migrated_from: migrated } : {}) };
  // registro de proyectos de la máquina (nombre, carpeta, puerto, pid; nunca el token): portada y selector del panel
  try { register(opts.dataDir, port); } catch { /* sin registro, el panel sigue funcionando solo con este proyecto */ }
  writeAtomic(file, JSON.stringify(info), 0o600);
  // jobs de Meshy cobrados cuya respuesta se perdió: se reconcilian antes de que nadie cree otro
  if(!opts.runner?.handlers && process.env.MESHY_API_KEY) void recoverMeshy(db,createMeshy()).catch(error=>
    appendEvent(db,'meshy.recover_failed',null,{reason:error instanceof Error ? error.message : String(error)}));
  runner=startRunner(db,opts.runner?.handlers ?? {...createWorkerHandlers(),...createAssetHandlers(),...createCheckHandlers(),...createClosingHandlers()},
    {...opts.runner,context:{dataDir:opts.dataDir,...opts.runner?.context}});
  // hito 23: un juego sin grafo lo crea en segundo plano (comando graph.update)
  if(!opts.runner?.handlers && !existsSync(join(dirname(opts.dataDir),"graphify-out"))) try { queueGraph(db,opts.dataDir); } catch { /* sin grafo el servicio sigue */ }
  // chat en vivo: leído y sin respuesta en 3 min → director.typing_timeout (el panel dice «sigue trabajando»)
  const typing = setInterval(() => { try { checkTyping(db); } catch { /* base ocupada: el siguiente pase lo ve */ } }, 15_000);
  typing.unref();
  // hito 29: equipo; cada 10 s publica mi tarjeta si cambió (o toca latido) y trae la rama cada `pullSeconds`
  const projectDir = resolve(opts.runner?.context?.projectDir ?? dirname(opts.dataDir));
  const team = setInterval(() => { void syncTeam(db, opts.dataDir, projectDir).catch(() => { /* config ilegible o base ocupada: el siguiente pase */ }); }, 10_000);
  team.unref();
  server.once("close", async () => {
    clearInterval(typing); clearInterval(team);
    try { unregister(opts.dataDir); } catch { /* registro ilegible: caduca solo por pid */ }
    runner!();await runner!.drained;
    try { writeResume(db, opts.dataDir, 'parado'); } catch { /* sin reanudación la parada sigue */ }
    db.close();
    if (readServiceInfo(opts.dataDir)?.token === token) rmSync(file, { force: true });
  });
  return { port, token, pid: process.pid, url: serviceUrl(info) };
  } finally { release(); }
}

if (process.argv.includes("--serve")) {
  const { values } = parseArgs({ options: { serve: { type: "boolean" },
    data: { type: "string", default: ".nomos" }, port: { type: "string", default: "8780" }, "new-token": { type: "boolean", default: false } } });
  const old = legacyEnv();
  if (old.length) writeLog(values.data!, { event: "legacy_env", names: old });
  await start({ dataDir: values.data!, port: Number(values.port), newToken: values["new-token"] }).catch(error => {
    console.error("No se pudo arrancar Nomos:", error.message); process.exitCode = 2;
  });
}
