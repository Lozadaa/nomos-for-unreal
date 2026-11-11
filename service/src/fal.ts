import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { dpapi } from './adapters/meshy-accounts.ts';

/**
 * Imágenes generadas con fal.ai para lo que el juego dibuja en 2D: iconos, marcos, fondos de menú, ilustraciones.
 * Modelo por defecto Nano Banana Pro (`fal-ai/nano-banana-pro`, unos 0,15 $ por imagen a 1K o 2K y el doble a 4K);
 * `--sin-fondo` pasa el resultado por BiRefNet para dejar el PNG con transparencia. La clave nunca va en la línea de
 * órdenes ni sale de este módulo: `FAL_KEY` o la guardada por scripts/guardar-clave-fal.ps1 (.sh en macOS y Linux).
 */
export type FalCfg = {cola: string; modelo: string; recorte: string; sondeoMs: number; esperaMs: number};
export function falCfg(env = process.env): FalCfg {
  return {
    cola: (env.NOMOS_FAL_URL ?? 'https://queue.fal.run').replace(/\/$/, ''),
    modelo: env.NOMOS_FAL_MODELO ?? 'fal-ai/nano-banana-pro',
    recorte: 'fal-ai/birefnet/v2',
    sondeoMs: Number(env.NOMOS_FAL_SONDEO_MS ?? 1500),
    esperaMs: Number(env.NOMOS_FAL_ESPERA_MS ?? 5 * 60_000),
  };
}

const SIN_CLAVE = 'Falta la clave de fal: ejecuta scripts/guardar-clave-fal.ps1 (o .sh), o define FAL_KEY';
export const claveFile = (env: NodeJS.ProcessEnv) => {
  const home = env.USERPROFILE ?? env.HOME;
  return env.NOMOS_FAL_CLAVE ?? (home ? join(home, '.nomos', 'fal-clave.json') : null);
};
/** `FAL_KEY` o el archivo guardado (DPAPI en Windows; fuera, tal cual con permisos 600). `null` si no hay ninguna. */
export function falKey(env: NodeJS.ProcessEnv = process.env, decrypt = dpapi): string | null {
  if (env.FAL_KEY) return env.FAL_KEY;
  const file = claveFile(env);
  if (!file || !existsSync(file)) return null;
  try {
    const d = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (typeof d.clave !== 'string' || !d.clave) return null;
    return d.cifrado === 'ninguno' ? d.clave : decrypt(d.clave);
  } catch { return null; }
}
/** Para `doctor` y capacidades: solo si hay clave, nunca la clave. */
export const hayClaveFal = (env: NodeJS.ProcessEnv = process.env) => !!env.FAL_KEY || !!(claveFile(env) && existsSync(claveFile(env)!));

/** Envía `input` a la cola de fal, espera y devuelve el resultado del modelo. */
export async function falRun(modelo: string, input: Record<string, unknown>, key: string, c = falCfg()): Promise<any> {
  const headers = {Authorization: `Key ${key}`, 'content-type': 'application/json'};
  const dicho = async (r: Response) => { try { const j = await r.json() as {detail?: unknown}; return typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail ?? j).slice(0, 300); } catch { return ''; } };
  const alta = await fetch(`${c.cola}/${modelo}`, {method: 'POST', headers, body: JSON.stringify(input)});
  if (alta.status === 401 || alta.status === 403) throw new Error(`fal rechaza la clave (${alta.status}): guárdala de nuevo con scripts/guardar-clave-fal.ps1`);
  if (!alta.ok) throw new Error(`fal respondió ${alta.status} a ${modelo}: ${await dicho(alta)}`);
  const {status_url, response_url} = await alta.json() as {status_url: string; response_url: string};
  // la clave solo viaja a la cola a la que se envió el trabajo, digan lo que digan las URLs de la respuesta
  for (const u of [status_url, response_url]) if (new URL(u).origin !== new URL(c.cola).origin) throw new Error(`fal devolvió una URL fuera de ${c.cola}: ${u}`);
  for (const fin = Date.now() + c.esperaMs; ; await sleep(c.sondeoMs)) {
    const r = await fetch(status_url, {headers});
    if (!r.ok) throw new Error(`fal respondió ${r.status} al estado de ${modelo}`);
    const estado = await r.json() as {status: string; error?: string};
    if (estado.status === 'COMPLETED') { if (estado.error) throw new Error(`fal no pudo generar con ${modelo}: ${estado.error}`); break; }
    if (Date.now() > fin) throw new Error(`fal no terminó ${modelo} en ${Math.round(c.esperaMs / 1000)} s`);
  }
  const res = await fetch(response_url, {headers});
  if (!res.ok) throw new Error(`fal respondió ${res.status} al resultado de ${modelo}: ${await dicho(res)}`);
  return res.json();
}

