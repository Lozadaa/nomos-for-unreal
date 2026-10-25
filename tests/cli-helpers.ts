import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import type { TestContext } from "node:test";
import { readServiceInfo } from "../service/src/service-info.ts";
import type { ChildProcess } from "node:child_process";
import { alive, killTree, listServers } from "../service/src/orphans.ts";
import { removeDir } from "./remove-dir.ts";

const childrenByDir = new Map<string, Set<ChildProcess>>();
async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited;
}

export const cliPath = join(import.meta.dirname, "../service/src/cli.ts");
export function cli(dataDir: string, ...args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args, "--data", dataDir], {
    encoding: "utf8", timeout: 30_000, windowsHide: true });
}
/** Para el servicio de la carpeta aunque no responda a tiempo (con carga, `isAlive` caducaba y quedaba vivo): `stop` y, si sigue, su árbol. */
export function stopService(dataDir: string) {
  const info = readServiceInfo(dataDir);
  if (!info) return;
  cli(dataDir, "stop");
  if (alive(info.pid) && listServers().some(s => s.pid === info.pid)) killTree(info.pid);
}
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
export async function cliFixture(t: TestContext) {
  const dataDir = mkdtempSync(join(tmpdir(), "nomos-cli-"));
  childrenByDir.set(dataDir, new Set());
  t.after(async () => {
    for (const child of childrenByDir.get(dataDir) || []) await stopChild(child);
    childrenByDir.delete(dataDir);
    stopService(dataDir);
    // Windows: el proceso del servicio puede tardar un instante en soltar nomos.db tras `stop` (EPERM)
    removeDir(dataDir);
  });
  const port = await freePort();
  return { dataDir, port };
}
export async function api(dataDir: string, path: string, body?: unknown) {
  const info = readServiceInfo(dataDir)!;
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${info.token}`, Connection: "close" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}
export function watcher(t: TestContext, dataDir: string, session = "t1") {
  const child = spawn(process.execPath, [cliPath, "vigila", "--session", session, "--data", dataDir], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  childrenByDir.get(dataDir)?.add(child);
  t.after(() => stopChild(child));
  return child;
}
/** Espera por condición; el plazo solo cuenta si falla (con carga, arrancar un proceso CLI pasaba de 6 s). */
export async function until(check: () => Promise<boolean>, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() > end) throw new Error("No se cumplió la condición");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
