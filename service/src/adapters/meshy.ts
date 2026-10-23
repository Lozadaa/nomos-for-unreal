import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

/** Meshy solo para piezas hard surface: sin rig ni animate (decisión del usuario, 2026-10-23). */
export const meshyKinds = ['text', 'image', 'remesh'] as const;
export type MeshyKind = typeof meshyKinds[number];
export type MeshyTask = {id: string; status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'; progress: number;
  type?: string; prompt?: string; createdAt: number; modelUrls: Record<string, string>; thumbnailUrl: string | null;
  textureUrls: Record<string, string>[]; creditsUsed: number | null; error: string | null};
export type Meshy = ReturnType<typeof createMeshy>;

// Rutas comprobadas en docs.meshy.ai el 2026-10-23 (ver docs/aceptacion-hito4.md).
const paths: Record<MeshyKind, string> = {text: '/openapi/v2/text-to-3d', image: '/openapi/v1/image-to-3d', remesh: '/openapi/v1/remesh'};
export function requireKind(kind: unknown): MeshyKind {
  if (!meshyKinds.includes(kind as MeshyKind)) throw new Error('meshy_kind_not_allowed');
  return kind as MeshyKind;
}
const mime: Record<string, string> = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'};

/** REST de Meshy con `fetch`, sin dependencias. La clave vive en MESHY_API_KEY y nunca se escribe en eventos ni artefactos. */
export function createMeshy(opts: {baseUrl?: string; apiKey?: string; fetch?: typeof fetch} = {}) {
  const baseUrl = opts.baseUrl ?? 'https://api.meshy.ai', doFetch = opts.fetch ?? globalThis.fetch;
  const apiKey = opts.apiKey ?? process.env.MESHY_API_KEY;
  async function call(method: 'GET' | 'POST', path: string, body?: object): Promise<any> {
    if (!apiKey) throw new Error('meshy_missing_key');
    const res = await doFetch(baseUrl + path, {method, headers: {Authorization: `Bearer ${apiKey}`,
      ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined});
    if (!res.ok) throw new Error(`meshy_http_${res.status}`);
    return res.json();
  }
  const normal = (t: any): MeshyTask => ({id: t.id, status: t.status, progress: Number(t.progress ?? 0), type: t.type, prompt: t.prompt,
    createdAt: Number(t.created_at ?? 0), modelUrls: t.model_urls ?? {}, thumbnailUrl: t.thumbnail_url ?? null,
    textureUrls: Array.isArray(t.texture_urls) ? t.texture_urls : [], creditsUsed: t.consumed_credits ?? null, error: t.task_error?.message || null});
  async function create(kind: MeshyKind, body: object): Promise<string> {
    const {result} = await call('POST', paths[requireKind(kind)], body);
    if (typeof result !== 'string') throw new Error('meshy_bad_response');
    return result;
  }
  return {
    create,
    textTo3d: (p: {prompt: string; mode: 'preview' | 'refine'; previewTaskId?: string} & Record<string, unknown>) => {
      const {previewTaskId, ...rest} = p;
      return create('text', p.mode === 'refine' ? {...rest, preview_task_id: previewTaskId} : rest);
    },
    imageTo3d: (p: {imageUrl?: string; imagePath?: string} & Record<string, unknown>) => {
      const {imageUrl, imagePath, ...rest} = p;
      const url = imageUrl ?? `data:${mime[extname(imagePath ?? '').toLowerCase()] ?? 'image/png'};base64,${readFileSync(imagePath!).toString('base64')}`;
      return create('image', {...rest, image_url: url});
    },
    remesh: (p: {inputTaskId?: string; modelUrl?: string; targetPolycount?: number; topology?: 'quad' | 'triangle'}) =>
      create('remesh', {input_task_id: p.inputTaskId, model_url: p.modelUrl, target_polycount: p.targetPolycount, topology: p.topology}),
    getTask: async (kind: MeshyKind, id: string) => normal(await call('GET', `${paths[requireKind(kind)]}/${encodeURIComponent(id)}`)),
    listTasks: async (kind: MeshyKind, {pageSize = 50} = {}) =>
      ((await call('GET', `${paths[requireKind(kind)]}?page_size=${pageSize}&sort_by=-created_at`)) as any[]).map(normal),
    /** Los enlaces firmados de Meshy caducan a los 3 días: se copia al disco propio en cuanto el job termina. */
    async download(url: string, destFile: string): Promise<void> {
      const res = await doFetch(url);
      if (!res.ok) throw new Error(`meshy_download_${res.status}`);
      writeFileSync(destFile, Buffer.from(await res.arrayBuffer()));
    },
    balance: async () => Number((await call('GET', '/openapi/v1/balance')).balance),
  };
}
