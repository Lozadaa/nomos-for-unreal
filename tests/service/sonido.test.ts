import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bajar, buscar, importar, login, sesionGuardada, sonidoCfg, type SonidoCfg } from '../../service/src/sonido.ts';
import { validarReceta } from '../../service/src/editor/recetas.ts';
import { removeDir } from '../remove-dir.ts';

const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40, 1)]);
/** WeLoveIndies falso: búsqueda pública, login que «entra» solo con abrir la página, /api/user y /protected con cookie. */
async function sitio() {
  const estado = {caducada: false, descargas: [] as number[]};
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x'), dentro = /sid=ok/.test(req.headers.cookie ?? '') && !estado.caducada;
    if (url.pathname === '/api/search') {
      const musica = url.searchParams.get('for-music') === 'true';
      const hit = musica ? {id: 7, title: 'Tension Loop', duration: 92, file: {url: '/music/tension.mp3'}, hqFile: {url: '/protected/music/tension-loop.wav'}}
        : {id: 5, title: 'OBJECT DOOR Church Door 01', duration: 5.21, artist: 'BIAC', file: {url: '/sound/door.mp3'}, hqFile: {url: '/protected/sound/object-door-church-door-01.wav'}};
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({result: {hits: {hits: [{_source: hit}, {_source: {id: 9, title: 'sin hq', duration: 1}}]}}}));
    }
    if (url.pathname.endsWith('/login')) {
      res.setHeader('set-cookie', 'sid=ok; Path=/; Max-Age=3600');
      res.setHeader('content-type', 'text/html');
      return res.end('<html><body>Log in</body></html>');
    }
    if (url.pathname === '/api/user') { res.setHeader('content-type', 'application/json'); return res.end(dentro ? '{"id":1}' : '[]'); }
    if (url.pathname.startsWith('/protected/')) {
      if (!dentro) { res.setHeader('content-type', 'text/html'); return res.end('<html>login</html>'); }
      estado.descargas.push(Date.now());
      res.setHeader('content-type', 'audio/wav');
      return res.end(WAV);
    }
    res.setHeader('content-type', 'text/plain'); res.end('User-agent: *\nDisallow:\n');
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as {port: number}).port;
  return {estado, url: `http://127.0.0.1:${port}`, cerrar: () => new Promise(ok => server.close(ok))};
}
function preparar(sitioUrl: string): {cfg: SonidoCfg; juego: string; root: string} {
  const root = mkdtempSync(join(tmpdir(), 'nomos-sonido-')), juego = join(root, 'Juego');
  mkdirSync(juego); writeFileSync(join(juego, 'Juego.uproject'), '{}');
  return {root, juego, cfg: {...sonidoCfg({}), sitio: sitioUrl, base: join(root, 'wli'), pausaMs: 300, oculto: true}};
}

test('sonido buscar: búsqueda pública sin sesión, id con tipo, licencia y límite; bajar sin sesión pide login', async () => {
  const s = await sitio(), {cfg, juego, root} = preparar(s.url);
  try {
    const r = await buscar('door', {}, cfg);
    assert.deepEqual(r.map(f => [f.id, f.tipo, f.titulo, f.duracion, f.autor]),
      [['e5', 'efecto', 'OBJECT DOOR Church Door 01', 5.2, 'BIAC'], ['m7', 'musica', 'Tension Loop', 92, null]]);
    assert.match(r[0].licencia, /no comercial/);
    assert.equal(r[0].url, `${s.url}/sound/door.mp3`);
    assert.ok(!('hq' in r[0]), 'la ruta protegida no se muestra');
    assert.deepEqual((await buscar('x', {tipo: 'musica', limite: 1}, cfg)).map(f => f.id), ['m7']);
    await assert.rejects(bajar(['e5'], juego, 'Content/Audio', cfg), /Ejecuta `nomos sonido login`/);
    await assert.rejects(bajar(['e99'], juego, 'Content/Audio', cfg), /nomos sonido buscar/);
  } finally { await s.cerrar(); removeDir(root); }
});

test('sonido importar: lo licenciado del cofre entra con su licencia, receta .wav válida y una línea por archivo en CREDITOS.md', async () => {
  const s = await sitio(), {cfg, juego, root} = preparar(s.url);
  try {
    await buscar('door', {tipo: 'efecto'}, cfg);
    const zip = join(root, 'cofre', 'Sound'); mkdirSync(zip, {recursive: true});
    writeFileSync(join(zip, 'object-door-church-door-01.wav'), WAV);
    const [hecho] = importar(join(root, 'cofre'), juego, 'Content/Audio/Puertas', cfg);
    assert.equal(hecho.asset, '/Game/Audio/Puertas/SW_ObjectDoorChurchDoor01');
    const lic = JSON.parse(readFileSync(hecho.licencia, 'utf8'));
    assert.deepEqual([lic.fuente, lic.id, lic.autor, lic.estado], ['WeLoveIndies', 'e5', 'BIAC', 'licenciado']);
    assert.match(lic.jam, /premios en metálico/);
    const receta = JSON.parse(readFileSync(join(juego, 'Importar', 'Audio', 'object-door-church-door-01.receta.json'), 'utf8'));
    assert.deepEqual(validarReceta(receta), {ok: true, receta});
    importar(join(root, 'cofre'), juego, 'Content/Audio/Puertas', cfg);
    const creditos = readFileSync(join(juego, 'CREDITOS.md'), 'utf8');
    assert.equal(creditos.match(/object-door-church-door-01\.wav/g)?.length, 1, creditos);
    assert.match(creditos, /premios en metálico/);
  } finally { await s.cerrar(); removeDir(root); }
});

const chrome = sonidoCfg().chrome;
test('sonido login y bajar con Chrome de verdad contra el sitio falso: sesión, ritmo, licencia de prueba y sesión caducada', {skip: !existsSync(chrome) && 'sin Chrome'}, async () => {
  const s = await sitio(), {cfg, juego, root} = preparar(s.url);
  try {
    const log: string[] = [];
    await login(cfg, m => log.push(m));
    assert.equal(log.at(-1), 'Sesión guardada');
    assert.ok(sesionGuardada(cfg));
    await buscar('door', {}, cfg);
    const hechos = await bajar(['e5', 'm7'], juego, 'Content/Audio', cfg);
    assert.deepEqual(readFileSync(hechos[0].archivo), WAV);
    assert.ok(s.estado.descargas[1] - s.estado.descargas[0] >= 250, 'una descarga cada pausaMs');
    assert.equal(JSON.parse(readFileSync(hechos[1].licencia, 'utf8')).estado, 'prueba');
    assert.match(readFileSync(join(juego, 'CREDITOS.md'), 'utf8'), /tension-loop\.wav.*PRUEBA: licenciar en el cofre/);
    assert.match(hechos[0].importar, /^nomos ue receta ".*object-door-church-door-01\.receta\.json" --proyecto ".*Juego\.uproject"$/);
    s.estado.caducada = true;
    await assert.rejects(bajar(['e5'], juego, 'Content/Audio', cfg), /Ejecuta `nomos sonido login`/);
    assert.equal(sesionGuardada(cfg), null, 'la sesión caducada se olvida');
  } finally { await s.cerrar(); removeDir(root); }
});
