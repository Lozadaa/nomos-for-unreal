import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { olvidarResumen, resumen, resumenCacheado, type Lentas } from '../../service/src/resumen.ts';
import { removeDir } from '../remove-dir.ts';

const now = new Date('2026-11-10T15:00:00');
const req = (name: string, present: boolean) => ({name, present, detail: present ? 'ok' : 'no está', lost: 'se pierde algo'});
const lentas = (over: Partial<Lentas> = {}): Lentas => ({
  requisitos: [req('Git', true), req('Claude Code', true), req('Pillow', true)], maquina: {freeGb: 20.5, editors: 1}, ramTotalGb: 64,
  disco: {libreGb: 300, totalGb: 1000}, unreal: '5.9.0', unrealMcp: true, emsdk: true, equipo: null, ...over,
});
function db() {
  const d = openDb(':memory:');
  const spend = (id: string, amount: number, at: string) => d.prepare("insert into spends(id,created_at,updated_at,budget_id,run_id,kind,amount,note) values(?,?,?,'b',null,'tokens',?,null)").run(id, at, at, amount);
  spend('s1', 1000, new Date('2026-11-10T09:00:00').toISOString());
  spend('s2', 500, new Date('2026-11-07T09:00:00').toISOString());
  spend('s3', 9999, new Date('2026-10-01T09:00:00').toISOString());
  const run = (id: string, provider: string, role: string, state = 'running') => d.prepare("insert into runs(id,created_at,updated_at,task_id,role,provider,attempt,state,started_at,skills) values(?,?,?,'t',?,?,1,?,?,'[]')")
    .run(id, now.toISOString(), now.toISOString(), role, provider, state, now.toISOString());
  run('r1', 'claude', 'implementer'); run('r2', 'claude', 'director'); run('r3', 'claude', 'reviewer', 'done'); run('r4', 'codex', 'implementer');
  return d;
}

test('resumen todo configurado: tokens hoy y semana, workers, Meshy por cuenta, máquina y nada que falte', () => {
  const r = resumen(db(), undefined, lentas(), [{nombre: 'env', creditos: 100}, {nombre: 'Richard', creditos: 1100}], now);
  assert.equal(r.claude.tokensHoy, 1000);
  assert.equal(r.claude.tokensSemana, 1500);
  assert.equal(r.claude.workers, 2);
  assert.equal(r.claude.director, true);
  assert.deepEqual(r.ias, [], 'Codex y OpenCode sin cupo no aparecen');
  assert.deepEqual(r.meshy, {cuentas: [{nombre: 'env', creditos: 100}, {nombre: 'Richard', creditos: 1100}], total: 1200});
  assert.equal(r.maquina.unreal, '5.9.0');
  assert.equal(r.maquina.discoBajo, false);
  assert.deepEqual(r.falta, []);
});

test('resumen sin nada configurado: sin cifras de Meshy y cada falta con su comando', () => {
  const r = resumen(db(), undefined, lentas({requisitos: [req('Git', false), req('Pillow', false), req('graphify', false)], unrealMcp: false, emsdk: false, unreal: null}), [], now);
  assert.equal(r.meshy, null);
  const by = Object.fromEntries(r.falta.map(f => [f.que, f]));
  assert.equal(by['Pillow'].comando, 'pip install pillow');
  assert.equal(by['Git'].comando, 'winget install Git.Git');
  assert.equal(by['graphify'].comando, undefined, 'sin comando conocido no se inventa uno');
  assert.match(by['Meshy sin cuentas'].comando!, /guardar-claves-meshy\.ps1$/);
  assert.equal(by['MCP de Unreal'].comando, 'claude mcp add --transport http unreal-mcp http://127.0.0.1:8000/mcp');
  assert.ok(by['emsdk para la versión web']);
});

test('resumen: Meshy sin créditos y disco bajo salen en «falta»', () => {
  const r = resumen(db(), undefined, lentas({disco: {libreGb: 12.4, totalGb: 500}}), [{nombre: 'env', creditos: 0}], now);
  assert.equal(r.meshy!.total, 0);
  assert.equal(r.maquina.discoBajo, true);
  assert.deepEqual(r.falta.map(f => f.que), ['Meshy sin créditos', 'Poco disco']);
  assert.match(r.falta[1].detalle!, /Quedan 12 GB/);
});

test('cupo de Codex en config.json lo muestra con los que tiene en uso', () => {
  const root = mkdtempSync(join(tmpdir(), 'nomos-resumen-')), dataDir = join(root, '.nomos'); mkdirSync(dataDir);
  try {
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({concurrency: {claude: 2, codex: 1}}));
    assert.deepEqual(resumen(db(), dataDir, lentas(), [], now).ias, [{id: 'codex', nombre: 'Codex', cupo: 1, enUso: 1}]);
  } finally { removeDir(root); }
});

test('caché: Meshy se consulta como mucho cada 5 min y nunca sale una clave', async () => {
  olvidarResumen();
  let meshyCalls = 0, lentasCalls = 0;
  const fuentes = {lentas: async () => { lentasCalls++; return lentas(); }, meshy: async () => { meshyCalls++; return [{nombre: 'env', creditos: 7}]; }};
  const d = db(), t = Date.parse('2026-11-10T15:00:00Z');
  await resumenCacheado(d, 'x', fuentes, t);
  await resumenCacheado(d, 'x', fuentes, t + 60_000);
  assert.equal(meshyCalls, 1);
  assert.equal(lentasCalls, 2, 'lo lento se refresca a los 30 s');
  const r = await resumenCacheado(d, 'x', fuentes, t + 5 * 60_000 + 1);
  assert.equal(meshyCalls, 2);
  assert.doesNotMatch(JSON.stringify(r), /key|clave|token"/i);
  olvidarResumen();
});
