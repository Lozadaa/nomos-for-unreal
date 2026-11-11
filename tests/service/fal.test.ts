import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearImagen, falCfg, falKey, hayClaveFal } from '../../service/src/fal.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
/** fal falso: cola con alta, estado (una vuelta en curso) y resultado; guarda lo que recibe para comprobarlo. */
async function fal(opts: {error?: string; fuera?: boolean} = {}) {
  const visto = {altas: [] as {modelo: string; input: any}[], claves: new Set<string>(), sinClave: [] as string[]};
  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`, url = new URL(req.url!, base);
    const key = req.headers.authorization;
    if (url.pathname.startsWith('/archivo/')) { visto.sinClave.push(key ?? ''); res.setHeader('content-type', 'image/png'); return res.end(PNG); }
    if (key !== 'Key buena') { res.statusCode = 401; return res.end('{"detail":"Invalid key"}'); }
    visto.claves.add(key);
    res.setHeader('content-type', 'application/json');
    let body = '';
    req.on('data', d => body += d).on('end', () => {
      if (req.method === 'POST') {
        const modelo = url.pathname.slice(1), id = String(visto.altas.push({modelo, input: JSON.parse(body)}));
        const origen = opts.fuera ? 'http://otro.invalid' : base;
        return res.end(JSON.stringify({request_id: id, status_url: `${origen}/r/${id}/status?n=0`, response_url: `${base}/r/${id}`}));
      }
      const id = Number(url.pathname.split('/')[2]), modelo = visto.altas[id - 1].modelo;
      if (url.pathname.endsWith('/status')) {
        // primera consulta en curso; la segunda, completada
        if (url.searchParams.get('n') === '0' && !('visto' in visto.altas[id - 1])) { (visto.altas[id - 1] as any).visto = 1; return res.end('{"status":"IN_PROGRESS"}'); }
        return res.end(JSON.stringify({status: 'COMPLETED', ...(opts.error ? {error: opts.error} : {})}));
      }
      const imagen = {url: `${base}/archivo/${id}.png`, content_type: 'image/png'};
      res.end(JSON.stringify(modelo.includes('birefnet') ? {image: imagen} : {images: [imagen], description: ''}));
    });
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  const env = {FAL_KEY: 'buena', NOMOS_FAL_URL: `http://127.0.0.1:${(server.address() as {port: number}).port}`, NOMOS_FAL_SONDEO_MS: '10'};
  return {visto, env, cerrar: () => new Promise(ok => server.close(ok))};
}

test('imagen crear: pide la imagen a la cola de fal, espera, la baja sin mandar la clave al almacén y deja la receta', async () => {
  const f = await fal(), dir = mkdtempSync(join(tmpdir(), 'nomos-fal-')), salida = join(dir, 'Importar', 'UI', 'boton.png');
  try {
    const r = await crearImagen('  botón redondo de madera  ', salida, {aspecto: '16:9', resolucion: '2K'}, f.env);
    assert.deepEqual(readFileSync(salida), PNG);
    assert.deepEqual(f.visto.altas.map(a => a.modelo), ['fal-ai/nano-banana-pro']);
    assert.deepEqual(f.visto.altas[0].input, {prompt: 'botón redondo de madera', aspect_ratio: '16:9', resolution: '2K', output_format: 'png', num_images: 1});
    assert.deepEqual(f.visto.sinClave, [''], 'la descarga no lleva Authorization');
    const receta = JSON.parse(readFileSync(`${salida}.receta.json`, 'utf8'));
    assert.deepEqual([receta.modelo, receta.prompt, receta.sin_fondo, receta.coste_usd_aprox], ['fal-ai/nano-banana-pro', 'botón redondo de madera', false, 0.15]);
    assert.equal(r.imagen, salida);
    assert.doesNotMatch(JSON.stringify(r) + JSON.stringify(receta), /buena/, 'la clave no sale en la salida ni en la receta');
  } finally { await f.cerrar(); }
});

