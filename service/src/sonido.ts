import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { findFfmpeg } from './adapters/ffmpeg.ts';
import { findUproject } from './editor/caliente.ts';

/**
 * jam 2026-11: sonido y música de WeLoveIndies (ventaja de la Epic MegaJam). Términos y robots en
 * docs/investigacion/weloveindies.md. La contraseña nunca pasa por Nomos: `login` abre Chrome con un perfil propio
 * (fuera del repo) y el usuario entra él mismo; `bajar` reutiliza ese perfil sin ventana y descarga desde dentro de la
 * página (las cookies no salen de Chrome). `buscar` usa la búsqueda pública del sitio, sin sesión.
 */
export type SonidoCfg = {sitio: string; base: string; chrome: string; pausaMs: number; oculto: boolean};
export function sonidoCfg(env = process.env): SonidoCfg {
  return {
    sitio: (env.NOMOS_WLI_SITIO ?? 'https://www.weloveindies.com').replace(/\/$/, ''),
    // en el perfil del usuario y no en LOCALAPPDATA: la app de Claude virtualiza AppData\Local y la terminal del usuario no lo vería
    base: env.NOMOS_WLI_DIR ?? join(env.USERPROFILE ?? env.HOME ?? '.', '.nomos', 'navegador', 'weloveindies'),
    chrome: env.NOMOS_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    pausaMs: Number(env.NOMOS_WLI_PAUSA_MS ?? 4000), // ritmo humano: una descarga cada pocos segundos
    oculto: env.NOMOS_WLI_OCULTO === '1',
  };
}

export const LICENCIA = 'WeLoveIndies Free & Demo (no comercial, por proyecto)';
export const TERMINOS = 'https://www.weloveindies.com/en/agb';
const SIN_SESION = 'Sin sesión de WeLoveIndies, o caducó. Ejecuta `nomos sonido login`';
const marca = (c: SonidoCfg) => join(c.base, 'sesion.json');
const fichasFile = (c: SonidoCfg) => join(c.base, 'fichas.json');

/** Para `doctor`: solo si hay sesión guardada y desde cuándo; nada de la sesión en sí. */
export function sesionGuardada(c = sonidoCfg()): string | null {
  try { return JSON.parse(readFileSync(marca(c), 'utf8')).guardada ?? null; } catch { return null; }
}

export type Ficha = {id: string; titulo: string; tipo: 'efecto' | 'musica'; duracion: number; autor: string | null;
  url: string; licencia: string; hq: string};
type Hit = {id: number; title: string; duration: number; artist?: string | null; file?: {url: string}; hqFile?: {url: string}};

function leerFichas(c: SonidoCfg): Record<string, Ficha> {
  try { return JSON.parse(readFileSync(fichasFile(c), 'utf8')); } catch { return {}; }
}

/** Búsqueda pública (`/api/search`, la misma que usa la web): no hace falta sesión. Guarda las fichas para `bajar`. */
export async function buscar(q: string, opts: {tipo?: 'musica' | 'efecto'; limite?: number} = {}, c = sonidoCfg()): Promise<Omit<Ficha, 'hq'>[]> {
  const limite = opts.limite ?? 10;
  const tipos = opts.tipo ? [opts.tipo] : ['efecto', 'musica'] as const;
  const fichas: Ficha[] = [];
  for (const tipo of tipos) {
    const url = `${c.sitio}/api/search?search-params=${encodeURIComponent(q)}&q=${encodeURIComponent(q)}${tipo === 'musica' ? '&for-music=true' : ''}`;
    const r = await fetch(url, {headers: {Accept: 'application/json'}});
    if (!r.ok) throw new Error(`WeLoveIndies respondió ${r.status} a la búsqueda`);
    const hits: {_source: Hit}[] = (await r.json())?.result?.hits?.hits ?? [];
    const cupo = opts.tipo ? limite : Math.ceil(limite / 2);
    for (const {_source: h} of hits.filter(x => x._source?.hqFile?.url).slice(0, cupo)) fichas.push({
      id: `${tipo === 'musica' ? 'm' : 'e'}${h.id}`, titulo: h.title, tipo, duracion: Math.round(h.duration * 10) / 10,
      autor: h.artist ?? null, url: h.file?.url ? c.sitio + h.file.url : `${c.sitio}/en/${tipo === 'musica' ? 'music' : 'sounds'}-for-games`,
      licencia: LICENCIA, hq: h.hqFile!.url,
    });
  }
  mkdirSync(c.base, {recursive: true});
  writeFileSync(fichasFile(c), JSON.stringify({...leerFichas(c), ...Object.fromEntries(fichas.map(f => [f.id, f]))}));
  return fichas.slice(0, limite).map(({hq: _, ...f}) => f);
}

