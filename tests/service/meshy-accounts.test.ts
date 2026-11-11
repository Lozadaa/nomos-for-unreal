import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createMeshy } from '../../service/src/adapters/meshy.ts';
import { meshyAccounts, type MeshyAccount } from '../../service/src/adapters/meshy-accounts.ts';
import { createMeshyGenerate, createMeshyPoll } from '../../service/src/handlers/asset-meshy.ts';
import { checkCapability } from '../../service/src/doctor.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { setLimits, budgetSummary } from '../../service/src/repo/budget.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { listEvents } from '../../service/src/store.ts';
import type { Command, Run } from '../../service/src/model.ts';
import type { WorkerContext } from '../../service/src/runner.ts';
import { meshyServer } from '../fakes/meshy-server.ts';
import { removeDir } from '../remove-dir.ts';

function clavesFile(cuentas: {nombre: string; clave: string}[]) {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-claves-')), file = join(dir, 'meshy-claves.json');
  // Set-Content -Encoding UTF8 de PowerShell 5.1 escribe BOM
  writeFileSync(file, '﻿' + JSON.stringify({version: 1, cuentas: cuentas.map(c => ({...c, guardada: '2026-11-10T00:00:00'}))}));
  return {dir, file};
}

test('cuentas: MESHY_API_KEY como «env» y luego las del archivo en orden; descifrado bajo demanda y cacheado', () => {
  const {dir, file} = clavesFile([{nombre: 'Ana', clave: 'cifrada-a'}, {nombre: 'Beto', clave: 'cifrada-b'}]);
  try {
    let calls = 0;
    const decrypt = (c: string) => { calls++; return `plana-${c}`; };
    const accounts = meshyAccounts({MESHY_API_KEY: 'k-env', NOMOS_MESHY_CLAVES: file}, decrypt);
    assert.deepEqual(accounts.map(a => [a.name, a.origin]), [['env', 'env'], ['Ana', 'archivo'], ['Beto', 'archivo']]);
    assert.equal(calls, 0, 'nada se descifra hasta usar la clave');
    assert.equal(accounts[1].key(), 'plana-cifrada-a');
    assert.equal(meshyAccounts({NOMOS_MESHY_CLAVES: file}, decrypt)[0].key(), 'plana-cifrada-a');
    assert.equal(calls, 1, 'cacheado en memoria del proceso');
    assert.ok(!JSON.stringify(accounts).includes('plana'), 'la cuenta serializada no lleva la clave');
    assert.deepEqual(meshyAccounts({}, decrypt), [], 'sin USERPROFILE ni variable, ninguna cuenta');
    assert.equal(meshyAccounts({NOMOS_MESHY_CLAVES: join(dir, 'no-existe.json')}, decrypt).length, 0);
  } finally { removeDir(dir); }
});

test('macOS y Linux: ~/.nomos/meshy-claves.json desde HOME y claves sin DPAPI («cifrado»: «ninguno») sin descifrar', () => {
  const home = mkdtempSync(join(tmpdir(), 'nomos-home-'));
  try {
    mkdirSync(join(home, '.nomos'));
    writeFileSync(join(home, '.nomos', 'meshy-claves.json'), JSON.stringify({version: 1, cuentas: [
      {nombre: 'Ana', clave: 'msy-plana', cifrado: 'ninguno'}, {nombre: 'Beto', clave: 'cifrada-b'}]}));
    const decrypt = (c: string) => `dpapi-${c}`;
    const accounts = meshyAccounts({HOME: home}, decrypt);
    assert.deepEqual(accounts.map(a => [a.name, a.key()]), [['Ana', 'msy-plana'], ['Beto', 'dpapi-cifrada-b']]);
  } finally { removeDir(home); }
});

