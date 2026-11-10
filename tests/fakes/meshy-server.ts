import { createServer, type Server } from 'node:http';

/** Imita la REST de Meshy (rutas de docs.meshy.ai): crea jobs, los completa en el segundo GET y sirve los archivos. */
export async function meshyServer(opts: {expired?: boolean; dropCreate?: boolean; balance?: number; noCredits?: boolean} = {}) {
  const tasks = new Map<string, Record<string, unknown>>(), polls = new Map<string, number>();
  const created: {path: string; body: Record<string, unknown>}[] = [];
  let next = 0, server!: Server;
  const base = () => `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  server = createServer((req, res) => {
    const send = (code: number, data: unknown) => { res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(data)); };
    if (req.headers.authorization !== 'Bearer clave-falsa' && !req.url!.startsWith('/files/')) return send(401, {message: 'bad key'});
    const url = new URL(req.url!, 'http://x');
    const files = /^\/files\/(.+)$/.exec(url.pathname);
    if (files) {
      if (opts.expired) return send(404, {message: 'expired'});
      res.writeHead(200); res.end(`contenido de ${files[1]}`); return;
    }
    if (url.pathname === '/openapi/v1/balance') return send(200, {balance: opts.balance ?? 900});
    const route = /^\/openapi\/v[12]\/(text-to-3d|image-to-3d|remesh)(?:\/([^/]+))?$/.exec(url.pathname);
    if (!route) return send(404, {message: 'no route'});
    if (req.method === 'POST') {
      if (opts.noCredits) return send(402, {message: 'Insufficient credits'});
      let raw = '';
      req.on('data', c => raw += c);
      req.on('end', () => {
        const body = JSON.parse(raw), id = `job-${++next}`;
        created.push({path: url.pathname, body});
        tasks.set(id, {id, type: route[1], prompt: body.prompt ?? '', created_at: Date.now(), consumed_credits: 0});
        // la respuesta se pierde después de cobrar: el job existe en Meshy pero el servicio no recibe su id
        if (opts.dropCreate) { res.destroy(); return; }
        send(202, {result: id});
      });
      return;
    }
    if (!route[2]) return send(200, [...tasks.values()].filter(t => t.type === route[1]).map(t => ({...t, status: 'IN_PROGRESS', progress: 10})).reverse());
    const task = tasks.get(route[2]);
    if (!task) return send(404, {message: 'unknown task'});
    const count = (polls.get(task.id as string) ?? 0) + 1;
    polls.set(task.id as string, count);
    if (count < 2) return send(200, {...task, status: 'IN_PROGRESS', progress: 40});
    send(200, {...task, status: 'SUCCEEDED', progress: 100, consumed_credits: 5,
      model_urls: {glb: `${base()}/files/${task.id}.glb`}, thumbnail_url: `${base()}/files/${task.id}.png`,
      texture_urls: [{base_color: `${base()}/files/${task.id}_base.png`}]});
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {baseUrl: base(), created, tasks, close: () => new Promise<void>(resolve => server.close(() => resolve()))};
}
