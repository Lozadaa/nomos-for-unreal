import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { ackEvent, createMessage, listEvents, publishReply } from '../../service/src/store.ts';
import { checkTyping, linkedMessage, listMessages, startTyping, typingTimeoutMs } from '../../service/src/chat.ts';
import { fixture, requestJson } from '../helpers.ts';
import { byPriority } from '../../service/src/watcher.ts';

const later = (ms: number) => new Date(Date.now() + ms);

test('chat en vivo: recibido → leído → respondiendo → respondido, con hora de cada paso y eventos con nombre propio', t => {
  const db = openDb(':memory:'); t.after(() => db.close());
  const {messageId, seq} = createMessage(db, 'crea tres tareas', 'web');
  assert.equal(listMessages(db)[0].state, 'recibido');
  ackEvent(db, seq, 's1');
  startTyping(db, messageId);
  const typing = listMessages(db)[0];
  assert.equal(typing.state, 'respondiendo');
  assert.ok(typing.readAt && typing.typingAt);
  publishReply(db, messageId, 'Entendido: creo 3 tareas…');
  publishReply(db, messageId, 'Listo: J1.6, J1.7 y J1.8 creadas');
  const done = listMessages(db)[0];
  assert.equal(done.state, 'respondido');
  assert.deepEqual(done.replies.map(r => r.text), ['Entendido: creo 3 tareas…', 'Listo: J1.6, J1.7 y J1.8 creadas']);
  const types = listEvents(db, 0).map(e => e.type);
  assert.deepEqual(types, ['message.received', 'message.read', 'director.typing', 'message.replied', 'message.replied']);
  const event = listEvents(db, 0).find(e => e.type === 'director.typing')!;
  assert.equal(event.payload.messageId, messageId);
  assert.equal(typeof event.payload.since, 'string');
});

test('tras la primera respuesta, typing vuelve a «respondiendo» hasta el cierre', t => {
  const db = openDb(':memory:'); t.after(() => db.close());
  const {messageId, seq} = createMessage(db, 'hola', 'web');
  ackEvent(db, seq, 's1');
  publishReply(db, messageId, 'Entendido');
  startTyping(db, messageId);
  assert.equal(listMessages(db)[0].state, 'respondiendo');
  assert.throws(() => startTyping(db, 'nope'), /unknown_message/);
});

test('leído y sin respuesta en 3 min: director.typing_timeout una sola vez; respondido, ninguno', t => {
  const db = openDb(':memory:'); t.after(() => db.close());
  const a = createMessage(db, 'uno', 'web'), b = createMessage(db, 'dos', 'web'), c = createMessage(db, 'tres', 'web');
  ackEvent(db, a.seq, 's1'); ackEvent(db, b.seq, 's1');
  publishReply(db, b.messageId, 'hecho');
  assert.equal(typingTimeoutMs, 180_000);
  checkTyping(db, later(typingTimeoutMs - 5000));
  assert.equal(listEvents(db, 0).filter(e => e.type === 'director.typing_timeout').length, 0);
  checkTyping(db, later(typingTimeoutMs + 1000));
  checkTyping(db, later(typingTimeoutMs + 9000));
  const timeouts = listEvents(db, 0).filter(e => e.type === 'director.typing_timeout');
  assert.deepEqual(timeouts.map(e => e.messageId), [a.messageId]);
  assert.equal(listMessages(db).find(m => m.id === a.messageId)!.timedOut, true);
  assert.equal(listMessages(db).find(m => m.id === c.messageId)!.state, 'recibido');
});

test('lo que crea el director se enlaza al mensaje: explícito o, si no lo pasa, el último leído en 15 min', t => {
  const db = openDb(':memory:'); t.after(() => db.close());
  const old = createMessage(db, 'viejo', 'web'), now = createMessage(db, 'nuevo', 'web');
  assert.equal(linkedMessage(db, undefined), null, 'sin leer no se infiere');
  ackEvent(db, old.seq, 's1'); ackEvent(db, now.seq, 's1');
  assert.equal(linkedMessage(db, old.messageId), old.messageId);
  assert.equal(linkedMessage(db, undefined), now.messageId);
  assert.equal(linkedMessage(db, undefined, later(16 * 60_000)), null);
  assert.throws(() => linkedMessage(db, 'nope'), /unknown_message/);
});

test('HTTP: GET /messages con estados y enlaces; POST typing; tareas, Decisiones y correcciones llevan messageId', async t => {
  const {server, db} = await fixture(t);
  const sent = await (await requestJson(server, 'POST', '/messages', {text: 'tres tareas'})).json();
  ackEvent(db, sent.seq, 's1');
  assert.equal((await requestJson(server, 'POST', `/messages/${sent.messageId}/typing`, {}, 'x')).status, 401);
  assert.equal((await requestJson(server, 'POST', `/messages/${sent.messageId}/typing`, {})).status, 200);
  const task = await (await requestJson(server, 'POST', '/tasks', {title: 'J1.6 Reacción al golpe', area: 'gameplay', spec: '', acceptance: [], messageId: sent.messageId})).json();
  const inferred = await (await requestJson(server, 'POST', '/tasks', {title: 'J1.7 Dash sin vuelo', area: 'gameplay', spec: '', acceptance: []})).json();
  await requestJson(server, 'POST', '/decisions', {taskId: task.id, reason: '¿Qué clip?', options: [{id: 'a', label: 'A', description: 'uno'}, {id: 'b', label: 'B', description: 'dos'}]});
  const listed = (await (await requestJson(server, 'GET', '/messages')).json()) as ReturnType<typeof listMessages>;
  assert.equal(listed[0].state, 'respondiendo');
  assert.deepEqual(listed[0].links.map(l => [l.kind, l.taskId]), [['task', task.id], ['task', inferred.id], ['decision', task.id]]);
  const created = listEvents(db, 0).find(e => e.type === 'task.created')!;
  assert.equal(created.messageId, sent.messageId);
  assert.equal(created.payload.messageId, sent.messageId);
});

test('el vigilante saca primero los message.* de cada lote, sin cambiar el orden dentro de cada grupo', () => {
  const batch = [{type: 'run.finished', seq: 1}, {type: 'message.received', seq: 2}, {type: 'command.failed', seq: 3}, {type: 'message.received', seq: 4}];
  assert.deepEqual(byPriority(batch).map(e => e.seq), [2, 4, 1, 3]);
});