async function setup(servers: Record<string, Parameters<typeof meshyServer>[0]>) {
  const fakes = Object.fromEntries(await Promise.all(Object.entries(servers).map(async ([n, o]) => [n, await meshyServer(o)] as const)));
  const accounts: MeshyAccount[] = Object.keys(servers).map(name => ({name, origin: 'archivo', key: () => 'clave-falsa'}));
  const deps = {accounts: () => accounts, meshy: (a: MeshyAccount) => createMeshy({baseUrl: fakes[a.name].baseUrl, apiKey: a.key()})};
  const db = openDb(':memory:'), dataDir = mkdtempSync(join(tmpdir(), 'nomos-meshy-'));
  const ctx = {db, dataDir, projectDir: dataDir} as unknown as WorkerContext;
  setLimits(db, 'workspace', 'default', {meshyCredits: 100});
  const task = createTask(db, {title: 'Barril', area: 'assets'});
  const command = (type: string, payload: object) => ({id: randomUUID(), type, payload, idempotencyKey: randomUUID()}) as unknown as Command;
  const gen = () => createMeshyGenerate(deps)(command('asset.meshy_generate',
    {taskId: task.id, kind: 'text', params: {prompt: 'barril', mode: 'preview'}, estimatedCredits: 20}), ctx) as Promise<any>;
  const tick = (runId: string) => createMeshyPoll(deps)(command('asset.meshy_poll', {runId}), ctx) as Promise<any>;
  const runs = () => filtered<Run>(db, 'runs', {provider: 'meshy'});
  return {fakes, db, gen, tick, runs, async close() { for (const f of Object.values(fakes)) await f.close(); db.close(); removeDir(dataDir); }};
}

test('rotación: la cuenta con más saldo crea el job; seguimiento y descarga con la misma cuenta', async () => {
  const s = await setup({Ana: {balance: 50}, Beto: {balance: 800}});
  try {
    const {runId} = await s.gen();
    assert.equal(s.fakes.Beto.created.length, 1);
    assert.equal(s.fakes.Ana.created.length, 0);
    assert.equal(s.runs()[0].metadata.account, 'Beto', 'el run guarda el nombre de la cuenta, nunca la clave');
    await s.tick(runId);
    assert.equal((await s.tick(runId)).state, 'done', 'Ana no conoce job-1: si el poll usara otra cuenta fallaría');
  } finally { await s.close(); }
});

test('402 al crear: marca la cuenta agotada y pasa a la siguiente; todas agotadas → error claro y sin gasto', async () => {
  const s = await setup({Ana: {balance: 900, noCredits: true}, Beto: {balance: 10}});
  try {
    await s.gen();
    assert.equal(s.fakes.Beto.created.length, 1);
    assert.equal(s.runs()[0].metadata.account, 'Beto');
    assert.ok(listEvents(s.db, 0).some(e => e.type === 'meshy.account_exhausted' && (e.payload as any).account === 'Ana'));
  } finally { await s.close(); }
  const t = await setup({Ana: {noCredits: true}, Beto: {noCredits: true}});
  try {
    await assert.rejects(t.gen(), /meshy_missing_key/);
    assert.equal(t.runs()[0].state, 'failed');
    assert.equal(t.runs()[0].summary, 'Todas las cuentas de Meshy sin créditos');
    assert.equal(budgetSummary(t.db, 'workspace', 'default').spent.meshyCredits, 0, 'no se cobra lo que no se creó');
  } finally { await t.close(); }
});

test('doctor: «comprobado» con N cuentas y saldo total, sin nombres ni claves', async () => {
  const {dir, file} = clavesFile([{nombre: 'Ana', clave: 'x'}, {nombre: 'Beto', clave: 'y'}]);
  try {
    const r = await checkCapability('meshy', {env: {NOMOS_MESHY_CLAVES: file}, meshy: {balance: async () => 120}});
    assert.deepEqual(r, {state: 'comprobado', detail: '2 cuentas de Meshy: 240 créditos'});
  } finally { removeDir(dir); }
});
