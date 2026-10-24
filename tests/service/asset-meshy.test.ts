import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openDb } from '../../service/src/db.ts';
import { createMeshy } from '../../service/src/adapters/meshy.ts';
import { createMeshyGenerate, createMeshyPoll, recoverMeshy } from '../../service/src/handlers/asset-meshy.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { setLimits, budgetSummary } from '../../service/src/repo/budget.ts';
import { listDecisions } from '../../service/src/repo/decisions.ts';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { listCatalog, upsertEntry } from '../../service/src/repo/catalog.ts';
import { filtered } from '../../service/src/repo/rows.ts';
import { listEvents } from '../../service/src/store.ts';
import type { Command, Run } from '../../service/src/model.ts';
import type { WorkerContext } from '../../service/src/runner.ts';
import { meshyServer } from '../fakes/meshy-server.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup(opts: Parameters<typeof meshyServer>[0] = {}, credits: number | null = 100) {
  const fake = await meshyServer(opts), db = openDb(':memory:'), dataDir = mkdtempSync(join(tmpdir(), 'nomos-meshy-'));
  const deps = {meshy: () => createMeshy({baseUrl: fake.baseUrl, apiKey: 'clave-falsa'})};
  const ctx = {db, dataDir, projectDir: dataDir} as unknown as WorkerContext;
  setLimits(db, 'workspace', 'default', {meshyCredits: credits});
  const task = createTask(db, {title: 'Caja de munición', area: 'assets'});
  const generate = createMeshyGenerate(deps), poll = createMeshyPoll(deps);
  const command = (type: string, payload: object, key = randomUUID()) => ({id: randomUUID(), type, payload, idempotencyKey: key}) as unknown as Command;
  const gen = (params: object, over: object = {}, key?: string) =>
    generate(command('asset.meshy_generate', {taskId: task.id, kind: 'text', params, estimatedCredits: 20, ...over}, key), ctx) as Promise<any>;
  const tick = (runId: string) => poll(command('asset.meshy_poll', {runId}), ctx) as Promise<any>;
  const runs = () => filtered<Run>(db, 'runs', {provider: 'meshy'});
  return {fake, db, ctx, task, gen, tick, runs, deps, async close() { await fake.close(); db.close(); rmSync(dataDir, {recursive: true, force: true}); }};
}
const types = (db: any) => listEvents(db, 0).map(e => e.type);

test('preview dentro de presupuesto: job, poll Preview → Guardado, copia propia, entrada meshy y gasto real', async () => {
  const s = await setup();
  try {
    const {runId, remoteId} = await s.gen({prompt: 'caja de munición metálica', mode: 'preview'});
    assert.equal(remoteId, 'job-1');
    assert.ok(types(s.db).includes('meshy.job.created'));
    assert.equal((await s.tick(runId)).deferred, true);
    const done = await s.tick(runId);
    assert.equal(done.state, 'done');
    assert.equal(readFileSync(done.model, 'utf8'), 'contenido de job-1.glb');
    assert.match(done.model, /artifacts[\\/]meshy[\\/]/);
    const [model] = listArtifacts(s.db, {kind: 'model'});
    assert.equal(model.previewPath, done.model);
    assert.deepEqual((model.provenance as any).remoteId, 'job-1');
    assert.match((model.provenance as any).label, /^Modelo Meshy · /, 'Entregas lo nombra sin rutas');
    assert.equal(listArtifacts(s.db, {kind: 'texture'}).length, 1);
    const entry = listCatalog(s.db, {source: 'meshy'})[0];
    assert.equal(entry.license, 'Meshy (según plan)');
    assert.ok(existsSync(entry.thumbnailPath!));
    assert.equal(budgetSummary(s.db, 'workspace', 'default').spent.meshyCredits, 5, 'se ajusta al gasto real de Meshy');
    assert.equal(s.runs()[0].metadata.stage, 'Guardado');
  } finally { await s.close(); }
});

test('presupuesto agotado: Decisión abierta por spend y ningún job creado', async () => {
  const s = await setup({}, 10);
  try {
    await assert.rejects(s.gen({prompt: 'caja', mode: 'refine', previewTaskId: 'job-0'}), /budget_exceeded/);
    assert.equal(s.fake.created.length, 0);
    assert.equal(listDecisions(s.db, 'open')[0].reason, 'Presupuesto agotado: meshyCredits');
    assert.equal(s.runs()[0].state, 'failed');
  } finally { await s.close(); }
});

test('solo hard surface: rig, animate u otro kind → meshy_kind_not_allowed sin gastar', async () => {
  const s = await setup();
  try {
    for (const kind of ['rig', 'animate', 'video'])
      await assert.rejects(s.gen({}, {kind}), /meshy_kind_not_allowed/);
    assert.equal(s.runs().length, 0);
    assert.equal(s.fake.created.length, 0);
  } finally { await s.close(); }
});

test('aiForbidden en la entrada de origen → asset_ai_forbidden', async () => {
  const s = await setup();
  try {
    const entry = upsertEntry(s.db, {name: 'Pack prohibido', category: 'pack', description: '', source: 'fab', aiForbidden: 1});
    await assert.rejects(s.gen({imageUrl: 'https://x/y.png', sourceEntryId: entry.id}, {kind: 'image'}), /asset_ai_forbidden/);
    assert.equal(s.fake.created.length, 0);
  } finally { await s.close(); }
});

test('respuesta perdida tras cobrar: el reintento y el arranque reconcilian sin crear un segundo job', async () => {
  const s = await setup({dropCreate: true});
  try {
    await assert.rejects(s.gen({prompt: 'caja de munición metálica', mode: 'preview'}, {}, 'clave-1'));
    assert.equal(s.fake.created.length, 1);
    assert.equal(s.runs()[0].metadata.remoteId, undefined);
    const retry = await s.gen({prompt: 'caja de munición metálica', mode: 'preview'}, {}, 'clave-1');
    assert.equal(retry.reconciled, 'adopted');
    assert.equal(s.fake.created.length, 1, 'misma clave, un solo job');
    assert.equal(s.runs()[0].metadata.remoteId, 'job-1');
    assert.equal(s.db.prepare("select count(*) n from commands where type='asset.meshy_poll'").get()!.n, 1);
    // arranque con un run huérfano cuyo job no existe en Meshy: se marca fallido y no se relanza
    const orphan = (await import('../../service/src/repo/runs.ts')).startRun(s.db, {taskId: s.task.id, role: 'arte', provider: 'meshy',
      metadata: {kind: 'text', prompt: 'otra cosa', idempotencyKey: 'clave-2'}});
    assert.equal(await recoverMeshy(s.db, s.deps.meshy()), 1);
    assert.equal(filtered<Run>(s.db, 'runs', {}).find(r => r.id === orphan.id)!.state, 'failed');
    assert.ok(types(s.db).includes('meshy.job.unconfirmed'));
    assert.equal(s.fake.created.length, 1);
  } finally { await s.close(); }
});

test('enlace vencido (404): artefacto sin previewPath, evento y sin entrada de catálogo', async () => {
  const s = await setup({expired: true});
  try {
    const {runId} = await s.gen({prompt: 'caja', mode: 'preview'});
    await s.tick(runId);
    const done = await s.tick(runId);
    assert.equal(done.model, null);
    const [model] = listArtifacts(s.db, {kind: 'model'});
    assert.equal(model.previewPath, null);
    assert.equal((model.provenance as any).kind, 'text');
    assert.ok(types(s.db).includes('meshy.link_expired'));
    assert.equal(listCatalog(s.db, {source: 'meshy'}).length, 0);
  } finally { await s.close(); }
});
