import { body, json } from '../http.ts';
import { listDecisions, resolveDecision, openDecision } from '../repo/decisions.ts';
import { choice, text, id, type Context } from './context.ts';
import { linkedMessage } from '../chat.ts';

export async function decisions({db, req, res, url}: Context): Promise<boolean> {
  if (req.method==='POST' && url.pathname==='/decisions') {
    const data=await body(req),options=data.options,evidence=data.evidence ?? [];
    if (!text(data.taskId) || !text(data.reason) || !Array.isArray(options) || !options.length
      || !options.every(o=>o && typeof o==='object' && text(o.id) && text(o.label) && text(o.description))
      || new Set(options.map(o=>o.id)).size!==options.length || !Array.isArray(evidence)
      || !evidence.every(e=>e && typeof e==='object' && text(e.kind) && text(e.ref))) throw new Error('invalid_decision');
    json(res,201,openDecision(db,{taskId:data.taskId,reason:data.reason,
      // hito 7: la opción puede traer su miniatura (ruta del propio servicio) y marcarse como recomendada
      options:options.map(o=>({id:o.id,label:o.label,description:o.description,
        ...(o.recommended===true ? {recommended:true} : {}),
        ...(typeof o.thumbnail==='string' && o.thumbnail.startsWith('/') && !o.thumbnail.startsWith('//') ? {thumbnail:o.thumbnail} : {})})),
      evidence:evidence.map(e=>({kind:e.kind,ref:e.ref}))},linkedMessage(db,data.messageId)));return true;
  }
  if (req.method === 'GET' && url.pathname === '/decisions') {
    const state = choice(url.searchParams.get('state'), ['open', 'resolved', 'stale']);
    json(res, 200, listDecisions(db, state));
    return true;
  }
  const match = /^\/decisions\/([^/]+)\/resolve$/.exec(url.pathname);
  if (req.method !== 'POST' || !match) return false;
  const decisionId = id(match[1]);
  const data = await body(req);
  if (!text(data.optionId) || !text(data.by)) throw new Error('invalid_resolution');
  json(res, 200, resolveDecision(db, decisionId, data.optionId, data.by));
  return true;
}
