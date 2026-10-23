import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import type { TestContext } from "node:test";
import { readServiceInfo, isAlive } from "../service/src/service-info.ts";

export const cliPath = join(import.meta.dirname, "../service/src/cli.ts");
export function cli(dataDir: string, ...args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args, "--data", dataDir], {
    encoding: "utf8", timeout: 10_000, windowsHide: true });
}
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
export async function cliFixture(t: TestContext) {
  const dataDir = mkdtempSync(join(tmpdir(), "kratos-cli-"));
  t.after(async () => {
    const info = readServiceInfo(dataDir);
    if (info && await isAlive(info)) cli(dataDir, "stop");
    rmSync(dataDir, { recursive: true, force: true });
  });
  const port = await freePort();
  return { dataDir, port };
}
export async function api(dataDir: string, path: string, body?: unknown) {
  const info = readServiceInfo(dataDir)!;
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${info.token}` },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}
export function watcher(t: TestContext, dataDir: string, session = "t1") {
  const child = spawn(process.execPath, [cliPath, "vigila", "--session", session, "--data", dataDir], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited;
    }
  });
  return child;
}
export async function until(check: () => Promise<boolean>, timeout = 6000) {
  const end = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() > end) throw new Error("No se cumplió la condición");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
