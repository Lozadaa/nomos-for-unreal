// Editor caliente falso (x10): imita nomos_caliente.py. Late cada 100 ms en NOMOS_CALIENTE/latido.json y «ejecuta»
// cada trabajo de entrada/: un script que contiene FALLA falla; si el trabajo trae NOMOS_REPORT, escribe {"ok":true}.
// Los scripts de FASTVFX los ejecuta el editor sin GUI falso (unreal-cmd.mjs) con el env del trabajo; nomos_ue_test.py
// deja el index.json de «Automation RunTests» (filtro con «Falla»: un test falla; con «Nada»: ningún test casa).
// Lanzado en frío con -ExecCmds="Automation RunTests …; Quit" -ReportExportPath=D escribe D/index.json y sale.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const uproject = process.argv.find(a => a.endsWith('.uproject'));
const informe = (filtro) => filtro.includes('Falla')
  ? {succeeded: 1, succeededWithWarnings: 0, failed: 1, notRun: 0, tests: [{fullTestPath: 'Juego.Falla.Uno', state: 'Fail',
    entries: [{event: {type: 'Error', message: 'Expected 1, got 2'}}]}, {fullTestPath: 'Juego.Falla.Dos', state: 'Success', entries: []}]}
  : {succeeded: 2, succeededWithWarnings: 0, failed: 0, notRun: 0, tests: [{fullTestPath: `${filtro}.A`, state: 'Success', entries: []},
    {fullTestPath: `${filtro}.B`, state: 'Success', entries: []}]};
const frio = process.argv.find(a => a.startsWith('-ExecCmds=') && a.includes('Automation RunTests'));
if (frio) {
  const filtro = frio.match(/RunTests (.*?);/)[1], salida = process.argv.find(a => a.startsWith('-ReportExportPath=')).slice(18).replace(/"/g, '');
  if (!filtro.includes('Nada')) writeFileSync(join(salida, 'index.json'), '﻿' + JSON.stringify(informe(filtro)));
  process.exit(0);
}
const dir = process.env.NOMOS_CALIENTE, idle = Number(process.env.NOMOS_CALIENTE_INACTIVO ?? 600) * 1000;
const entrada = join(dir, 'entrada'), salida = join(dir, 'salida');
mkdirSync(entrada, {recursive: true}); mkdirSync(salida, {recursive: true});
const write = (path, data) => { writeFileSync(path + '.tmp', JSON.stringify(data)); renameSync(path + '.tmp', path); };
const desde = Date.now() / 1000; let ultimo = Date.now(), trabajos = 0;
// el arranque en frío: 300 ms antes del primer latido
await new Promise(r => setTimeout(r, 300));
const timer = setInterval(() => {
  for (const f of readdirSync(entrada).filter(f => f.endsWith('.json')).sort()) {
    const job = JSON.parse(readFileSync(join(entrada, f), 'utf8')); rmSync(join(entrada, f));
    if (job.salir) { write(join(salida, job.id + '.json'), {ok: true, salida: '', error: null, ms: 0}); return end(); }
    const nombre = job.script.split('/').pop();
    let ok, error = null;
    trabajos++;
    if (nombre.startsWith('nomos_fastvfx')) {
      const r = spawnSync(process.execPath, [join(import.meta.dirname, 'unreal-cmd.mjs'), uproject, `-ExecutePythonScript=${job.script}`],
        {env: {...process.env, ...job.env}, encoding: 'utf8'});
      ok = r.status === 0; error = ok ? null : r.stderr;
    } else if (nombre === 'nomos_ue_test.py') {
      ok = !job.env.NOMOS_TEST_FILTRO.includes('Nada');
      if (ok) { mkdirSync(join(dir, 'tests'), {recursive: true}); writeFileSync(join(dir, 'tests', 'index.json'), '﻿' + JSON.stringify(informe(job.env.NOMOS_TEST_FILTRO))); }
      else error = `RuntimeError: No automation tests matched '${job.env.NOMOS_TEST_FILTRO}'`;
    } else {
      ok = !readFileSync(job.script, 'utf8').includes('FALLA'); error = ok ? null : 'Traceback: FALLA';
      if (job.env?.NOMOS_REPORT) writeFileSync(job.env.NOMOS_REPORT, JSON.stringify({ok}));
    }
    write(join(salida, job.id + '.json'), {ok, salida: `ejecutado ${nombre} n=${trabajos} pid=${process.pid}`, error, ms: 1});
    ultimo = Date.now();
  }
  if (Date.now() - ultimo > idle) return end();
  write(join(dir, 'latido.json'), {pid: process.pid, en: Date.now() / 1000, desde, trabajos});
}, 100);
function end() { clearInterval(timer); if (existsSync(join(dir, 'latido.json'))) rmSync(join(dir, 'latido.json')); process.exit(0); }
