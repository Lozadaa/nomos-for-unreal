import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { body, json } from '../http.ts';
import { id, type Context } from './context.ts';
import { approve, comment, keepVersion, listApprovals, requestApproval, requestChanges } from '../approvals.ts';
import { requireTask } from '../repo/tasks.ts';
import { requestIntegration } from './task-closing.ts';

/** Imagen pegada en un comentario (PNG o JPEG, 5 MB como máximo): se guarda en `<datos>/artifacts/aprobaciones/`. */
const imageTypes: Record<string, string> = {'image/png': 'png', 'image/jpeg': 'jpg'};
async function raw(req: IncomingMessage, limit = 5 * 2 ** 20): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) { req.resume(); throw new Error('body_too_large'); } chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const imageDir = (dataDir: string) => join(dataDir, 'artifacts', 'aprobaciones');

export async function approvals({db, req, res, url, dataDir}: Context): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/approvals') { json(res, 200, listApprovals(db)); return true; }
  const image = /^\/approvals\/images(?:\/([0-9a-f-]{36})\.(png|jpg))?$/.exec(url.pathname);
  if (image && dataDir) {
    if (req.method === 'POST' && !image[1]) {
      const extension = imageTypes[String(req.headers['content-type'] ?? '').split(';')[0].trim()];
      if (!extension) throw new Error('invalid_image');
      const data = await raw(req), name = `${randomUUID()}.${extension}`;
      if (!data.length) throw new Error('invalid_image');
      mkdirSync(imageDir(dataDir), {recursive: true}); writeFileSync(join(imageDir(dataDir), name), data);
      json(res, 201, {imageId: name}); return true;
    }
    if (req.method === 'GET' && image[1]) {
      const file = join(imageDir(dataDir), `${image[1]}.${image[2]}`);
      if (!existsSync(file)) { json(res, 404, {error: 'unknown_file'}); return true; }
      res.writeHead(200, {'Content-Type': image[2] === 'png' ? 'image/png' : 'image/jpeg', 'Cache-Control': 'no-store'});
      res.end(readFileSync(file)); return true;
    }
  }
  // el director la pide a mano (p. ej. una tarea que no entró sola); idempotente mientras siga pendiente
  const ask = /^\/tasks\/([^/]+)\/approval$/.exec(url.pathname);
  if (req.method === 'POST' && ask) {
    await body(req).catch(() => ({}));
    const task = requireTask(db, id(ask[1]));
    if (task.state === 'done') throw new Error('invalid_transition');
    json(res, 201, requestApproval(db, task)); return true;
  }
  if (req.method === 'POST' && url.pathname === '/approvals/comment') {
    const data = await body(req); json(res, 200, comment(db, null, data.text, data.imageId)); return true;
  }
  const action = /^\/approvals\/([^/]+)\/(approve|changes|comment|keep)$/.exec(url.pathname);
  if (req.method !== 'POST' || !action) return false;
  const approvalId = id(action[1]), data = await body(req);
  // hito 29: conflicto en un binario; la integración aplica la versión elegida
  if (action[2] === 'keep') { json(res, 200, keepVersion(db, approvalId, data.side)); return true; }
  if (action[2] === 'comment') { json(res, 200, comment(db, approvalId, data.text, data.imageId)); return true; }
  if (action[2] === 'changes') { json(res, 200, requestChanges(db, approvalId, data.text, data.imageId)); return true; }
  const done = approve(db, approvalId);
  // aprobada, sigue a integración; si aún le faltan las comprobaciones, el director la pedirá al acabar
  let integration: unknown = null;
  try { integration = requestIntegration(db, done.taskId); } catch (error) { if ((error as Error).message !== 'invalid_transition') throw error; }
  json(res, 200, {...done, integration}); return true;
}
