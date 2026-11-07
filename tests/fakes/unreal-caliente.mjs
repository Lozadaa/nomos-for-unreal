// Editor caliente falso (x10): imita nomos_caliente.py. Late cada 100 ms en NOMOS_CALIENTE/latido.json y «ejecuta»
// cada trabajo de entrada/: un script que contiene FALLA falla; si el trabajo trae NOMOS_REPORT, escribe {"ok":true}.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
    const code = readFileSync(job.script, 'utf8'), ok = !code.includes('FALLA'); trabajos++;
    if (job.env?.NOMOS_REPORT) writeFileSync(job.env.NOMOS_REPORT, JSON.stringify({ok}));
    write(join(salida, job.id + '.json'), {ok, salida: `ejecutado ${job.script.split('/').pop()} n=${trabajos} pid=${process.pid}`, error: ok ? null : 'Traceback: FALLA', ms: 1});
    ultimo = Date.now();
  }
  if (Date.now() - ultimo > idle) return end();
  write(join(dir, 'latido.json'), {pid: process.pid, en: Date.now() / 1000, desde, trabajos});
}, 100);
function end() { clearInterval(timer); if (existsSync(join(dir, 'latido.json'))) rmSync(join(dir, 'latido.json')); process.exit(0); }
