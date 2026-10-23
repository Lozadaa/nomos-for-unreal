import test from "node:test";
import assert from "node:assert/strict";
import { readServiceInfo, isAlive } from "../service/src/service-info.ts";
import { cli, cliFixture, api, watcher, until } from "./cli-helpers.ts";

test("start arranca, segundo start dice YA_ACTIVO y stop libera el puerto", async t => {
  const { dataDir, port } = await cliFixture(t);
  const first = cli(dataDir, "start", "--port", String(port), "--no-open");
  assert.equal(first.status, 0, first.stderr); assert.match(first.stdout, /ARRANCADO/);
  const info = readServiceInfo(dataDir)!;
  const second = cli(dataDir, "start", "--no-open");
  assert.equal(second.status, 0, second.stderr); assert.match(second.stdout, /YA_ACTIVO/);
  assert.equal(first.stdout.split("\n")[0], second.stdout.split("\n")[0]);
  assert.equal(cli(dataDir, "stop").stdout.trim(), "DETENIDO");
  assert.equal(await isAlive(info), false); assert.equal(readServiceInfo(dataDir), null);
});

test("ack y reply vía CLI actualizan mensaje sin ejecutar texto del usuario", async t => {
  const { dataDir, port } = await cliFixture(t);
  assert.equal(cli(dataDir, "start", "--port", String(port), "--no-open").status, 0);
  const message = await api(dataDir, "/messages", { text: "hola 🎾" });
  const ack = cli(dataDir, "ack", String(message.seq), "--session", "t1");
  assert.equal(ack.status, 0, ack.stderr);
  assert.equal(JSON.parse(cli(dataDir, "status").stdout).lastAckSeq, message.seq);
  const reply = cli(dataDir, "reply", message.messageId, "🎾 <script>hola</script> $(echo x)");
  assert.equal(reply.status, 0, reply.stderr);
  assert.equal((await api(dataDir, `/messages/${message.messageId}`)).replyText, "🎾 <script>hola</script> $(echo x)");
});

test("vigila entrega pendientes en orden, late y recupera solo sin confirmar al rearmar", { timeout: 15_000 }, async t => {
  const { dataDir, port } = await cliFixture(t);
  assert.equal(cli(dataDir, "start", "--port", String(port), "--no-open").status, 0);
  const a = await api(dataDir, "/messages", { text: "uno" });
  const b = await api(dataDir, "/messages", { text: "dos 🎾" });
  const child = watcher(t, dataDir); let output = "";
  child.stdout!.on("data", data => { output += data.toString(); });
  await until(async () => output.trim().split("\n").length >= 2);
  const lines = output.trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(lines.map(e => e.seq), [a.seq, b.seq]);
  assert.equal(lines[1].text, "dos 🎾");
  const live = await api(dataDir, "/status");
  assert.equal(live.listener, true); assert.equal(live.director, "t1"); assert.equal(live.pending, 2);
  assert.equal(cli(dataDir, "ack", String(a.seq), "--session", "t1").status, 0);
  const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited;
  const rearmed = watcher(t, dataDir); let replay = "";
  rearmed.stdout!.on("data", data => { replay += data.toString(); });
  await until(async () => replay.trim().length > 0);
  assert.deepEqual(replay.trim().split("\n").map(line => JSON.parse(line).seq), [b.seq]);
  const duplicate = cli(dataDir, "vigila", "--session", "t2");
  assert.equal(duplicate.status, 1); assert.match(duplicate.stderr, /vigilante/i);
});

test("errores de uso salen con 1 y servicio ausente con 2", async t => {
  const { dataDir } = await cliFixture(t);
  for (const args of [[], ["noexiste"], ["ack"], ["vigila"], ["start", "--port", "0"]]) {
    assert.equal(cli(dataDir, ...args).status, 1);
  }
  assert.equal(cli(dataDir, "status").status, 2);
});
