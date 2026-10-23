import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssetConfig, CatalogEntryInput } from '../paths.ts';
import { packDir, subdirs } from './fs.ts';

/** El manifiesto del Launcher es binario; de él solo se leen el listado de Fab y las versiones `UE_x.y` declaradas. */
export function readManifest(file: string): {fabUid: string | null; engineVersions: string[]} {
  let text = '';
  try { text = readFileSync(file).toString('latin1'); } catch { return {fabUid: null, engineVersions: []}; }
  const fabUid = text.match(/fab\.com\/listings\/([0-9a-f-]{36})/)?.[1] ?? null;
  const engineVersions = [...new Set([...text.matchAll(/UE_(\d+\.\d+)/g)].map(m => m[1]))].sort();
  return {fabUid, engineVersions};
}

export function scan(config: AssetConfig): CatalogEntryInput[] {
  return subdirs(config.vaultDir).flatMap(app => {
    const content = join(config.vaultDir, app, 'data', 'Content');
    const {fabUid, engineVersions} = readManifest(join(config.vaultDir, app, 'manifest'));
    return subdirs(content).filter(packDir).map(pack => ({
      source: 'fab' as const, name: pack, category: 'pack', description: `Pack del Launcher en caché (${app})`,
      state: 'cached' as const, fabUid, localPath: join(content, pack), formats: ['uasset'], engineVersions, tags: [app],
    }));
  });
}
