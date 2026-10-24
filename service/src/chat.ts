import type { DatabaseSync } from 'node:sqlite';
import { appendEvent, getMessage } from './store.ts';

/** Chat en vivo (hito 10): el usuario ve en qué punto está su mensaje y lo que el director creó por él. */
export const typingTimeoutMs = 3 * 60_000;
/** Sin `messageId`, lo que crea el director se atribuye al último mensaje que leyó en este plazo. */
export const linkWindowMs = 15 * 60_000;

export type MessageState = 'recibido' | 'leido' | 'respondiendo' | 'respondido';
export type MessageLink = {kind: 'task' | 'decision' | 'correction'; taskId: string; decisionId?: string; at: string};
export type ChatMessage = {id: string; text: string; createdAt: string; state: MessageState; readAt: string | null; typingAt: string | null;
  repliedAt: string | null; timedOut: boolean; replies: {text: string; at: string}[]; links: MessageLink[]};

const linkTypes: Record<string, MessageLink['kind']> = {'task.created': 'task', 'decision.opened': 'decision', 'worker.message_sent': 'correction'};
const replyTypes = ['message.replied', 'reply.published'];

/** El director empieza a redactar: `director.typing {messageId, since}`. */
export function startTyping(db: DatabaseSync, messageId: string): {seq: number} {
  if (!getMessage(db, messageId)) throw new Error('unknown_message');
  const since = new Date().toISOString();
  db.prepare('update messages set typing_at=? where id=?').run(since, messageId);
  return appendEvent(db, 'director.typing', messageId, {messageId, since});
}

/** Leído y sin respuesta en 3 min → `director.typing_timeout` (una vez por mensaje). */
export function checkTyping(db: DatabaseSync, now = new Date()): void {
  const limit = new Date(now.getTime() - typingTimeoutMs).toISOString();
  const late = db.prepare(`select id from messages where acked_at is not null and acked_at<=? and replied_at is null and timed_out_at is null`).all(limit);
  for (const row of late) {
    db.prepare('update messages set timed_out_at=? where id=?').run(now.toISOString(), row.id as string);
    appendEvent(db, 'director.typing_timeout', row.id as string, {messageId: row.id});
  }
}

/** El mensaje al que se enlaza algo que crea el director: el que dice, o el último que leyó en los últimos 15 min. */
export function linkedMessage(db: DatabaseSync, explicit: unknown, now = new Date()): string | null {
  if (typeof explicit === 'string' && explicit.trim()) {
    if (!getMessage(db, explicit)) throw new Error('unknown_message');
    return explicit;
  }
  const since = new Date(now.getTime() - linkWindowMs).toISOString();
  const row = db.prepare('select id from messages where acked_at is not null and acked_at>=? order by acked_at desc, rowid desc limit 1').get(since);
  return (row?.id as string | undefined) ?? null;
}

/** Los mensajes con su estado, sus respuestas (la primera corta y el cierre) y lo que se creó a partir de ellos. */
export function listMessages(db: DatabaseSync, limit = 200): ChatMessage[] {
  const rows = db.prepare(`select id,text,created_at,acked_at,typing_at,replied_at,timed_out_at from messages order by created_at desc limit ?`).all(limit).reverse();
  return rows.map(row => {
    const id = row.id as string;
    const events = db.prepare('select type,payload,created_at from events where message_id=? order by seq').all(id);
    const replies = events.filter(e => replyTypes.includes(e.type as string)).map(e => ({text: String(JSON.parse(e.payload as string).text ?? ''), at: e.created_at as string}));
    const links = events.filter(e => linkTypes[e.type as string]).map(e => {
      const payload = JSON.parse(e.payload as string) as {taskId: string; decisionId?: string};
      return {kind: linkTypes[e.type as string], taskId: payload.taskId, ...(payload.decisionId ? {decisionId: payload.decisionId} : {}), at: e.created_at as string};
    });
    const typingAt = row.typing_at as string | null, lastReply = replies.at(-1)?.at ?? null;
    // por orden de eventos, no por hora: typing y respuesta pueden caer en el mismo milisegundo
    const lastOf = (types: string[]) => events.findLastIndex(e => types.includes(e.type as string));
    const typing = lastOf(['director.typing']) > lastOf([...replyTypes, 'director.typing_timeout']);
    const state: MessageState = typing ? 'respondiendo' : lastReply ? 'respondido' : row.acked_at ? 'leido' : 'recibido';
    return {id, text: row.text as string, createdAt: row.created_at as string, state, readAt: row.acked_at as string | null, typingAt,
      repliedAt: lastReply, timedOut: !!row.timed_out_at, replies, links};
  });
}
