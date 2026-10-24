import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { logEvent } from "./log.ts";

export type EventRow = { seq: number; id: string; type: string; messageId: string | null; payload: Record<string, unknown>; createdAt: string };
export type MessageRow = { id: string; text: string; origin: string; createdAt: string; ackedAt: string | null; replyText: string | null; repliedAt: string | null };
export type Status = { service: true; listener: boolean; listenerAgeSec: number | null; director: string | null; lastAckSeq: number; lastAckAt: string | null; pending: number; paused: boolean };

function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec("begin immediate");
  try { const result = action(); db.exec("commit"); return result; }
  catch (error) { db.exec("rollback"); throw error; }
}

export function appendEvent(db: DatabaseSync, type: string, messageId: string | null,
  payload: Record<string, unknown>): { seq: number } {
  const row = db.prepare(`insert into events(id,type,message_id,payload,created_at)
    values (?,?,?,?,?)`).run(randomUUID(), type, messageId, JSON.stringify(payload), new Date().toISOString());
  const seq = Number(row.lastInsertRowid);
  logEvent(db, { seq, type, messageId, payload });
  return { seq };
}

export function createMessage(db: DatabaseSync, text: string, origin: string): { messageId: string; seq: number } {
  return transaction(db, () => {
    const messageId = randomUUID();
    db.prepare("insert into messages(id,text,origin,created_at) values (?,?,?,?)")
      .run(messageId, text, origin, new Date().toISOString());
    return { messageId, ...appendEvent(db, "message.received", messageId, { text, origin }) };
  });
}

export function getMessage(db: DatabaseSync, id: string): MessageRow | undefined {
  return db.prepare(`select id,text,origin,created_at as createdAt,acked_at as ackedAt,
    reply_text as replyText,replied_at as repliedAt from messages where id=?`).get(id) as MessageRow | undefined;
}

export function listEvents(db: DatabaseSync, sinceSeq: number): EventRow[] {
  const rows = db.prepare(`select seq,id,type,message_id as messageId,payload,
    created_at as createdAt from events where seq>? order by seq`).all(sinceSeq);
  return rows.map(row => ({ ...row, payload: JSON.parse(row.payload as string) })) as EventRow[];
}

export function pendingEvents(db: DatabaseSync): EventRow[] {
  const director = db.prepare("select last_ack_seq from director where id=1").get()!;
  return listEvents(db, Number(director.last_ack_seq)).filter(e => e.type === "message.received");
}

export function ackEvent(db: DatabaseSync, seq: number, session: string): void {
  transaction(db, () => {
    const event = db.prepare("select message_id from events where seq=? and type='message.received'").get(seq);
    if (!event) throw new Error("unknown_event");
    const message = getMessage(db, event.message_id as string)!;
    db.prepare("update director set last_ack_seq=max(last_ack_seq,?) where id=1").run(seq);
    if (message.ackedAt) return;
    db.prepare("update messages set acked_at=? where id=?").run(new Date().toISOString(), message.id);
    appendEvent(db, "message.read", message.id, { seq, session });
  });
}

export function publishReply(db: DatabaseSync, messageId: string, text: string): { seq: number } {
  return transaction(db, () => {
    if (!getMessage(db, messageId)) throw new Error("unknown_message");
    db.prepare("update messages set reply_text=?,replied_at=? where id=?")
      .run(text, new Date().toISOString(), messageId);
    return appendEvent(db, "message.replied", messageId, { messageId, text });
  });
}

export function heartbeat(db: DatabaseSync, session: string): void {
  db.prepare("update director set session=?,alive_at=? where id=1").run(session, new Date().toISOString());
}

export function status(db: DatabaseSync, now = new Date()): Status {
  const row = db.prepare("select * from director where id=1").get()!;
  const age = row.alive_at ? Math.max(0, (now.getTime() - Date.parse(row.alive_at as string)) / 1000) : null;
  const ack = db.prepare("select max(acked_at) as at from messages").get()!;
  return { service: true, listener: age !== null && age < 6, listenerAgeSec: age,
    director: row.session as string | null, lastAckSeq: Number(row.last_ack_seq),
    lastAckAt: ack.at as string | null, pending: pendingEvents(db).length, paused: Boolean(row.paused) };
}
