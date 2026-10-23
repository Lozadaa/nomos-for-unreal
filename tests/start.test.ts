import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, readServiceInfo, isAlive } from "../service/src/server.ts";

function directory(t: test.TestContext) {
  const dataDir = mkdtempSync(join(tmpdir(), "kratos-start-"));
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
  assert.notEqual(second.token, first.token);
  const response = await fetch(`http://127.0.0.1:${second.port}/messages/${message.messageId}`, {
    headers: { Authorization: `Bearer ${second.token}` } });
  assert.equal((await response.json()).text, "durable 🎾");
  const oldToken = await fetch(`http://127.0.0.1:${second.port}/status`, {
    headers: { Authorization: `Bearer ${first.token}` } });
  assert.equal(oldToken.status, 401);
});