test('imagen crear --sin-fondo: pide fondo liso al modelo y pasa el resultado por el recorte', async () => {
  const f = await fal(), dir = mkdtempSync(join(tmpdir(), 'nomos-fal-')), salida = join(dir, 'icono.png');
  try {
    const r = await crearImagen('icono de trompo', salida, {sinFondo: true, resolucion: '4K'}, f.env);
    assert.deepEqual(f.visto.altas.map(a => a.modelo), ['fal-ai/nano-banana-pro', 'fal-ai/birefnet/v2']);
    assert.match(f.visto.altas[0].input.prompt, /^icono de trompo .*plain flat solid background/);
    assert.match(f.visto.altas[1].input.image_url, /\/archivo\/1\.png$/);
    assert.deepEqual([r.sin_fondo, r.coste_usd_aprox, r.prompt], [true, 0.3, 'icono de trompo']);
  } finally { await f.cerrar(); }
});

test('imagen crear: sin clave, con clave rechazada, con error del modelo y con argumentos malos lo dice claro', async () => {
  const f = await fal({error: 'content policy'}), dir = mkdtempSync(join(tmpdir(), 'nomos-fal-')), salida = join(dir, 'x.png');
  try {
    const sin = {NOMOS_FAL_CLAVE: join(dir, 'no-existe.json'), NOMOS_FAL_URL: f.env.NOMOS_FAL_URL};
    await assert.rejects(crearImagen('x', salida, {}, sin), /guardar-clave-fal/);
    await assert.rejects(crearImagen('x', salida, {}, {...f.env, FAL_KEY: 'mala'}), /fal rechaza la clave \(401\)/);
    await assert.rejects(crearImagen('x', salida, {}, f.env), /content policy/);
    await assert.rejects(crearImagen('x', join(dir, 'x.jpg'), {}, f.env), /\.png/);
    await assert.rejects(crearImagen('x', salida, {aspecto: '7:3'}, f.env), /--aspecto/);
    await assert.rejects(crearImagen(' ', salida, {}, f.env), /vacío/);
  } finally { await f.cerrar(); }
  const fuera = await fal({fuera: true});
  try { await assert.rejects(crearImagen('x', salida, {}, fuera.env), /URL fuera de/); } finally { await fuera.cerrar(); }
});

test('clave de fal: FAL_KEY manda; el archivo se descifra (o va tal cual fuera de Windows) y doctor solo sabe si existe', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-fal-')), file = join(dir, 'fal-clave.json');
  assert.equal(falKey({NOMOS_FAL_CLAVE: file}), null);
  assert.equal(hayClaveFal({NOMOS_FAL_CLAVE: file}), false);
  writeFileSync(file, '﻿' + JSON.stringify({version: 1, clave: 'CIFRADA'}));
  assert.equal(falKey({NOMOS_FAL_CLAVE: file}, c => `plana(${c})`), 'plana(CIFRADA)');
  assert.equal(falKey({NOMOS_FAL_CLAVE: file, FAL_KEY: 'env'}), 'env');
  assert.equal(hayClaveFal({NOMOS_FAL_CLAVE: file}), true);
  writeFileSync(file, JSON.stringify({version: 1, clave: 'tal-cual', cifrado: 'ninguno'}));
  assert.equal(falKey({NOMOS_FAL_CLAVE: file}), 'tal-cual');
  assert.equal(falCfg({}).cola, 'https://queue.fal.run');
});

test('nomos imagen crear por la CLI: JSON con la ruta; sin --salida, el uso', async () => {
  const f = await fal(), dir = mkdtempSync(join(tmpdir(), 'nomos-fal-'));
  const cli = join(import.meta.dirname, '..', '..', 'service', 'src', 'cli.ts'), env = {...process.env, ...f.env};
  try {
    // spawnSync bloquearía el servidor falso de este mismo proceso: la CLI corre aparte
    const run = (args: string[]) => new Promise<{code: number | null; out: string; err: string}>(ok => {
      const p = spawn(process.execPath, [cli, ...args], {cwd: dir, env}); let out = '', err = '';
      p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d); p.on('close', code => ok({code, out, err}));
    });
    const bien = await run(['imagen', 'crear', 'marco', 'dorado', '--salida', 'marco.png', '--sin-fondo']);
    assert.equal(bien.code, 0, bien.err);
    assert.equal(JSON.parse(bien.out).prompt, 'marco dorado');
    assert.deepEqual(readFileSync(join(dir, 'marco.png')), PNG);
    const mal = await run(['imagen', 'crear', 'marco']);
    assert.notEqual(mal.code, 0); assert.match(mal.err, /Uso: nomos imagen crear/);
  } finally { await f.cerrar(); }
});
