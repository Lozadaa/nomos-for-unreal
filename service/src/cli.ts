import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { readServiceInfo, isAlive, serviceUrl } from "./service-info.ts";
import { request, serviceInfo, ServiceError } from "./client.ts";
import { watch } from "./watcher.ts";
import { openDb } from "./db.ts";
import { seed } from "./seed.ts";
import { directorCli } from './cli-director.ts';
import { assetCli } from './cli-asset.ts';

function openBrowser(url: string) {
  const [command, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => console.error("Abre la URL en tu navegador")); child.unref();
}

async function main() {
  if (await directorCli(process.argv.slice(2)) || await assetCli(process.argv.slice(2))) return;
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    data: { type: "string", default: ".kratos" }, port: { type: "string", default: "8780" },
    force: { type: "boolean", default: false }, session: { type: "string" }, types: { type: "string" }, "no-open": { type: "boolean", default: false } } });
  const [command, ...args] = positionals; const dataDir = resolve(values.data!);
  const session = values.session?.trim(); const port = Number(values.port);
  const commands = ["start", "status", "vigila", "ack", "reply", "stop", "seed"];
  if (!commands.includes(command) || !Number.isInteger(port) || port < 1 || port > 65535
    || (["ack", "vigila"].includes(command) && !session) || (values.types!==undefined && command!=='vigila')
    || (command === "ack" && (args.length !== 1 || !Number.isSafeInteger(Number(args[0])) || Number(args[0]) < 1))
    || (command === "reply" && (args.length < 2 || !args.slice(1).join(" ").trim()))
    || (["start", "status", "vigila", "stop", "seed"].includes(command) && args.length)) {
    throw new Error("Uso: kratos start|status|vigila --session ID|ack SEQ --session ID|reply ID TEXTO|stop|seed [--force] [--data CARPETA]");
  }
  if (command === "seed") {
    mkdirSync(dataDir, { recursive: true });
    const db = openDb(join(dataDir, "kratos.db"));
    try { console.log(JSON.stringify(seed(db, { force: values.force }))); }
    finally { db.close(); }
    return;
  }
  if (command === "start") {
    let info = readServiceInfo(dataDir); const active = info ? await isAlive(info) : false;
    if (!active) {
      const child = spawn(process.execPath, [join(import.meta.dirname, "server.ts"), "--serve", "--data", dataDir, "--port", String(port)],
        { detached: true, stdio: "ignore", windowsHide: true });
      let failed = false; child.on("error", () => { failed = true; }); child.unref();
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !failed) {
        info = readServiceInfo(dataDir);
        if (info && await isAlive(info)) break;
        await sleep(100);
      }
      if (!info || !await isAlive(info)) throw new ServiceError("No se pudo arrancar el servicio en cinco segundos");
    }
    const url = serviceUrl(info!); console.log(`URL ${url}`);
    console.log(active ? "YA_ACTIVO" : "ARRANCADO");
    if (!values["no-open"]) openBrowser(url);
    return;
  }
  if (command === "vigila") return watch(dataDir, session!,{types:values.types?.split(',')});
  const info = serviceInfo(dataDir);
  if (command === "status") console.log(JSON.stringify(await request(info, "/status")));
  if (command === "ack") console.log(JSON.stringify(await request(info, `/events/${args[0]}/ack`, { session })));
  if (command === "reply") console.log(JSON.stringify(await request(info, `/messages/${encodeURIComponent(args[0])}/reply`, { text: args.slice(1).join(" ") })));
  if (command === "stop") {
    await request(info, "/admin/stop", {});
    const deadline = Date.now() + 10 * 60_000;
    while (await isAlive(info) || readServiceInfo(dataDir)?.token === info.token) {
      if (Date.now() > deadline) throw new ServiceError("Drenaje pendiente: el servidor aún no confirmó cierre y retirada de su token");
      await sleep(50);
    }
    console.log("DETENIDO");
  }
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : "Error de Kratos");
  process.exitCode = error instanceof ServiceError ? 2 : 1;
});
