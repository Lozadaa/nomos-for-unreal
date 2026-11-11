import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearPedido, listarPedidos } from '../../service/src/pedidos.ts';

const juego = () => mkdtempSync(join(tmpdir(), 'nomos-pedidos-'));
const LARGO = 'tierra apisonada rojiza del ruedo de un patio venezolano, vista de cerca: piedrecitas finas y grietas secas, pintada a mano, baldosa de 200 cm que repite sin costuras, luz plana sin sombras, 2048 px, mapas de color base, normal y rugosidad; sin hierba ni huellas';
const ENCARGO = 'un ruedo redondo de tierra de unos 6 m';

test('pedido manual: se guarda en docs/pedidos, sale pendiente y pasa a hecho cuando hay una imagen en su destino', () => {
  const dir = juego();
  assert.deepEqual(listarPedidos(dir), []);
  const p = crearPedido(dir, {id: 'tierra-ruedo', prompt: `  ${LARGO}  `, encargo: ENCARGO, destino: 'Importar\\Materiales\\tierra-ruedo\\', sustituto: 'ruido a dos escalas'});
  assert.equal(p.encargo, ENCARGO);
  assert.deepEqual([p.para, p.prompt, p.destino, p.sustituto], ['PBRGen', LARGO, 'Importar/Materiales/tierra-ruedo', 'ruido a dos escalas']);
  assert.equal(JSON.parse(readFileSync(join(dir, 'docs', 'pedidos', 'tierra-ruedo.json'), 'utf8')).id, 'tierra-ruedo');
  assert.equal(listarPedidos(dir)[0].estado, 'pendiente');
  mkdirSync(join(dir, 'Importar', 'Materiales', 'tierra-ruedo', 'mapas'), {recursive: true});
  writeFileSync(join(dir, 'Importar', 'Materiales', 'tierra-ruedo', 'leeme.txt'), '');
  assert.equal(listarPedidos(dir)[0].estado, 'pendiente', 'un texto no es el resultado');
  writeFileSync(join(dir, 'Importar', 'Materiales', 'tierra-ruedo', 'mapas', 'basecolor.PNG'), '');
  assert.equal(listarPedidos(dir)[0].estado, 'hecho');
});

test('pedido manual: id, prompt y destino malos se rechazan; un archivo roto no tumba la lista', () => {
  const dir = juego(), ok = {id: 'madera', prompt: LARGO, encargo: ENCARGO, destino: 'Importar/Materiales/madera'};
  assert.throws(() => crearPedido(dir, {...ok, id: 'Con Espacios'}), /minúsculas/);
  assert.throws(() => crearPedido(dir, {...ok, prompt: 'tierra rojiza sin costuras'}), /ultra específico \(≥ 200 caracteres\)/);
  assert.throws(() => crearPedido(dir, {...ok, encargo: ' '}), /frase literal del usuario/);
  assert.throws(() => crearPedido(dir, {...ok, destino: '../fuera'}), /dentro del juego/);
  assert.throws(() => crearPedido(dir, {...ok, destino: 'C:/Windows'}), /dentro del juego/);
  crearPedido(dir, ok);
  writeFileSync(join(dir, 'docs', 'pedidos', 'roto.json'), '{');
  assert.deepEqual(listarPedidos(dir).map(p => p.id), ['madera']);
});

test('nomos pedido por la CLI: crear y lista legible con prompt, destino y sustituto', () => {
  const dir = juego(), cli = join(import.meta.dirname, '..', '..', 'service', 'src', 'cli.ts');
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], {cwd: dir, encoding: 'utf8'});
  assert.match(run('pedido', 'lista').stdout, /Sin pedidos/);
  const creado = run('pedido', 'crear', 'piedra-borde', LARGO, '--encargo', ENCARGO, '--destino', 'Importar/Materiales/piedra-borde', '--para', 'PBRGen', '--sustituto', 'gris con ruido');
  assert.equal(creado.status, 0, creado.stderr);
  const lista = run('pedido', 'lista').stdout;
  assert.ok(lista.includes(`PENDIENTE  piedra-borde  (PBRGen)\n  Pediste: «${ENCARGO}»\n  Prompt: ${LARGO}\n  Deja el resultado en: Importar/Materiales/piedra-borde/\n  Mientras tanto: gris con ruido`), lista);
  assert.equal(JSON.parse(run('pedido', 'lista', '--json').stdout)[0].estado, 'pendiente');
  assert.match(run('pedido', 'crear', 'sin-destino', 'x').stderr, /Uso: nomos pedido crear/);
});

test('GET /status trae los pedidos pendientes del juego para la alerta del panel; hechos, no', async () => {
  const {openDb} = await import('../../service/src/db.ts'), {createServer} = await import('../../service/src/server.ts');
  const dir = juego(), data = join(dir, '.nomos');
  mkdirSync(data);
  const db = openDb(join(data, 'nomos.db')), server = createServer(db, 'secret', 'service/web', data);
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  const status = async () => (await (await fetch(`http://127.0.0.1:${(server.address() as {port: number}).port}/status`, {headers: {Authorization: 'Bearer secret'}})).json()).pedidos;
  try {
    assert.deepEqual(await status(), []);
    crearPedido(dir, {id: 'tierra-ruedo', prompt: LARGO, encargo: ENCARGO, destino: 'Importar/Materiales/tierra-ruedo'});
    crearPedido(dir, {id: 'madera', prompt: LARGO, encargo: ENCARGO, destino: 'Importar/Materiales/madera'});
    mkdirSync(join(dir, 'Importar', 'Materiales', 'madera'), {recursive: true});
    writeFileSync(join(dir, 'Importar', 'Materiales', 'madera', 'color.png'), '');
    assert.deepEqual((await status()).map((p: {id: string; encargo: string}) => [p.id, p.encargo]), [['tierra-ruedo', ENCARGO]]);
  } finally { await new Promise(ok => server.close(ok)); db.close(); }
});
