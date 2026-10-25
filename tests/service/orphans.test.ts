import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alive, dataOf, killTree, orphans, type Server } from '../../service/src/orphans.ts';
import { quietMs } from '../../service/src/clean.ts';
import { cliPath } from '../cli-helpers.ts';
import { removeDir } from '../remove-dir.ts';

const until = async (check: () => boolean, ms = 20_000) => {
  const end = Date.now() + ms;
  while (!check()) { if (Date.now() > end) throw new Error('No se cumplió la condición'); await new Promise(r => setTimeout(r, 50)); }
};

test('dataOf lee --data con y sin comillas solo de un server.ts --serve', () => {
  assert.equal(dataOf('"C:\\node.exe" C:\\x\\service\\src\\server.ts --serve --data "C:\\Temp\\a b\\.nomos" --port 1'), 'C:\\Temp\\a b\\.nomos');
  assert.equal(dataOf('node /x/service/src/server.ts --serve --data /tmp/n/.nomos --port 1'), '/tmp/n/.nomos');
  assert.equal(dataOf('node C:\\x\\service\\src\\cli.ts start --data C:\\Temp\\n'), null);
  assert.equal(dataOf('node C:\\x\\server.ts --data C:\\Temp\\n'), null, 'sin --serve no es un servicio');
});

test('orphans: carpeta borrada o temporal sin registrar y vieja; nunca datos vivos fuera de Temp, registrados ni relativos', t => {
  const tmp = mkdtempSync(join(tmpdir(), 'nomos-huerfanos-')); t.after(() => removeDir(tmp));
  const outside = mkdtempSync(join(process.cwd(), '.h20-fuera-')); t.after(() => removeDir(outside));
  const live = join(tmp, 'vivo'), registered = join(tmp, 'registrado'); mkdirSync(live); mkdirSync(registered);
  const now = Date.now(), old = now - quietMs - 1000;
  const s = (pid: number, data: string, start = old): Server => ({pid, data, start});
  const minAge = 10 * 60_000, borrado = now - minAge - 1000;
  const found = orphans([s(1, join(tmp, 'borrado'), borrado), s(2, live), s(3, live, now - 1000), s(4, outside), s(5, registered),
    s(6, '.nomos'), s(7, join(outside, 'borrado'), borrado), s(8, join(tmp, 'recien-borrado'), now - 1000), s(process.pid, join(tmp, 'borrado'))],
    {tmp, registered: [registered.toUpperCase()], now, quiet: quietMs, minAge});
  assert.deepEqual(found.map(o => o.pid), [1, 2, 7], 'el 8 puede ser una prueba que aún cierra su servicio');
  assert.match(found[0].why, /ya no existe/); assert.match(found[1].why, /temporal/);
});

test('killTree cierra el proceso y sus hijos', async () => {
  const child = spawn(process.execPath, ['-e', `require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e9)'],{stdio:'ignore'});
    process.stdout.write(String(require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e9)'],{stdio:'ignore'}).pid));setInterval(()=>{},1e9)`],
    {windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
  let grandchild = 0; child.stdout.on('data', d => { grandchild = Number(d.toString()); });
  await until(() => grandchild > 0);
  killTree(child.pid!);
  await until(() => !alive(child.pid!) && !alive(grandchild));
});

test('nomos clean --dry-run lista el servidor huérfano y no lo cierra', async t => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-clean-huerfano-')); t.after(() => removeDir(root));
  const data = join(root, 'Juego', '.nomos'); mkdirSync(data, {recursive: true});
  // imita la línea de órdenes de un servicio cuya carpeta de datos ya se borró
  const ghost = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e9)', join(root, 'service', 'src', 'server.ts'), '--serve',
    '--data', join(root, 'borrado', '.nomos'), '--port', '1'], {windowsHide: true, stdio: 'ignore'});
  t.after(() => { if (alive(ghost.pid!)) killTree(ghost.pid!); });
  // sin edad mínima solo aquí: en seco no cierra nada, tampoco los servicios de otras pruebas en marcha
  const dry = execFileSync(process.execPath, [cliPath, 'clean', '--dry-run', '--data', data],
    {encoding: 'utf8', windowsHide: true, env: {...process.env, NOMOS_CLEAN_MIN_AGE_MS: '0'}});
  assert.match(dry, new RegExp(`servidor ${ghost.pid} .*ya no existe`));
  assert.match(dry, /Se cerrarían \d+ servidor(es)? huérfanos?/);
  assert.ok(alive(ghost.pid!));
});
