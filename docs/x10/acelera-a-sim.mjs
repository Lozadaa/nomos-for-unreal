// acelera A, medida con Unreal real: un worker hace N `ue py --tarea` (script trivial, editor caliente de FastVfxBench)
// con PAUSA s de «pensar» entre medias; a los 5 s llega una comprobación (withEditor real) que reintenta cada 1 s.
// modo=antes: el worker pide el turno a mano al principio (worker turn --wait) y lo suelta al final.
// modo=despues: turno por orden. Servicio de verdad en proceso: requestTurn/releaseTurn/withEditor sobre SQLite en memoria.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const R = 'file:///C:/Users/richa/Documents/nomos-wt/acelera/service/src/';
const { openDb } = await import(R + 'db.ts'), { createTask } = await import(R + 'repo/tasks.ts'), { startRun } = await import(R + 'repo/runs.ts');
const { requestTurn, releaseTurn, noteWarm, warmToClose } = await import(R + 'unreal-turn.ts'), { withEditor } = await import(R + 'editor/queue.ts');
// datos crudos en acelera-a-turno.txt
const [modo, N = '5', PAUSA = '8'] = process.argv.slice(2);
const uproject = 'C:/Users/richa/Documents/Unreal Projects/FastVfxBench/FastVfxBench.uproject';
const dataDir = mkdtempSync(join(tmpdir(), 'nomos-sim-')), db = openDb(':memory:'), probe = () => ({freeGb: 20, editors: 0, tools: 0});
const worker = startRun(db, {taskId: createTask(db, {title: 'W1 Worker', area: 'gameplay', state: 'implementando'}).id, role: 'implementacion', provider: 'claude', sessionRef: 't'});
const check = startRun(db, {taskId: createTask(db, {title: 'C1 Check', area: 'ui'}).id, role: 'qa', provider: 'unreal'});
const t0 = Date.now(), ev = (e, x = {}) => console.log(JSON.stringify({t: (Date.now() - t0) / 1000, e, ...x}));
const holds = []; let grantAt = null;
const server = createServer((req, res) => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
  const body = JSON.parse(raw || '{}'); let out;
  if (req.url.endsWith('/release')) { out = releaseTurn(db, dataDir, worker.taskId); if (out.released && body.caliente) noteWarm(db, body.caliente, worker.taskId);
    if (out.released && grantAt) { holds.push(Date.now() - grantAt); grantAt = null; } }
  else { out = requestTurn(db, dataDir, worker.taskId, probe); if (out.granted && !out.held) grantAt = Date.now();
    const cerrar = out.granted ? warmToClose(db, body.uproject) : []; if (cerrar.length) out = {...out, cerrar}; }
  res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
writeFileSync(join(dataDir, 'service.json'), JSON.stringify({pid: process.pid, port: server.address().port, token: 't', startedAt: 'x'}));
const py = join(dataDir, 's.py'); writeFileSync(py, 'import unreal\nprint(len(unreal.EditorAssetLibrary.list_assets("/Game/FastVfx")))\n');
const cli = 'C:/Users/richa/Documents/nomos-wt/acelera/service/src/cli.ts', run = promisify(execFile);
const nomos = (...a) => run(process.execPath, [cli, ...a, '--data', dataDir], {cwd: 'C:/Users/richa/Documents/Unreal Projects/FastVfxBench', encoding: 'utf8'});
// la comprobación: a los 5 s, withEditor real cada 1 s hasta entrar; dentro, 2 s de «comprobación»
let checkWait = null;
const checkLoop = (async () => { await new Promise(r => setTimeout(r, 5000)); const ask = Date.now();
  for (;;) { const r = await withEditor({db}, {dir: '', uproject, name: 'Unreal'}, check, async () => { await new Promise(r => setTimeout(r, 2000)); return 'ok'; });
    if (r === 'ok') { checkWait = (Date.now() - ask) / 1000; ev('check-dentro', {espera_s: checkWait}); return; }
    await new Promise(r => setTimeout(r, 1000)); } })();
if (modo === 'antes') { await nomos('worker', 'turn', worker.taskId, '--wait'); grantAt = Date.now(); ev('turno-a-mano'); }
for (let i = 0; i < Number(N); i++) {
  const s = Date.now(); await nomos('ue', 'py', py, '--tarea', worker.taskId, '--proyecto', uproject); ev('ue-py', {i, ms: Date.now() - s});
  await new Promise(r => setTimeout(r, Number(PAUSA) * 1000));
}
if (modo === 'antes') { await nomos('worker', 'turn', worker.taskId, '--release').catch(() => {}); releaseTurn(db, dataDir, worker.taskId); holds.push(Date.now() - grantAt); }
await checkLoop;
console.log(JSON.stringify({modo, scripts: Number(N), pausa_s: Number(PAUSA), turno_retenido_s: holds.map(h => h / 1000), total_retenido_s: holds.reduce((a, b) => a + b, 0) / 1000, espera_check_s: checkWait, total_s: (Date.now() - t0) / 1000}));
server.close(); process.exit(0);
