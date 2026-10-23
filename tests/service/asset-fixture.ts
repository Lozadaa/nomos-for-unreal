import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb } from '../../service/src/db.ts';
import { indexAll } from '../../service/src/catalog/indexer.ts';
import { assetConfig } from '../../service/src/catalog/paths.ts';
import { createUnrealCmd } from '../../service/src/adapters/unreal-cmd.ts';
import { createAssetHandlers } from '../../service/src/handlers/asset.ts';
import { listCatalog } from '../../service/src/repo/catalog.ts';
import type { WorkerContext } from '../../service/src/runner.ts';
import type { Command } from '../../service/src/model.ts';
import { fabFixture } from './fab-fixture.ts';

const fake = join(import.meta.dirname, '..', 'fakes', 'unreal-cmd.mjs');

/** Catálogo indexado de fab-fixture más un juego vacío (`Juego/Juego.uproject`) como proyecto del servicio. */
export function assetFixture(extra: Parameters<typeof createAssetHandlers>[0] = {}) {
  const f = fabFixture(), db = openDb(':memory:');
  const projectDir = join(f.root, 'Juego');
  mkdirSync(join(projectDir, 'Content'), {recursive: true});
  writeFileSync(join(projectDir, 'Juego.uproject'), '{}');
  indexAll(db, assetConfig(f.dataDir));
  const ctx = {db, dataDir: f.dataDir, projectDir} as unknown as WorkerContext;
  const handlers = createAssetHandlers({unreal: () => createUnrealCmd({bin: process.execPath, baseArgs: [fake]}), ...extra});
  const run = (type: string, payload: object, id = randomUUID()) =>
    handlers[type]({id, type, payload, idempotencyKey: id} as unknown as Command, ctx) as Promise<Record<string, any>>;
  const entry = (name: string, project?: string) => listCatalog(db).find(e => e.name === name && (!project || e.projects.includes(project)))!;
  return {...f, db, ctx, projectDir, run, entry, close() { db.close(); f.close(); }};
}