const ASPECTOS = ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'];
const RESOLUCIONES = ['1K', '2K', '4K'];
export type ImagenOpts = {aspecto?: string; resolucion?: string; sinFondo?: boolean};

/** Genera una imagen y la deja en `salida` (PNG), con `<salida>.receta.json` al lado: prompt, modelo y coste aproximado. */
export async function crearImagen(prompt: string, salida: string, o: ImagenOpts = {}, env: NodeJS.ProcessEnv = process.env, c = falCfg(env)) {
  const aspecto = o.aspecto ?? '1:1', resolucion = o.resolucion ?? '1K';
  if (!prompt.trim()) throw new Error('El prompt está vacío');
  if (!/\.png$/i.test(salida)) throw new Error('La salida tiene que ser un .png');
  if (!ASPECTOS.includes(aspecto)) throw new Error(`--aspecto: uno de ${ASPECTOS.join(', ')}`);
  if (!RESOLUCIONES.includes(resolucion)) throw new Error(`--resolucion: una de ${RESOLUCIONES.join(', ')}`);
  const key = falKey(env);
  if (!key) throw new Error(SIN_CLAVE);
  // el modelo no pinta transparencia: para recortar bien necesita un fondo liso detrás de la pieza
  const pedido = o.sinFondo ? `${prompt.trim()} Isolated and centered on a plain flat solid background, no shadow, no text outside the subject.` : prompt.trim();
  const gen = await falRun(c.modelo, {prompt: pedido, aspect_ratio: aspecto, resolution: resolucion, output_format: 'png', num_images: 1}, key, c);
  let url: string | undefined = gen?.images?.[0]?.url;
  if (!url) throw new Error('fal no devolvió ninguna imagen');
  if (o.sinFondo) {
    url = (await falRun(c.recorte, {image_url: url, output_format: 'png'}, key, c))?.image?.url;
    if (!url) throw new Error('fal no devolvió la imagen recortada');
  }
  const img = await fetch(url);  // el almacén de fal, sin la clave
  if (!img.ok) throw new Error(`No se pudo bajar la imagen (${img.status})`);
  salida = resolve(salida);
  mkdirSync(dirname(salida), {recursive: true});
  writeFileSync(salida, Buffer.from(await img.arrayBuffer()));
  const receta = {origen: 'fal.ai', modelo: c.modelo, prompt: prompt.trim(), aspecto, resolucion, sin_fondo: !!o.sinFondo,
    coste_usd_aprox: resolucion === '4K' ? 0.3 : 0.15, creada: new Date().toISOString()};
  writeFileSync(`${salida}.receta.json`, JSON.stringify(receta, null, 2) + '\n');
  return {imagen: salida, ...receta};
}

const USO = 'Uso: nomos imagen crear "PROMPT" --salida RUTA.png [--aspecto 1:1] [--resolucion 1K|2K|4K] [--sin-fondo]';
export async function imagenCli(argv: string[]): Promise<boolean> {
  const first = argv.find((a, i) => !a.startsWith('--') && !['--data', '--salida', '--aspecto', '--resolucion'].includes(argv[i - 1] ?? ''));
  if (first !== 'imagen') return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'}, salida: {type: 'string'},
    aspecto: {type: 'string'}, resolucion: {type: 'string'}, 'sin-fondo': {type: 'boolean'}}});
  const [, accion, ...resto] = positionals;
  if (accion !== 'crear' || !resto.length || !values.salida) throw new Error(USO);
  console.log(JSON.stringify(await crearImagen(resto.join(' '), values.salida, {aspecto: values.aspecto, resolucion: values.resolucion, sinFondo: values['sin-fondo']}), null, 2));
  return true;
}
