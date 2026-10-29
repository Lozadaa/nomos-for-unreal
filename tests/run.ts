// `npm test`: la suite entera con su propio temporal; al terminar no puede quedar vivo ningún `server.ts --serve` cuyo
// `--data` esté dentro (hito 20: las pasadas dejaban servicios de 500 MB vivos en Windows).
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { killTree, listServers } from '../service/src/orphans.ts';
import { within } from '../service/src/retention.ts';
import { removeDir } from './remove-dir.ts';

const ours = (root: string) => listServers().filter(s => within(s.data, root));
const root = mkdtempSync(join(tmpdir(), 'nomos-suite-'));
const before = listServers().filter(s => within(s.data, tmpdir())).length;
// hito 26: ninguna prueba escribe en Second Brain; las de memoria usan un brain.py falso y lo reactivan dentro del test
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['tests/**/*.test.ts'];
const run = spawnSync(process.execPath, ['--test', '--import', './tests/registry-env.ts', ...files],
  {stdio: 'inherit', env: {...process.env, NOMOS_MEMORY: 'off', TEMP: root, TMP: root, TMPDIR: root}});
// el último `stop` puede estar cerrando aún: margen corto antes de contar
let left = ours(root);
for (const end = Date.now() + 10_000; left.length && Date.now() < end; left = ours(root)) await new Promise(r => setTimeout(r, 500));
console.log(`Servicios de prueba vivos en el temporal: ${before} antes de la suite, ${left.length} de esta suite después`);
for (const s of left) { console.error(`Quedó vivo el servicio ${s.pid} (${s.data}); se cierra`); killTree(s.pid); }
try { removeDir(root); } catch { /* algo aún lo retiene: lo barre nomos clean */ }
process.exitCode = left.length ? 1 : run.status ?? 1;
