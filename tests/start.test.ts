import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, readServiceInfo, isAlive } from "../service/src/server.ts";
import { cli, cliFixture } from "./cli-helpers.ts";

function directory(t: test.TestContext) {
  const dataDir = mkdtempSync(join(tmpdir(), "nomos-start-"));
  t.after(async () => {
    const info = readServiceInfo(dataDir);
    if (info && await isAlive(info)) await stop(info.port, info.token);
    rmSync(dataDir, { recursive: true, force: true });
  });
  return dataDir;
}
async function stop(port: number, token: string) {
  await fetch(`http://127.0.0.1:${port}/admin/stop`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` } });
  await new Promise(resolve => setTimeout(resolve, 40));
}

test("start es idempotente: dos arranques, mismo puerto y token", async t => {
  const dataDir = directory(t);
  const a = await start({ dataDir, port: 0 });
  const info = readServiceInfo(dataDir)!;
  const b = await start({ dataDir, port: 0 });
  assert.equal(a.port, b.port); assert.equal(a.token, b.token);
  assert.match(a.token, /^[a-f0-9]{48}$/); assert.ok(Date.parse(info.startedAt));
  assert.equal(a.url, `http://127.0.0.1:${a.port}/#token=${a.token}`);
  assert.equal(await isAlive(info), true);
  assert.equal(await isAlive({ ...info, token: "incorrecto" }), false);
});

test("start sustituye service.json obsoleto y conserva pendientes al reiniciar", async t => {
  const dataDir = directory(t);
  const old = { pid: 999999, port: 1, token: "viejo", startedAt: "ayer" };
  writeFileSync(join(dataDir, "service.json"), JSON.stringify(old));
  assert.equal(await isAlive(old), false);
  const first = await start({ dataDir, port: 0 });
  const message = await (await fetch(`http://127.0.0.1:${first.port}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${first.token}` },
    body: JSON.stringify({ text: "durable 🎾" }) })).json();
  await stop(first.port, first.token);
  const second = await start({ dataDir, port: 0 });
  // hito 16: el token es de la carpeta de datos; el que traía el service.json viejo no era válido
  assert.notEqual(first.token, "viejo"); assert.equal(second.token, first.token);
  const response = await fetch(`http://127.0.0.1:${second.port}/messages/${message.messageId}`, {
    headers: { Authorization: `Bearer ${second.token}` } });
  assert.equal((await response.json()).text, "durable 🎾");
});

test("hito 16: reiniciar no invalida los accesos directos; --new-token sí", async t => {
  const dataDir = directory(t), other = directory(t);
  const first = await start({ dataDir, port: 0 });
  await stop(first.port, first.token);
  assert.equal(readServiceInfo(dataDir), null, "stop sigue retirando service.json");
  const second = await start({ dataDir, port: 0 });
  assert.equal(second.token, first.token);
  if (process.platform !== "win32") assert.equal(statSync(join(dataDir, "token")).mode & 0o777, 0o600);
  const fresh = await start({ dataDir: other, port: 0 });
  assert.notEqual(fresh.token, first.token);
  await stop(second.port, second.token);
  const renewed = await start({ dataDir, port: 0, newToken: true });
  assert.notEqual(renewed.token, first.token); assert.match(renewed.token, /^[a-f0-9]{48}$/);
  const old = await fetch(`http://127.0.0.1:${renewed.port}/status`, { headers: { Authorization: `Bearer ${first.token}` } });
  assert.equal(old.status, 401);
});

test("hito 16: un service.json de un proceso muerto deja su token a la carpeta", async t => {
  const dataDir = directory(t), token = "c".repeat(48);
  writeFileSync(join(dataDir, "service.json"), JSON.stringify({ pid: 999999, port: 1, token, startedAt: "ayer" }));
  assert.equal((await start({ dataDir, port: 0 })).token, token);
});

test("hito 16: nomos start --new-token pasa la orden al servicio", async t => {
  const { dataDir, port } = await cliFixture(t);
  assert.equal(cli(dataDir, "start", "--no-open", "--port", String(port)).status, 0);
  const before = readServiceInfo(dataDir)!.token;
  assert.equal(cli(dataDir, "stop").status, 0);
  const result = cli(dataDir, "start", "--no-open", "--new-token", "--port", String(port));
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(readServiceInfo(dataDir)!.token, before);
});
