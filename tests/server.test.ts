import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createMessage, listEvents } from "../service/src/store.ts";
import { fixture, requestJson, baseUrl, readBlocks, token } from "./helpers.ts";

test("sin token o con token erróneo 401; con token crea y lee mensaje", async t => {
  const { server } = await fixture(t);
  for (const key of ["", "x", "b".repeat(48)]) {
    const response = await requestJson(server, "POST", "/messages", { text: "hola" }, key);
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: "unauthorized" });
  }
  const created = await requestJson(server, "POST", "/messages", { text: "🎾 <script>x</script>" });
  assert.equal(created.status, 201);
  assert.match(created.headers.get("content-type")!, /application\/json; charset=utf-8/);
  const message = await created.json();
  const response = await requestJson(server, "GET", `/messages/${message.messageId}`);
  assert.equal((await response.json()).text, "🎾 <script>x</script>");
});

test("página de intercambio real incluye formulario, SSE y evita innerHTML", async t => {
  const { server } = await fixture(t, join(import.meta.dirname, "../service/web"));
  const response = await fetch(baseUrl(server));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /text\/html/);
  const html = await response.text();
  for (const pattern of [/id="director"/, /id="mensaje"/, /EventSource\(/]) assert.match(html, pattern);
  assert.doesNotMatch(html, /innerHTML/);
});

test("texto vacío no genera evento; JSON inválido y cuerpo mayor de 64 KiB se rechazan", async t => {
  const { server, db } = await fixture(t);
  for (const text of ["", "  ", null, 42]) {
    const response = await requestJson(server, "POST", "/messages", { text });
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "empty_text" });
  }
  assert.equal(listEvents(db, 0).length, 0);
  const invalid = await fetch(baseUrl(server) + "/messages", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "{" });
  assert.equal(invalid.status, 400);
  assert.equal((await requestJson(server, "POST", "/messages", { text: "ñ".repeat(40_000) })).status, 413);
});

test("ack y reply cambian mensaje y estado; ids desconocidos devuelven 404", async t => {
  const { server, db } = await fixture(t);
  const message = createMessage(db, "pregunta", "web");
  const ack = await requestJson(server, "POST", `/events/${message.seq}/ack`, { session: "s1" });
  assert.equal(ack.status, 200); assert.equal((await ack.json()).lastAckSeq, message.seq);
  const reply = await requestJson(server, "POST", `/messages/${message.messageId}/reply`, { text: "respuesta" });
  assert.equal(reply.status, 201);
  const read = await requestJson(server, "GET", `/messages/${message.messageId}`);
  assert.equal((await read.json()).replyText, "respuesta");
  assert.equal((await requestJson(server, "GET", "/messages/nope")).status, 404);
  assert.equal((await requestJson(server, "POST", "/messages/nope/reply", { text: "x" })).status, 404);
  assert.equal((await requestJson(server, "POST", "/events/999/ack", { session: "s1" })).status, 404);
});

test("SSE reproduce solo seq > since y acepta token por query", { timeout: 4000 }, async t => {
  const { server, db } = await fixture(t);
  const a = createMessage(db, "uno", "web");
  const b = createMessage(db, "dos", "web");
  const c = createMessage(db, "tres", "web");
  const response = await fetch(`${baseUrl(server)}/events?since=${a.seq}&token=${token}`);
  assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  const body = await readBlocks(response, 2);
  assert.match(body, new RegExp(`id: ${b.seq}\\n`));
  assert.match(body, new RegExp(`id: ${c.seq}\\n`));
  assert.doesNotMatch(body, new RegExp(`id: ${a.seq}\\n`));
});

test("SSE respeta Last-Event-ID y entrega eventos nuevos", { timeout: 4000 }, async t => {
  const { server, db } = await fixture(t);
  createMessage(db, "uno", "web");
  const b = createMessage(db, "dos", "web");
  const response = await fetch(`${baseUrl(server)}/events?since=0&token=${token}`, {
    headers: { "Last-Event-ID": String(b.seq) } });
  const next = createMessage(db, "nuevo", "web");
  const body = await readBlocks(response, 1);
  assert.match(body, new RegExp(`id: ${next.seq}\\n`));
  assert.doesNotMatch(body, /"text":"uno"|"text":"dos"/);
});

test("página y health públicos; rutas web fuera del directorio y orígenes ajenos se rechazan", async t => {
  const { server } = await fixture(t);
  const page = await fetch(baseUrl(server));
  assert.equal(page.status, 200); assert.match(page.headers.get("content-type")!, /text\/html/);
  assert.match(await page.text(), /id="director"/);
  const health = await (await fetch(baseUrl(server) + "/health")).json();
  assert.deepEqual({ ...health, uptime: typeof health.uptime }, { ok: true, pid: process.pid, uptime: "number" });
  const foreign = await fetch(baseUrl(server) + "/status", {
    headers: { Authorization: `Bearer ${token}`, Origin: "https://ajeno.example" } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
  const traversal = await fetch(baseUrl(server) + "/web/%2e%2e%2fpackage.json");
  assert.equal(traversal.status, 404);
});
