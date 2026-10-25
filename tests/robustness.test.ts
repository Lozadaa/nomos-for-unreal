import test from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { once } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { acquireLock } from "../service/src/lock.ts";
import { fixture, token } from "./helpers.ts";
import { createMessage } from "../service/src/store.ts";
import { cli, cliFixture, watcher, until } from "./cli-helpers.ts";
import { removeDir } from "./remove-dir.ts";

test("lector transitorio de SQLite no impide reservar un vigilante sin dueño", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "nomos-lock-reader-"));
  const reader = new DatabaseSync(join(dataDir, "watcher.lock.db"));
  reader.exec("create table probe(id integer); insert into probe values(1); begin; select * from probe");
  try {
    // Abrir SQLite en otro proceso necesita leer la cabecera antes de competir.
    const release = acquireLock(dataDir, "watcher"); release();
  } finally {
    reader.exec("rollback"); reader.close(); removeDir(dataDir);
  }
});

test("request-target malformado devuelve 400 y el servicio sigue vivo", { timeout: 4000 }, async t => {
  const { server } = await fixture(t);
  const socket = connect((server.address() as { port: number }).port, "127.0.0.1");
  t.after(() => socket.destroy()); let output = "";
  socket.setEncoding("utf8"); socket.on("data", data => { output += data; });
  socket.setTimeout(1500, () => socket.destroy());
  await once(socket, "connect");
  socket.write("GET //[ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
  await once(socket, "close");
  assert.match(output, /^HTTP\/1.1 400/);
  const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/health`);
  assert.equal(response.status, 200);
});

test("corte abrupto de SSE no repite mensajes ya impresos por ese vigilante", { timeout: 8000 }, async t => {
  const { server, db } = await fixture(t);
  const dataDir = mkdtempSync(join(tmpdir(), "nomos-corte-"));
  writeFileSync(join(dataDir, "service.json"), JSON.stringify({ pid: process.pid, token,
    port: (server.address() as { port: number }).port, startedAt: new Date().toISOString() }));
  const message = createMessage(db, "entrega única durante el corte", "web");
  let streams = 0; let secondClosed = false;
  server.on("request", (req, res) => {
    if (!req.url?.startsWith("/events?")) return;
    streams++;
    if (streams === 1) setTimeout(() => res.destroy(), 100);
    if (streams === 2) res.once("close", () => { secondClosed = true; });
  });
  const child = watcher(t, dataDir); let output = "";
  child.stdout!.on("data", chunk => { output += chunk.toString(); });
  t.after(() => removeDir(dataDir));
  await until(async () => secondClosed);
  const deliveries = output.trim().split("\n").map(line => JSON.parse(line))
    .filter(event => event.messageId === message.messageId);
  assert.equal(deliveries.length, 1);
});

test("lock dañado previo no bloquea; dos vigilantes compiten y matar al dueño libera la reserva", { timeout: 12_000 }, async t => {
  const { dataDir, port } = await cliFixture(t);
  assert.equal(cli(dataDir, "start", "--port", String(port), "--no-open").status, 0);
  // Un proceso antiguo pudo morir entre crear su lock JSON y terminar de escribirlo.
  writeFileSync(join(dataDir, "watcher.lock"), "{");
  const info = JSON.parse(await import("node:fs").then(fs => fs.readFileSync(join(dataDir, "service.json"), "utf8")));
  await fetch(`http://127.0.0.1:${port}/messages`, { method: "POST",
    headers: { Authorization: `Bearer ${info.token}` }, body: JSON.stringify({ text: "pendiente" }) });
  const a = watcher(t, dataDir, "a"); const b = watcher(t, dataDir, "b");
  let outA = "", outB = "", errA = "", errB = "";
  a.stdout!.on("data", chunk => { outA += chunk.toString(); });
  b.stdout!.on("data", chunk => { outB += chunk.toString(); });
  a.stderr!.on("data", chunk => { errA += chunk.toString(); });
  b.stderr!.on("data", chunk => { errB += chunk.toString(); });
  await until(async () => Boolean((outA || a.exitCode !== null) && (outB || b.exitCode !== null)));
  assert.equal(Number(outA.includes("messageId")) + Number(outB.includes("messageId")), 1,
    JSON.stringify({ outA, outB, errA, errB, exitA: a.exitCode, exitB: b.exitCode }));
  const owner = outA ? a : b;
  const exited = once(owner, "exit"); owner.kill("SIGKILL"); await exited;
  const rearmed = watcher(t, dataDir, "c"); let replay = "";
  rearmed.stdout!.on("data", chunk => { replay += chunk.toString(); });
  await until(async () => replay.includes("messageId"));
});
