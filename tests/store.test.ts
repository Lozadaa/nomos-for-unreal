import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../service/src/db.ts";
import { createMessage, getMessage, listEvents, pendingEvents, ackEvent,
  publishReply, heartbeat, status } from "../service/src/store.ts";

test("createMessage conserva texto y crea eventos crecientes", t => {
  const db = openDb(":memory:"); t.after(() => db.close());
  const a = createMessage(db, "hola", "web");
  const b = createMessage(db, "🎾 <script>x</script>", "web");
  assert.equal(b.seq, a.seq + 1);
  assert.equal(getMessage(db, b.messageId)!.text, "🎾 <script>x</script>");
  assert.deepEqual(listEvents(db, a.seq).map(e => e.type), ["message.received"]);
});

test("ack es idempotente y no retrocede el cursor", t => {
  const db = openDb(":memory:"); t.after(() => db.close());
  const a = createMessage(db, "uno", "web");
  const b = createMessage(db, "dos", "web");
  ackEvent(db, a.seq, "s1");
  const firstAck = getMessage(db, a.messageId)!.ackedAt;
  ackEvent(db, a.seq, "s1");
  assert.deepEqual(pendingEvents(db).map(e => e.seq), [b.seq]);
  assert.equal(getMessage(db, a.messageId)!.ackedAt, firstAck);
  assert.equal(listEvents(db, 0).filter(e => e.type === "message.read").length, 1);
  ackEvent(db, b.seq, "s1"); ackEvent(db, a.seq, "s1");
  assert.equal(status(db).lastAckSeq, b.seq);
});

test("publishReply guarda respuesta y rechaza id desconocido", t => {
  const db = openDb(":memory:"); t.after(() => db.close());
  const { messageId } = createMessage(db, "pregunta", "web");
  publishReply(db, messageId, "respuesta");
  assert.equal(getMessage(db, messageId)!.replyText, "respuesta");
  assert.equal(listEvents(db, 0).at(-1)!.type, "message.replied");
  assert.throws(() => publishReply(db, "nope", "x"), /unknown_message/);
});

test("latido no confirma mensajes y expira a los seis segundos", t => {
  const db = openDb(":memory:"); t.after(() => db.close());
  createMessage(db, "pendiente", "web");
  assert.equal(status(db).listener, false);
  heartbeat(db, "s1");
  assert.equal(status(db).listener, true);
  assert.equal(status(db).pending, 1);
  assert.equal(status(db).lastAckSeq, 0);
  assert.equal(status(db).director, "s1");
  assert.equal(status(db, new Date(Date.now() + 10_000)).listener, false);
});

test("ack rechaza secuencias inexistentes o que no sean mensajes", t => {
  const db = openDb(":memory:"); t.after(() => db.close());
  assert.throws(() => ackEvent(db, 999, "s1"), /unknown_event/);
  const a = createMessage(db, "uno", "web");
  const reply = publishReply(db, a.messageId, "dos");
  assert.throws(() => ackEvent(db, reply.seq, "s1"), /unknown_event/);
  assert.equal(status(db).lastAckSeq, 0);
});
