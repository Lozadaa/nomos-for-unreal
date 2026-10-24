import type { DatabaseSync } from 'node:sqlite';
import type { CatalogEntry } from '../model.ts';
import { findEntry, upsertEntry } from '../repo/catalog.ts';
import { transaction } from '../repo/rows.ts';
import type { AssetConfig, CatalogEntryInput } from './paths.ts';
import * as listings from './sources/listings.ts';
import * as launcherVault from './sources/launcherVault.ts';
import * as fabCache from './sources/fabCache.ts';
import * as projects from './sources/projects.ts';
import * as megascans from './sources/megascans.ts';
import * as engine from './sources/engine.ts';

const rank: Record<CatalogEntry['state'], number> = {owned: 0, downloaded: 1, cached: 2, imported: 3};
const lists = ['projects', 'formats', 'engineVersions', 'tags'] as const;
const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

/** Une las vistas de un mismo asset: estado más avanzado, listas unidas y, en lo demás, la primera fuente que lo sabe. */
export function merge(a: CatalogEntryInput, b: CatalogEntryInput): CatalogEntryInput {
  const out: CatalogEntryInput = {...a};
  for (const [key, value] of Object.entries(b) as [keyof CatalogEntryInput, unknown][])
    if (out[key] === undefined || out[key] === null) (out as Record<string, unknown>)[key] = value;
  for (const key of lists) out[key] = union(a[key], b[key]);
  out.state = rank[b.state ?? 'owned'] > rank[a.state ?? 'owned'] ? b.state : a.state;
  out.aiForbidden = a.aiForbidden || b.aiForbidden ? 1 : 0;
  return out;
}

export function scanAll(config: AssetConfig): {inputs: CatalogEntryInput[]; bySource: Record<string, number>} {
  const vault = launcherVault.scan(config);
  const byPack = new Map(vault.map(entry => [entry.name, entry]));
  const found = {listings: listings.scan(config), launcherVault: vault, fabCache: fabCache.scan(config),
    projects: projects.scan(config, byPack), megascans: megascans.scan(config), engine: engine.scan(config)};
  const groups = new Map<string, CatalogEntryInput>();
  for (const input of Object.values(found).flat()) {
    const key = input.fabUid ? 'fab:' + input.fabUid : 'path:' + (input.localPath ?? input.name).toLowerCase();
    groups.set(key, groups.has(key) ? merge(groups.get(key)!, input) : input);
  }
  return {inputs: [...groups.values()], bySource: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length]))};
}

/** Idempotente: cada asset conserva su `id`, su licencia y los proyectos ya conocidos entre ejecuciones. */
export function indexAll(db: DatabaseSync, config: AssetConfig): {entries: number; bySource: Record<string, number>} {
  const {inputs, bySource} = scanAll(config);
  transaction(db, () => {
    for (const input of inputs) {
      const old = findEntry(db, input.source, {fabUid: input.fabUid, localPath: input.localPath});
      upsertEntry(db, old ? {...input, id: old.id, license: input.license ?? old.license,
        projects: union(old.projects, input.projects)} : input);
    }
  });
  return {entries: inputs.length, bySource};
}
