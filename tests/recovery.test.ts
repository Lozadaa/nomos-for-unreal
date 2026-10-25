import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cli, cliPath, cliFixture, api, watcher, until } from "./cli-helpers.ts";
import { readServiceInfo } from "../service/src/service-info.ts";

test("vigilante mantiene latidos, retoma tras rotar token y no repite lo ya impreso", { timeout: 20_000 }, async t => {
  const { dataDir, port } = await cliFixture(t);
  assert.equal(cli(dataDir, "start", "--port", String(port), "--no-open").status, 0);
  const first = await api(dataDir, "/messages", { text: "antes" });
  const child = watcher(t, dataDir); let output = "";
  child.stdout!.on("data", data => { output += data.toString(); });
  await until(async () => output.includes(first.messageId));
  let age = (await api(dataDir, "/status")).listenerAgeSec;
  await until(async () => {
    const next = (await api(dataDir, "/status")).listenerAgeSec;
    const refreshed = next < age; age = next; return refreshed;
  }, 4000);
  const previous = readServiceInfo(dataDir)!;
  assert.equal(cli(dataDir, "stop").status, 0);
  // hito 16: reiniciar conserva el token; solo --new-token lo rota
  assert.equal(cli(dataDir, "start", "--port", String(port), "--no-open", "--new-token").status, 0);
  assert.notEqual(readServiceInfo(dataDir)!.token, previous.token);
  const second = await api(dataDir, "/messages", { text: "después 🎾" });
  await until(async () => output.includes(second.messageId));
  assert.equal(output.split(first.messageId).length - 1, 1);
  assert.equal((await api(dataDir, "/status")).pending, 2);
});

test("stop cierra SSE y dos arranques simultáneos comparten servicio", { timeout: 12_000 }, async t => {
  const { dataDir, port } = await cliFixture(t);
  const run = () => new Promise<{ code: number | null; output: string; error: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "start", "--data", dataDir, "--port", String(port), "--no-open"], { windowsHide: true });
    let output = "", error = ""; child.stdout.on("data", data => { output += data.toString(); });
    child.stderr.on("data", data => { error += data.toString(); });
    child.on("error", reject); child.on("exit", code => resolve({ code, output, error }));
  });
  const [a, b] = await Promise.all([run(), run()]);
  assert.equal(a.code, 0, JSON.stringify({ a, b })); assert.equal(b.code, 0, JSON.stringify({ a, b }));
  assert.equal(a.output.split("\n")[0], b.output.split("\n")[0]);
  const info = readServiceInfo(dataDir)!;
  const stream = await fetch(`http://127.0.0.1:${port}/events?token=${info.token}`);
  const reader = stream.body!.getReader();
  assert.equal(cli(dataDir, "stop").status, 0);
  while (!(await reader.read()).done) { /* consumir director.stopped antes del EOF */ }
  assert.equal(readServiceInfo(dataDir), null);
});