// --- Chrome por el protocolo de DevTools ------------------------------------------------------------------------------
type Nav = {evaluar(expr: string): Promise<any>; cerrar(): Promise<void>; vivo(): boolean};

async function abrirChrome(c: SonidoCfg, url: string, oculto: boolean): Promise<Nav> {
  if (!existsSync(c.chrome)) throw new Error(`No encuentro Chrome en ${c.chrome} (NOMOS_CHROME)`);
  const perfil = join(c.base, 'perfil'), puerto = join(perfil, 'DevToolsActivePort');
  mkdirSync(perfil, {recursive: true});
  rmSync(puerto, {force: true});
  const child: ChildProcess = spawn(c.chrome, [`--user-data-dir=${perfil}`, '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', ...(oculto ? ['--headless=new'] : []), url], {stdio: 'ignore', windowsHide: oculto});
  let salio = false; child.on('exit', () => { salio = true; }); child.on('error', () => { salio = true; });
  for (const fin = Date.now() + 30_000; !existsSync(puerto); await sleep(100))
    if (salio || Date.now() > fin) throw new Error('Chrome no abrió el puerto de depuración (¿otra ventana de Nomos con este perfil abierta? ciérrala)');
  await sleep(50);
  const [port, path] = readFileSync(puerto, 'utf8').split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = () => mal(new Error('No pude hablar con Chrome')); });
  let n = 0, abierto = true;
  const pendientes = new Map<number, {ok(v: any): void; mal(e: Error): void}>();
  ws.onmessage = e => {
    const m = JSON.parse(String(e.data)), p = pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    if (m.error) p.mal(new Error(m.error.message)); else p.ok(m.result);
  };
  ws.onclose = () => { abierto = false; for (const p of pendientes.values()) p.mal(new Error('navegador_cerrado')); pendientes.clear(); };
  const send = (method: string, params: object = {}, sessionId?: string) => new Promise<any>((ok, mal) => {
    if (!abierto) return mal(new Error('navegador_cerrado'));
    const id = ++n; pendientes.set(id, {ok, mal});
    ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  let pagina: {targetId: string} | undefined;
  for (const fin = Date.now() + 10_000; !pagina && Date.now() < fin; await sleep(100))
    pagina = (await send('Target.getTargets')).targetInfos.find((t: {type: string}) => t.type === 'page');
  if (!pagina) throw new Error('Chrome abrió sin pestaña');
  const {sessionId} = await send('Target.attachToTarget', {targetId: pagina.targetId, flatten: true});
  return {
    vivo: () => abierto && !salio,
    async evaluar(expression) {
      const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async cerrar() {
      // cierre limpio: Chrome escribe las cookies en el perfil
      try { await send('Browser.close'); } catch { /* ya cerrado */ }
      for (const fin = Date.now() + 10_000; !salio && Date.now() < fin;) await sleep(100);
      if (!salio) child.kill();
      try { ws.close(); } catch { /* da igual */ }
    },
  };
}

/** ¿La pestaña está en el sitio y el sitio dice que hay usuario? Solo vuelve un sí o un no: los datos de la cuenta no salen de Chrome. */
async function haySesion(nav: Nav, c: SonidoCfg): Promise<boolean> {
  const origen = new URL(c.sitio).origin;
  try {
    return await nav.evaluar(`location.origin === ${JSON.stringify(origen)} && document.readyState !== 'loading'
      ? fetch('/api/user', {credentials: 'same-origin', headers: {Accept: 'application/json'}}).then(r => r.text()).then(t => {
          try { const j = JSON.parse(t); return !!j && typeof j === 'object' && !Array.isArray(j) && Object.keys(j).length > 0; } catch { return false; } })
      : false`) === true;
  } catch (e) {
    if (!nav.vivo()) throw e;
    return false; // la pestaña está navegando
  }
}

async function enElSitio(nav: Nav, c: SonidoCfg): Promise<void> {
  const origen = JSON.stringify(new URL(c.sitio).origin);
  for (const fin = Date.now() + 30_000; Date.now() < fin; await sleep(200))
    try { if (await nav.evaluar(`location.origin === ${origen} && document.readyState === 'complete'`)) return; } catch { /* cargando */ }
  throw new Error(`WeLoveIndies no cargó en 30 s (${c.sitio})`);
}

/** `nomos sonido login`: ventana visible en la página de entrada; el usuario entra él mismo. Nomos no toca los campos. */
export async function login(c = sonidoCfg(), log = console.log): Promise<void> {
  const nav = await abrirChrome(c, `${c.sitio}/en/account-authentication/page/login`, c.oculto);
  try {
    log('Entra en WeLoveIndies en la ventana de Chrome que se abrió (email o Google). Nomos no ve ni guarda tu contraseña; espero hasta 15 min…');
    for (const fin = Date.now() + 15 * 60_000; Date.now() < fin; await sleep(1500)) {
      try {
        if (await haySesion(nav, c)) {
          mkdirSync(c.base, {recursive: true});
          writeFileSync(marca(c), JSON.stringify({guardada: new Date().toISOString()}));
          log('Sesión guardada');
          return;
        }
      } catch { throw new Error('Se cerró la ventana antes de entrar. Vuelve a ejecutar `nomos sonido login`'); }
    }
    throw new Error('No vi la sesión en 15 minutos. Vuelve a ejecutar `nomos sonido login`');
  } finally { await nav.cerrar(); }
}

/** Descarga dentro de la página (mismo origen, cookies del perfil) y trae los bytes por trozos. */
async function descargar(nav: Nav, ruta: string): Promise<{status: number; datos?: Buffer}> {
  const cab = await nav.evaluar(`fetch(${JSON.stringify(ruta)}, {credentials: 'same-origin'}).then(async r => {
    const tipo = r.headers.get('content-type') || '';
    if (!r.ok || tipo.includes('text/html') || tipo.includes('json')) return {status: r.ok ? 401 : r.status};
    globalThis.__nomos = new Uint8Array(await r.arrayBuffer());
    return {status: r.status, tam: globalThis.__nomos.length}; })`);
  if (cab.tam === undefined) return {status: cab.status};
  const trozos: Buffer[] = [], paso = 3 * 1024 * 1024;
  for (let i = 0; i < cab.tam; i += paso) trozos.push(Buffer.from(await nav.evaluar(`(() => { const b = globalThis.__nomos.subarray(${i}, ${i + paso});
    let s = ''; for (let j = 0; j < b.length; j += 32768) s += String.fromCharCode.apply(null, b.subarray(j, j + 32768)); return btoa(s); })()`), 'base64'));
  await nav.evaluar('delete globalThis.__nomos');
  return {status: cab.status, datos: Buffer.concat(trozos)};
}

// --- Al juego: .wav, licencia al lado, receta de importación y CREDITOS.md ---------------------------------------------
type Entrada = {slug: string; titulo: string; tipo: string; autor: string | null; id: string | null; url: string | null; original: string};
const nombreAsset = (slug: string) => ('SW_' + slug.split(/[^A-Za-z0-9]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join('')).slice(0, 64);
function destinoUe(destino: string): string {
  const d = destino.replace(/\\/g, '/').replace(/\/$/, '');
  if (!/^Content(\/[A-Za-z0-9_]+)*$/.test(d)) throw new Error('--destino tiene que ser Content/Carpeta (letras, números y _)');
  return '/Game' + d.slice('Content'.length);
}

function aWav(src: string, out: string): void {
  if (extname(src).toLowerCase() === '.wav') { if (resolve(src) !== resolve(out)) copyFileSync(src, out); return; }
  const ff = findFfmpeg();
  if (!ff) throw new Error(`${basename(src)} no es .wav y no encuentro ffmpeg para convertirlo`);
  const r = spawnSync(ff.bin, [...(ff.baseArgs ?? []), '-y', '-loglevel', 'error', '-i', src, '-c:a', 'pcm_s16le', out], {windowsHide: true, timeout: 120_000});
  if (r.status !== 0 || !existsSync(out)) throw new Error(`ffmpeg no pudo convertir ${basename(src)}: ${String(r.stderr).trim()}`);
}

const uproyecto = (juego: string) => { try { return findUproject(juego); } catch { throw new Error(`--juego: ${juego} no es la carpeta de un juego (con un .uproject)`); } };
function alJuego(juego: string, destino: string, e: Entrada, estado: 'prueba' | 'licenciado', escribir: (wav: string) => void) {
  const uproject = uproyecto(juego), dir = join(juego, 'Importar', 'Audio'), wav = join(dir, `${e.slug}.wav`);
  mkdirSync(dir, {recursive: true});
  escribir(wav);
  const nota = estado === 'prueba'
    ? 'Descarga de prueba (botón de descarga por archivo). Los términos solo permiten usarla para pruebas internas: antes de entregar, añade el sonido al cofre, elige la licencia Free & Demo y vuelve a meterlo con `nomos sonido importar`.'
    : 'Descargado del cofre con la licencia Free & Demo elegida en WeLoveIndies.';
  writeFileSync(`${wav}.licencia.json`, JSON.stringify({fuente: 'WeLoveIndies', id: e.id, titulo: e.titulo, tipo: e.tipo, autor: e.autor,
    url: e.url, original: e.original, licencia: LICENCIA, terminos: TERMINOS, estado, nota,
    jam: 'La jam tiene premios en metálico: confirma con WeLoveIndies que la licencia cubre la entrega (ver docs/investigacion/weloveindies.md de Nomos).',
    fecha: new Date().toISOString()}, null, 2));
  const receta = join(dir, `${e.slug}.receta.json`);
  writeFileSync(receta, JSON.stringify({receta: 1, plantilla: 'importar_malla', fuente: resolve(wav), destino: destinoUe(destino), nombre: nombreAsset(e.slug)}, null, 2));
  creditos(juego, e, estado, relative(juego, wav).replace(/\\/g, '/'));
  return {archivo: wav, licencia: `${wav}.licencia.json`, asset: `${destinoUe(destino)}/${nombreAsset(e.slug)}`, estado,
    importar: `nomos ue receta "${resolve(receta)}" --proyecto "${uproject}"`};
}

const CABECERA = `# Créditos

## Sonido y música

De [WeLoveIndies](https://www.weloveindies.com) (ventaja de la Epic MegaJam), licencia Free & Demo: no comercial y ligada a
este proyecto ([términos](${TERMINOS})). Para una publicación no comercial piden mostrar su tráiler en los créditos de
inicio. La jam tiene premios en metálico: confirma con WeLoveIndies que la licencia cubre la entrega.
`;
function creditos(juego: string, e: Entrada, estado: string, archivo: string): void {
  const file = join(juego, 'CREDITOS.md');
  const actual = existsSync(file) ? readFileSync(file, 'utf8') : CABECERA;
  const linea = `- \`${archivo}\` · «${e.titulo}»${e.autor ? `, ${e.autor}` : ''} · WeLoveIndies${e.id ? ` (${e.id})` : ''}${e.url ? ` · ${e.url}` : ''}`
    + ` · ${LICENCIA}${estado === 'prueba' ? ' · PRUEBA: licenciar en el cofre antes de entregar' : ' · licenciado'}`;
  const lineas = actual.replace(/\s+$/, '').split('\n'), i = lineas.findIndex(l => l.startsWith(`- \`${archivo}\``));
  if (i >= 0) lineas[i] = linea; else lineas.push(...(actual.includes('WeLoveIndies') ? [] : ['', CABECERA.trim()]), linea);
  writeFileSync(file, lineas.join('\n') + '\n');
}

/** `nomos sonido bajar`: con la sesión de `login`, sin ventana, una descarga cada `pausaMs`. */
export async function bajar(ids: string[], juego: string, destino = 'Content/Audio', c = sonidoCfg()) {
  juego = resolve(juego); uproyecto(juego); destinoUe(destino);
  const fichas = leerFichas(c), faltan = ids.filter(id => !fichas[id]);
  if (faltan.length) throw new Error(`No conozco ${faltan.join(', ')}: búscalos antes con \`nomos sonido buscar\``);
  if (!sesionGuardada(c)) throw new Error(SIN_SESION);
  const nav = await abrirChrome(c, `${c.sitio}/robots.txt`, true), hechos = [];
  try {
    await enElSitio(nav, c);
    if (!await haySesion(nav, c)) { rmSync(marca(c), {force: true}); throw new Error(SIN_SESION); }
    for (const [i, id] of ids.entries()) {
      if (i) await sleep(c.pausaMs);
      const f = fichas[id], r = await descargar(nav, f.hq);
      if ([401, 403, 419].includes(r.status)) { rmSync(marca(c), {force: true}); throw new Error(SIN_SESION); }
      if (!r.datos) throw new Error(`WeLoveIndies respondió ${r.status} al descargar ${id}`);
      const slug = basename(f.hq, extname(f.hq));
      hechos.push(alJuego(juego, destino, {slug, titulo: f.titulo, tipo: f.tipo, autor: f.autor, id, url: f.url, original: c.sitio + f.hq}, 'prueba', wav => {
        const crudo = join(juego, 'Importar', 'Audio', `${slug}.descarga${extname(f.hq)}`);
        writeFileSync(crudo, r.datos!);
        try { aWav(crudo, wav); } finally { rmSync(crudo, {force: true}); }
      }));
    }
  } finally { await nav.cerrar(); }
  return hechos;
}

/** `nomos sonido importar`: lo que el usuario bajó a mano del cofre ya licenciado (zip descomprimido). */
export function importar(carpeta: string, juego: string, destino = 'Content/Audio', c = sonidoCfg()) {
  juego = resolve(juego); uproyecto(juego); destinoUe(destino);
  const fichas = Object.values(leerFichas(c)), hechos = [];
  const audio = (readdirSync(resolve(carpeta), {recursive: true}) as string[]).filter(f => /\.(wav|mp3|ogg|flac|aiff?)$/i.test(f));
  if (!audio.length) throw new Error(`No hay audio en ${carpeta}`);
  for (const f of audio) {
    const slug = basename(f, extname(f)), ficha = fichas.find(x => basename(x.hq, extname(x.hq)) === slug);
    hechos.push(alJuego(juego, destino, {slug, titulo: ficha?.titulo ?? slug, tipo: ficha?.tipo ?? 'desconocido', autor: ficha?.autor ?? null,
      id: ficha?.id ?? null, url: ficha?.url ?? null, original: resolve(carpeta, f)}, 'licenciado', wav => aWav(resolve(carpeta, f), wav)));
  }
  return hechos;
}

const USO = 'Uso: nomos sonido login | sonido buscar "PALABRAS" [--tipo musica|efecto] [--limite 10]'
  + ' | sonido bajar ID… --juego CARPETA [--destino Content/Audio] | sonido importar CARPETA --juego CARPETA [--destino Content/Audio]';
export async function sonidoCli(argv: string[]): Promise<boolean> {
  const first = argv.find((a, i) => !a.startsWith('--') && !['--data', '--tipo', '--limite', '--juego', '--destino'].includes(argv[i - 1] ?? ''));
  if (first !== 'sonido') return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'},
    tipo: {type: 'string'}, limite: {type: 'string'}, juego: {type: 'string'}, destino: {type: 'string'}}});
  const [, accion, ...resto] = positionals;
  const limite = values.limite === undefined ? 10 : Number(values.limite);
  if (accion === 'login' && !resto.length) { await login(); return true; }
  if (accion === 'buscar' && resto.length && (!values.tipo || ['musica', 'efecto'].includes(values.tipo)) && Number.isInteger(limite) && limite > 0 && limite <= 50) {
    console.log(JSON.stringify(await buscar(resto.join(' '), {tipo: values.tipo as 'musica' | 'efecto' | undefined, limite}), null, 2));
    return true;
  }
  if (accion === 'bajar' && resto.length && values.juego) { console.log(JSON.stringify(await bajar(resto, values.juego, values.destino), null, 2)); return true; }
  if (accion === 'importar' && resto.length === 1 && values.juego) { console.log(JSON.stringify(importar(resto[0], values.juego, values.destino), null, 2)); return true; }
  throw new Error(USO);
}
